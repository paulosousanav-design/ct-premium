import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminEscopoGerencial } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function escopo<T>(query: T, unidadeId: number | null, permitidas: number[]) {
  const builder = query as T & { eq: (column: string, value: unknown) => T; in: (column: string, values: number[]) => T }
  return unidadeId ? builder.eq('unidade_id', unidadeId) : builder.in('unidade_id', permitidas)
}

function filtros<T>(query: T, origem: string, garantidorId: number) {
  const builder = query as T & { eq: (column: string, value: unknown) => T; or: (value: string) => T }
  let result = query
  if (origem === 'CLIENTE') result = builder.or('garantia.is.false,garantia.is.null')
  if (origem === 'GARANTIDOR') result = (result as typeof builder).eq('garantia', true)
  if (garantidorId) result = (result as typeof builder).eq('garantidor_id', garantidorId)
  return result
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminEscopoGerencial(request, 'dashboard')
    if (!auth.ok) return auth.response
    const supabase = db()
    const origem = String(request.nextUrl.searchParams.get('origem') ?? 'TODOS').toUpperCase()
    const garantidorId = Number(request.nextUrl.searchParams.get('garantidor') ?? 0) || 0
    const limite = new Date()
    limite.setDate(limite.getDate() - 3)

    let resumoQuery = supabase.from('ordens_servico').select('cliente_id, parceiro_id').limit(5000)
    resumoQuery = escopo(resumoQuery, auth.unidadeId, auth.unidadesPermitidas)
    let semTecnicoQuery = supabase.from('ordens_servico').select('*', { count: 'exact', head: true })
      .is('parceiro_id', null).lte('created_at', limite.toISOString())
      .not('status', 'in', '("FINALIZADA","CANCELADA","ENCERRADA_SEM_REPARO")')
    semTecnicoQuery = filtros(semTecnicoQuery, origem, garantidorId)
    semTecnicoQuery = escopo(semTecnicoQuery, auth.unidadeId, auth.unidadesPermitidas)
    let pendentesQuery = supabase.from('ordens_servico').select('*', { count: 'exact', head: true }).eq('status', 'AGUARDANDO_APROVACAO')
    pendentesQuery = filtros(pendentesQuery, origem, garantidorId)
    pendentesQuery = escopo(pendentesQuery, auth.unidadeId, auth.unidadesPermitidas)
    let ultimasQuery = supabase.from('ordens_servico').select('id, numero_os, status, prioridade, created_at')
      .order('created_at', { ascending: false }).limit(8)
    ultimasQuery = filtros(ultimasQuery, origem, garantidorId)
    ultimasQuery = escopo(ultimasQuery, auth.unidadeId, auth.unidadesPermitidas)
    let volumeQuery = supabase.from('ordens_servico').select('id, created_at').order('created_at', { ascending: false }).limit(500)
    volumeQuery = filtros(volumeQuery, origem, garantidorId)
    volumeQuery = escopo(volumeQuery, auth.unidadeId, auth.unidadesPermitidas)

    const [resumo, notificacoes, semTecnico, pendentes, ultimas, volume, historico, garantidores] = await Promise.all([
      resumoQuery,
      supabase.from('notificacoes').select('*', { count: 'exact', head: true }),
      semTecnicoQuery,
      pendentesQuery,
      ultimasQuery,
      volumeQuery,
      supabase.from('os_historico').select('id, os_id, acao, status_anterior, status_novo, prioridade_anterior, prioridade_nova, descricao, responsavel, criado_em')
        .order('criado_em', { ascending: false }).limit(100),
      supabase.from('garantidores').select('id, nome').order('nome'),
    ])
    for (const resultado of [resumo, notificacoes, semTecnico, pendentes, ultimas, volume, historico, garantidores]) {
      if (resultado.error) throw resultado.error
    }
    const idsEscopo = new Set((volume.data ?? []).map((item) => Number(item.id)))
    return NextResponse.json({
      resumoEscopo: {
        clientes: new Set((resumo.data ?? []).map((item) => Number(item.cliente_id)).filter(Boolean)).size,
        tecnicos: new Set((resumo.data ?? []).map((item) => Number(item.parceiro_id)).filter(Boolean)).size,
      },
      notificacoes: notificacoes.count ?? 0,
      osSemTecnico3Dias: semTecnico.count ?? 0,
      orcamentosPendentes: pendentes.count ?? 0,
      ultimasOs: ultimas.data ?? [],
      volume: volume.data ?? [],
      historico: (historico.data ?? []).filter((item) => item.os_id && idsEscopo.has(Number(item.os_id))).slice(0, 6),
      garantidores: garantidores.data ?? [],
    })
  } catch (error) {
    return respostaErro(error, 'Erro ao carregar o dashboard.')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminEscopoGerencial(request, 'dashboard')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const statusNovo = String(body?.status ?? '').trim().toUpperCase()
    if (!id || !statusNovo) return NextResponse.json({ error: 'OS ou status invalido.' }, { status: 400 })
    const supabase = db()
    let ordemQuery = supabase.from('ordens_servico').select('id, numero_os, status, prioridade, unidade_id').eq('id', id)
    ordemQuery = escopo(ordemQuery, auth.unidadeId, auth.unidadesPermitidas)
    const { data: ordem, error } = await ordemQuery.maybeSingle()
    if (error) throw error
    if (!ordem) return NextResponse.json({ error: 'OS nao encontrada no escopo autorizado.' }, { status: 404 })
    const statusAnterior = String(ordem.status ?? 'NOVA')
    if (statusAnterior === statusNovo) return NextResponse.json({ ok: true })
    const { error: updateError } = await supabase.from('ordens_servico').update({ status: statusNovo }).eq('id', id).eq('unidade_id', ordem.unidade_id)
    if (updateError) throw updateError
    const prioridade = String(ordem.prioridade ?? 'NORMAL')
    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: id, acao: 'ALTERACAO_STATUS', status_anterior: statusAnterior, status_novo: statusNovo,
      prioridade_anterior: prioridade, prioridade_nova: prioridade,
      descricao: `Status alterado de ${statusAnterior} para ${statusNovo}`,
      responsavel: `${auth.nome} (${auth.email})`,
    })
    if (historicoError) throw historicoError
    return NextResponse.json({ ok: true })
  } catch (error) {
    return respostaErro(error, 'Erro ao atualizar o status da OS.')
  }
}

function respostaErro(error: unknown, fallback: string) {
  console.error(fallback, error)
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 })
}
