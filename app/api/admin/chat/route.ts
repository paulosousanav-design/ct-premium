import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'chat')
    if (!auth.ok) return auth.response
    const supabase = db()
    if (!(await estruturaExiste(supabase))) return NextResponse.json({ estruturaPendente: true, conversas: [], mensagens: [], usuarios: [], ordens: [], totalNaoLidas: 0 })

    await garantirCanais(supabase, auth.usuarioId, auth.unidadeId)
    const [{ data: conversas, error: conversasError }, { data: participantes, error: participantesError }, { data: leituras, error: leiturasError }] = await Promise.all([
      supabase.from('chat_conversas').select('id, tipo, nome, unidade_id, chave_unica, atualizado_em').order('atualizado_em', { ascending: false }),
      supabase.from('chat_participantes').select('conversa_id, admin_usuario_id, admin_usuarios:admin_usuario_id(id, nome, email, ativo, permissoes)'),
      supabase.from('chat_leituras').select('conversa_id, ultima_leitura_em, ultima_mensagem_id').eq('admin_usuario_id', auth.usuarioId),
    ])
    if (conversasError || participantesError || leiturasError) throw conversasError || participantesError || leiturasError

    const diretasDoUsuario = new Set((participantes ?? []).filter((item) => Number(item.admin_usuario_id) === auth.usuarioId).map((item) => Number(item.conversa_id)))
    const permitidas = (conversas ?? []).filter((conversa) => conversa.tipo === 'GERAL' || (conversa.tipo === 'UNIDADE' && Number(conversa.unidade_id) === auth.unidadeId) || (conversa.tipo === 'DIRETA' && diretasDoUsuario.has(Number(conversa.id))))
    const conversaIds = permitidas.map((item) => Number(item.id))
    const leituraPorConversa = new Map((leituras ?? []).map((item) => [Number(item.conversa_id), item]))

    let mensagens: Array<Record<string, unknown>> = []
    if (conversaIds.length) {
      const { data, error } = await supabase.from('chat_mensagens')
        .select('id, conversa_id, autor_id, conteudo, os_id, criado_em, autor:autor_id(id, nome, email), ordens_servico:os_id(id, numero_os, unidade_id)')
        .in('conversa_id', conversaIds).order('criado_em', { ascending: false }).limit(1200)
      if (error) throw error
      mensagens = (data ?? []) as unknown as Array<Record<string, unknown>>
      const unidadesPermitidas = new Set(auth.unidadesPermitidas)
      mensagens = mensagens.map((mensagem) => {
        const ordemRaw = mensagem.ordens_servico
        const ordem = (Array.isArray(ordemRaw) ? ordemRaw[0] : ordemRaw) as Record<string, unknown> | null
        return ordem && !unidadesPermitidas.has(Number(ordem.unidade_id))
          ? { ...mensagem, os_id: null, ordens_servico: null }
          : mensagem
      })
    }

    const participantesPorConversa = new Map<number, Array<Record<string, unknown>>>()
    for (const item of participantes ?? []) {
      const id = Number(item.conversa_id)
      participantesPorConversa.set(id, [...(participantesPorConversa.get(id) ?? []), item as unknown as Record<string, unknown>])
    }
    const unidadesIds = [...new Set(permitidas.map((item) => Number(item.unidade_id)).filter(Boolean))]
    const { data: unidades } = unidadesIds.length ? await supabase.from('unidades').select('id, nome_fantasia, tipo').in('id', unidadesIds) : { data: [] }
    const unidadePorId = new Map((unidades ?? []).map((item) => [Number(item.id), item]))

    const resumoConversas = permitidas.map((conversa) => {
      const itens = mensagens.filter((mensagem) => Number(mensagem.conversa_id) === Number(conversa.id))
      const leitura = leituraPorConversa.get(Number(conversa.id))
      const ultimaLeitura = String(leitura?.ultima_leitura_em ?? '1970-01-01T00:00:00Z')
      const naoLidas = itens.filter((mensagem) => Number(mensagem.autor_id) !== auth.usuarioId && String(mensagem.criado_em) > ultimaLeitura).length
      const participantesConversa = participantesPorConversa.get(Number(conversa.id)) ?? []
      const outro = participantesConversa.find((item) => Number(item.admin_usuario_id) !== auth.usuarioId)
      const outroUsuarioRaw = outro?.admin_usuarios
      const outroUsuario = (Array.isArray(outroUsuarioRaw) ? outroUsuarioRaw[0] : outroUsuarioRaw) as Record<string, unknown> | undefined
      const unidade = unidadePorId.get(Number(conversa.unidade_id))
      return {
        ...conversa,
        titulo: conversa.tipo === 'GERAL' ? 'Geral' : conversa.tipo === 'UNIDADE' ? `${unidade?.tipo === 'MATRIZ' ? 'Matriz' : 'Filial'} - ${unidade?.nome_fantasia ?? 'Unidade'}` : String(outroUsuario?.nome ?? outroUsuario?.email ?? 'Conversa direta'),
        naoLidas,
        ultimaMensagem: itens[0] ?? null,
      }
    })

    const conversaId = Number(request.nextUrl.searchParams.get('conversaId'))
    const mensagensSelecionadas = conversaId && conversaIds.includes(conversaId)
      ? mensagens.filter((mensagem) => Number(mensagem.conversa_id) === conversaId).slice(0, 200).reverse()
      : []
    const [{ data: usuarios }, { data: ordens }] = await Promise.all([
      supabase.from('admin_usuarios').select('id, nome, email, ativo, permissoes').eq('ativo', true).order('nome'),
      supabase.from('ordens_servico').select('id, numero_os, clientes:cliente_id(nome)').eq('unidade_id', auth.unidadeId).order('created_at', { ascending: false }).limit(150),
    ])
    const usuariosChat = (usuarios ?? []).filter((usuario) => Array.isArray(usuario.permissoes) && usuario.permissoes.includes('chat') && Number(usuario.id) !== auth.usuarioId)
    return NextResponse.json({
      estruturaPendente: false,
      usuarioAtual: { id: auth.usuarioId, nome: auth.nome, email: auth.email },
      conversas: resumoConversas,
      mensagens: mensagensSelecionadas,
      usuarios: usuariosChat,
      ordens: ordens ?? [],
      totalNaoLidas: resumoConversas.reduce((total, conversa) => total + conversa.naoLidas, 0),
    })
  } catch (error) {
    return NextResponse.json({ error: mensagemErro(error, 'Erro ao carregar chat interno.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'chat')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const acao = String(body?.acao ?? '').toUpperCase()
    const supabase = db()
    if (!(await estruturaExiste(supabase))) return NextResponse.json({ error: 'Rode o arquivo supabase-add-chat-interno.sql antes de usar o chat.' }, { status: 400 })

    if (acao === 'CRIAR_DIRETA') {
      const destinatarioId = Number(body?.destinatarioId)
      if (!destinatarioId || destinatarioId === auth.usuarioId) return NextResponse.json({ error: 'Selecione outro usuario.' }, { status: 400 })
      const { data: destinatario, error } = await supabase.from('admin_usuarios').select('id, ativo, permissoes').eq('id', destinatarioId).maybeSingle()
      if (error || !destinatario || destinatario.ativo === false || !Array.isArray(destinatario.permissoes) || !destinatario.permissoes.includes('chat')) return NextResponse.json({ error: 'Usuario sem acesso ao chat.' }, { status: 400 })
      const ids = [auth.usuarioId, destinatarioId].sort((a, b) => a - b)
      const chave = `DIRETA:${ids[0]}:${ids[1]}`
      const { data: conversa, error: conversaError } = await supabase.from('chat_conversas').upsert({ tipo: 'DIRETA', chave_unica: chave, criado_por_id: auth.usuarioId, atualizado_em: new Date().toISOString() }, { onConflict: 'chave_unica' }).select('id').single()
      if (conversaError) throw conversaError
      const { error: participantesError } = await supabase.from('chat_participantes').upsert(ids.map((id) => ({ conversa_id: conversa.id, admin_usuario_id: id })), { onConflict: 'conversa_id,admin_usuario_id' })
      if (participantesError) throw participantesError
      return NextResponse.json({ ok: true, conversaId: conversa.id })
    }

    const conversaId = Number(body?.conversaId)
    if (!conversaId || !(await podeAcessar(supabase, conversaId, auth.usuarioId, auth.unidadeId))) return NextResponse.json({ error: 'Conversa nao autorizada.' }, { status: 403 })

    if (acao === 'MARCAR_LIDA') {
      const ultimaMensagemId = Number(body?.ultimaMensagemId) || null
      const { error } = await supabase.from('chat_leituras').upsert({ conversa_id: conversaId, admin_usuario_id: auth.usuarioId, ultima_leitura_em: new Date().toISOString(), ultima_mensagem_id: ultimaMensagemId }, { onConflict: 'conversa_id,admin_usuario_id' })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (acao !== 'ENVIAR') return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 })
    const conteudo = String(body?.conteudo ?? '').trim()
    if (!conteudo || conteudo.length > 2000) return NextResponse.json({ error: 'A mensagem deve ter entre 1 e 2.000 caracteres.' }, { status: 400 })
    const osId = Number(body?.osId) || null
    if (osId) {
      const { data: ordem } = await supabase.from('ordens_servico').select('id').eq('id', osId).eq('unidade_id', auth.unidadeId).maybeSingle()
      if (!ordem) return NextResponse.json({ error: 'OS nao localizada na unidade ativa.' }, { status: 400 })
    }
    const { data: enviada, error } = await supabase.from('chat_mensagens').insert({ conversa_id: conversaId, autor_id: auth.usuarioId, conteudo, os_id: osId }).select('id').single()
    if (error) throw error
    await supabase.from('chat_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', conversaId)
    await supabase.from('chat_leituras').upsert({ conversa_id: conversaId, admin_usuario_id: auth.usuarioId, ultima_leitura_em: new Date().toISOString(), ultima_mensagem_id: enviada.id }, { onConflict: 'conversa_id,admin_usuario_id' })
    return NextResponse.json({ ok: true, mensagemId: enviada.id })
  } catch (error) {
    return NextResponse.json({ error: mensagemErro(error, 'Erro ao atualizar chat interno.') }, { status: 500 })
  }
}

async function estruturaExiste(supabase: ReturnType<typeof db>) {
  const { error } = await supabase.from('chat_mensagens').select('id').limit(0)
  return !error
}

async function garantirCanais(supabase: ReturnType<typeof db>, usuarioId: number, unidadeId: number) {
  const agora = new Date().toISOString()
  const { error } = await supabase.from('chat_conversas').upsert([
    { tipo: 'GERAL', nome: 'Geral', chave_unica: 'GERAL', criado_por_id: usuarioId, atualizado_em: agora },
    { tipo: 'UNIDADE', nome: 'Unidade', unidade_id: unidadeId, chave_unica: `UNIDADE:${unidadeId}`, criado_por_id: usuarioId, atualizado_em: agora },
  ], { onConflict: 'chave_unica', ignoreDuplicates: true })
  if (error) throw error
}

async function podeAcessar(supabase: ReturnType<typeof db>, conversaId: number, usuarioId: number, unidadeId: number) {
  const { data: conversa } = await supabase.from('chat_conversas').select('id, tipo, unidade_id').eq('id', conversaId).maybeSingle()
  if (!conversa) return false
  if (conversa.tipo === 'GERAL') return true
  if (conversa.tipo === 'UNIDADE') return Number(conversa.unidade_id) === unidadeId
  const { data: participante } = await supabase.from('chat_participantes').select('conversa_id').eq('conversa_id', conversaId).eq('admin_usuario_id', usuarioId).maybeSingle()
  return Boolean(participante)
}

function mensagemErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const item = error as Record<string, unknown>
    return [item.message, item.details, item.hint].filter(Boolean).map(String).join(' | ') || fallback
  }
  return fallback
}
