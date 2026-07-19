import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type RelacaoNome = { nome?: string | null }
type RelacaoCliente = RelacaoNome & { whatsapp?: string | null }
type OrdemAprovacao = Record<string, unknown> & {
  id: number
  status?: string | null
  created_at: string
  clientes?: RelacaoCliente | RelacaoCliente[] | null
  categorias?: RelacaoNome | RelacaoNome[] | null
  marcas?: RelacaoNome | RelacaoNome[] | null
}

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'aprovacao')
    if (!auth.ok) return auth.response
    const supabase = db()
    const { data, error } = await supabase.from('ordens_servico').select(`
      id, numero_os, status, orcamento_status, orcamento_resposta_em, total,
      valor_pecas, valor_mao_obra, desconto, tecnico_valor_pecas, tecnico_valor_mao_obra,
      tecnico_desconto, tecnico_total, cliente_valor_pecas, cliente_valor_mao_obra,
      cliente_desconto, cliente_total, garantia, created_at, modelo, diagnostico_tecnico,
      servico_executado, pecas_utilizadas, categoria_id, marca_id, cliente_id,
      clientes:cliente_id ( nome, whatsapp ), categorias:categoria_id ( nome ), marcas:marca_id ( nome )
    `).eq('unidade_id', auth.unidadeId).order('created_at', { ascending: false })
    if (error) throw error

    const ordens = (data ?? []) as unknown as OrdemAprovacao[]
    const osIds = ordens.map((item) => Number(item.id)).filter(Boolean)
    const fotosMap = new Map<number, number>()
    if (osIds.length) {
      const { data: fotos, error: fotosError } = await supabase.from('os_fotos').select('os_id').in('os_id', osIds)
      if (fotosError) throw fotosError
      for (const foto of fotos ?? []) {
        const osId = Number(foto.os_id)
        fotosMap.set(osId, (fotosMap.get(osId) ?? 0) + 1)
      }
    }

    const formatado = ordens.map((item) => {
      const cliente = primeira(item.clientes)
      return {
        ...item,
        clientes: undefined,
        categorias: undefined,
        marcas: undefined,
        cliente_nome: cliente?.nome ?? '-',
        cliente_whatsapp: cliente?.whatsapp ?? null,
        categoria_nome: primeira(item.categorias)?.nome ?? null,
        marca_nome: primeira(item.marcas)?.nome ?? null,
        fotos_count: fotosMap.get(Number(item.id)) ?? 0,
      }
    }).sort((a, b) => {
      const pesoA = a.status === 'AGUARDANDO_REVISAO' ? 0 : 1
      const pesoB = b.status === 'AGUARDANDO_REVISAO' ? 0 : 1
      if (pesoA !== pesoB) return pesoA - pesoB
      return new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime()
    })

    return NextResponse.json({ data: formatado })
  } catch (error) {
    return respostaErro(error, 'Erro ao carregar aprovacoes.')
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'aprovacao')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const acao = String(body?.acao ?? '').toUpperCase()
    if (!id || !['ALTERAR_STATUS', 'ENVIAR_CLIENTE'].includes(acao)) {
      return NextResponse.json({ error: 'Acao ou OS invalida.' }, { status: 400 })
    }

    const supabase = db()
    const { data: ordem, error: ordemError } = await supabase.from('ordens_servico')
      .select('id, status, prioridade, orcamento_status').eq('id', id).eq('unidade_id', auth.unidadeId).maybeSingle()
    if (ordemError) throw ordemError
    if (!ordem) return NextResponse.json({ error: 'OS nao encontrada nesta unidade.' }, { status: 404 })

    const statusAnterior = String(ordem.status ?? 'NOVA')
    const prioridade = String(ordem.prioridade ?? 'NORMAL')
    const responsavel = `${auth.nome} (${auth.email})`
    let statusNovo = 'AGUARDANDO_APROVACAO'
    let historicoAcao = 'ORCAMENTO_ENVIADO_CLIENTE'
    let descricao = 'Orcamento revisado pelo administrativo e enviado ao cliente.'
    let update: Record<string, unknown> = {
      status: statusNovo,
      orcamento_status: ordem.orcamento_status ?? 'PENDENTE',
    }

    if (acao === 'ALTERAR_STATUS') {
      const novoStatus = String(body?.novoStatus ?? '').toUpperCase()
      if (!['APROVADO', 'REPROVADO'].includes(novoStatus)) {
        return NextResponse.json({ error: 'Status de orcamento invalido.' }, { status: 400 })
      }
      statusNovo = novoStatus === 'REPROVADO'
        ? 'FINALIZADA'
        : ['NOVA', 'EM_TRIAGEM', 'AGUARDANDO_REVISAO', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_PECA'].includes(statusAnterior)
          ? 'EM_ATENDIMENTO'
          : statusAnterior
      update = { orcamento_status: novoStatus, orcamento_resposta_em: new Date().toISOString(), status: statusNovo }
      historicoAcao = novoStatus === 'APROVADO' ? 'ORCAMENTO_APROVADO' : 'ORCAMENTO_REPROVADO'
      descricao = novoStatus === 'APROVADO'
        ? 'Orcamento aprovado manualmente no administrativo.'
        : 'Orcamento reprovado manualmente no administrativo.'
      if (novoStatus === 'REPROVADO') {
        const visita = Math.max(0, Number(body?.valorVisitaTecnico ?? 0) || 0)
        Object.assign(update, {
          valor_pecas: 0, valor_mao_obra: 0, desconto: 0, total: 0,
          cliente_valor_pecas: 0, cliente_valor_mao_obra: 0, cliente_desconto: 0, cliente_total: 0,
          tecnico_valor_pecas: 0, tecnico_valor_mao_obra: visita, tecnico_desconto: 0, tecnico_total: visita,
          bloqueada: true, finalizada_em: new Date().toISOString(),
        })
      }
    }

    const { error: updateError } = await supabase.from('ordens_servico').update(update).eq('id', id).eq('unidade_id', auth.unidadeId)
    if (updateError) throw updateError
    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: id, acao: historicoAcao, status_anterior: statusAnterior, status_novo: statusNovo,
      prioridade_anterior: prioridade, prioridade_nova: prioridade, descricao, responsavel,
    })
    if (historicoError) throw historicoError
    return NextResponse.json({ ok: true })
  } catch (error) {
    return respostaErro(error, 'Erro ao atualizar o orcamento.')
  }
}

function primeira<T>(value?: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value
}

function respostaErro(error: unknown, fallback: string) {
  console.error(fallback, error)
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 })
}
