import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'
import { criarFingerprint, registrarEventoSistema } from '@/lib/monitoramento'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const verificacoes = [
  ['clientes', true],
  ['ordens_servico', true],
  ['os_historico', true],
  ['admin_usuarios', true],
  ['unidades', true],
  ['financeiro_historico', true],
  ['auditoria_eventos', true],
  ['sistema_eventos', true],
  ['chat_mensagens', false],
  ['seguranca_rate_limits', false],
] as const

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(request: NextRequest) {
  const inicioVerificacao = performance.now()
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response
    const supabase = db()

    const { error: tabelaError } = await supabase.from('sistema_eventos').select('id').limit(0)
    if (tabelaError && ['42P01', 'PGRST205'].includes(String(tabelaError.code))) {
      return NextResponse.json({
        estruturaPendente: true,
        eventos: [],
        resumo: resumoVazio(),
        saude: null,
        modulos: [],
      })
    }
    if (tabelaError) throw tabelaError

    const [abertos, criticos, recorrentes, ultimas24h] = await Promise.all([
      supabase.from('sistema_eventos').select('*', { count: 'exact', head: true }).eq('status', 'ABERTO'),
      supabase.from('sistema_eventos').select('*', { count: 'exact', head: true }).eq('status', 'ABERTO').eq('gravidade', 'CRITICO'),
      supabase.from('sistema_eventos').select('*', { count: 'exact', head: true }).eq('status', 'ABERTO').gte('ocorrencias', 3),
      supabase.from('sistema_eventos').select('*', { count: 'exact', head: true }).gte('ultima_ocorrencia_em', new Date(Date.now() - 86_400_000).toISOString()),
    ])
    for (const resultado of [abertos, criticos, recorrentes, ultimas24h]) {
      if (resultado.error) throw resultado.error
    }

    const resumo = {
      abertos: abertos.count ?? 0,
      criticos: criticos.count ?? 0,
      recorrentes: recorrentes.count ?? 0,
      ultimas24h: ultimas24h.count ?? 0,
    }
    if (request.nextUrl.searchParams.get('resumo') === '1') {
      return NextResponse.json({ estruturaPendente: false, resumo }, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }

    const params = request.nextUrl.searchParams
    const pagina = Math.max(Number(params.get('pagina')) || 1, 1)
    const limite = Math.min(Math.max(Number(params.get('limite')) || 50, 10), 100)
    const offset = (pagina - 1) * limite
    const status = opcao(params.get('status'), ['ABERTO', 'RESOLVIDO', 'IGNORADO'])
    const gravidade = opcao(params.get('gravidade'), ['INFO', 'ATENCAO', 'CRITICO'])
    const modulo = filtroTexto(params.get('modulo'))
    const busca = filtroTexto(params.get('busca')).replace(/[%(),]/g, ' ').replace(/\s+/g, ' ').trim()

    let query = supabase.from('sistema_eventos').select('*', { count: 'exact' })
    if (status) query = query.eq('status', status)
    if (gravidade) query = query.eq('gravidade', gravidade)
    if (modulo) query = query.eq('modulo', modulo)
    if (busca) query = query.or(`mensagem.ilike.%${busca}%,rota.ilike.%${busca}%,codigo.ilike.%${busca}%`)
    const { data: eventos, error, count } = await query
      .order('ultima_ocorrencia_em', { ascending: false })
      .range(offset, offset + limite - 1)
    if (error) throw error

    const [{ data: modulos }, saude] = await Promise.all([
      supabase.from('sistema_eventos').select('modulo').order('modulo'),
      verificarSaude(supabase),
    ])

    for (const componente of [...saude.verificacoes, ...saude.storage]) {
      const mensagem = 'tabela' in componente
        ? `Falha na verificacao da tabela ${componente.tabela}.`
        : `Storage ${componente.nome} indisponivel.`
      if (!componente.ok) {
        await registrarEventoSistema({
          tipo: 'SAUDE',
          gravidade: componente.critica ? 'CRITICO' : 'ATENCAO',
          modulo: 'INFRAESTRUTURA',
          origem: 'SAUDE',
          mensagem,
          codigo: 'SAUDE_COMPONENTE',
          detalhes: componente,
          request,
        })
      } else {
        const fingerprint = criarFingerprint({
          modulo: 'INFRAESTRUTURA',
          origem: 'SAUDE',
          rota: request.nextUrl.pathname,
          codigo: 'SAUDE_COMPONENTE',
          mensagem,
        })
        await supabase
          .from('sistema_eventos')
          .update({
            status: 'RESOLVIDO',
            resolvido_em: new Date().toISOString(),
            resolvido_por_nome: 'Sistema',
            resolucao_observacao: 'Componente recuperado automaticamente.',
          })
          .eq('fingerprint', fingerprint)
          .eq('status', 'ABERTO')
      }
    }

    return NextResponse.json({
      estruturaPendente: false,
      eventos: eventos ?? [],
      total: count ?? 0,
      pagina,
      limite,
      resumo,
      saude: {
        ...saude,
        latenciaMs: Math.round(performance.now() - inicioVerificacao),
        verificadoEm: new Date().toISOString(),
      },
      modulos: [...new Set((modulos ?? []).map((item) => String(item.modulo)))],
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    await registrarEventoSistema({
      error,
      modulo: 'MONITORAMENTO',
      origem: 'API',
      gravidade: 'CRITICO',
      request,
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar monitoramento.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const acao = String(body?.acao ?? '').toUpperCase()
    const observacao = String(body?.observacao ?? '').trim().slice(0, 1_000)
    if (!id || !['RESOLVER', 'IGNORAR', 'REABRIR'].includes(acao)) {
      return NextResponse.json({ error: 'Evento ou acao invalida.' }, { status: 400 })
    }

    const supabase = db()
    const agora = new Date().toISOString()
    const payload = acao === 'REABRIR'
      ? {
          status: 'ABERTO',
          resolvido_em: null,
          resolvido_por_nome: null,
          resolvido_por_email: null,
          resolucao_observacao: observacao || null,
          ultima_ocorrencia_em: agora,
        }
      : {
          status: acao === 'RESOLVER' ? 'RESOLVIDO' : 'IGNORADO',
          resolvido_em: agora,
          resolvido_por_nome: auth.nome,
          resolvido_por_email: auth.email,
          resolucao_observacao: observacao || null,
        }
    const { data, error } = await supabase
      .from('sistema_eventos')
      .update(payload)
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Evento nao encontrado.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    await registrarEventoSistema({
      error,
      modulo: 'MONITORAMENTO',
      origem: 'API',
      gravidade: 'ATENCAO',
      request,
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao atualizar evento.' },
      { status: 500 }
    )
  }
}

async function verificarSaude(supabase: ReturnType<typeof db>) {
  const resultados = await Promise.all(verificacoes.map(async ([tabela, critica]) => {
    const { error } = await supabase.from(tabela).select('*').limit(0)
    return { tabela, critica, ok: !error, erro: error ? String(error.message) : null }
  }))
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
  const storage = ['os-fotos', 'tecnico-documentos'].map((nome) => ({
    nome,
    critica: nome === 'os-fotos',
    ok: !bucketsError && Boolean((buckets ?? []).find((bucket) => bucket.name === nome)),
    erro: bucketsError ? String(bucketsError.message) : null,
  }))
  const falhaCritica = resultados.some((item) => item.critica && !item.ok)
    || storage.some((item) => item.critica && !item.ok)
  const atencao = resultados.some((item) => !item.ok) || storage.some((item) => !item.ok)
  return {
    status: falhaCritica ? 'FALHA' : atencao ? 'ATENCAO' : 'SAUDAVEL',
    verificacoes: resultados,
    storage,
  }
}

function resumoVazio() {
  return { abertos: 0, criticos: 0, recorrentes: 0, ultimas24h: 0 }
}

function filtroTexto(value: string | null) {
  return String(value ?? '').trim().toUpperCase().slice(0, 120)
}

function opcao(value: string | null, validas: string[]) {
  const normalizado = filtroTexto(value)
  return validas.includes(normalizado) ? normalizado : ''
}
