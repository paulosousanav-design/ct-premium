import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'
import { calcularRateioDespesas } from '@/lib/calculos-rotas'
import { cabecalhosAuditoria, type AtorAuditoria } from '@/lib/auditoria-contexto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const METODOS = new Set(['IGUAL', 'RECEITA', 'QUILOMETRAGEM'])
const STATUS = new Set(['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'])
const TIPOS_DESPESA = new Set(['COMBUSTIVEL', 'PEDAGIO', 'ALIMENTACAO', 'HOSPEDAGEM', 'ESTACIONAMENTO', 'OUTRA'])
const FINALIDADES = new Set(['COLETA', 'ATENDIMENTO', 'ENTREGA', 'RETORNO', 'OUTRA'])

function getSupabaseAdmin(request?: NextRequest, ator?: AtorAuditoria) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: request && ator ? { headers: cabecalhosAuditoria(request, ator) } : undefined,
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'rotas')
    if (!auth.ok) return auth.response
    const supabase = getSupabaseAdmin()

    if (!(await tabelaExiste(supabase, 'rotas'))) {
      return NextResponse.json({
        estruturaPendente: true,
        rotas: [],
        despesas: [],
        vinculos: [],
        ordensDisponiveis: [],
        tecnicos: [],
      })
    }

    const [{ data: rotas, error: rotasError }, { data: tecnicos, error: tecnicosError }] = await Promise.all([
      supabase.from('rotas').select('*').eq('unidade_id', auth.unidadeId).order('data_inicio', { ascending: false }).limit(150),
      supabase.from('parceiros').select('id, responsavel, nome_fantasia, tipo_vinculo, status').eq('status', 'ATIVO').order('responsavel'),
    ])
    if (rotasError) throw rotasError
    if (tecnicosError) throw tecnicosError

    const rotaIds = (rotas ?? []).map((item) => Number(item.id))
    const [{ data: despesas, error: despesasError }, { data: vinculos, error: vinculosError }] = rotaIds.length
      ? await Promise.all([
          supabase.from('rota_despesas').select('*').in('rota_id', rotaIds).order('data_despesa'),
          supabase.from('rota_ordens').select('*').in('rota_id', rotaIds).order('vinculado_em'),
        ])
      : [{ data: [], error: null }, { data: [], error: null }]
    if (despesasError) throw despesasError
    if (vinculosError) throw vinculosError

    const osVinculadasIds = [...new Set((vinculos ?? []).map((item) => Number(item.os_id)))]
    const { data: ordensVinculadas, error: vinculadasError } = osVinculadasIds.length
      ? await supabase
          .from('ordens_servico')
          .select('id, numero_os, status, modelo, cliente_total, total, clientes:cliente_id(nome), garantidores:garantidor_id(nome)')
          .in('id', osVinculadasIds)
      : { data: [], error: null }
    if (vinculadasError) throw vinculadasError

    const { data: ordensBase, error: ordensError } = await supabase
      .from('ordens_servico')
      .select('id, numero_os, status, modelo, cliente_total, total, clientes:cliente_id(nome), garantidores:garantidor_id(nome)')
      .eq('unidade_id', auth.unidadeId)
      .not('status', 'eq', 'ENCERRADA_SEM_REPARO')
      .order('created_at', { ascending: false })
      .limit(500)
    if (ordensError) throw ordensError

    const ordensMap = new Map((ordensVinculadas ?? []).map((item) => [Number(item.id), item]))
    const vinculosComOrdem = (vinculos ?? []).map((item) => ({ ...item, ordem: ordensMap.get(Number(item.os_id)) ?? null }))

    return NextResponse.json({
      estruturaPendente: false,
      rotas: rotas ?? [],
      despesas: despesas ?? [],
      vinculos: vinculosComOrdem,
      ordensDisponiveis: ordensBase ?? [],
      tecnicos: tecnicos ?? [],
    })
  } catch (error) {
    return NextResponse.json({ error: formatarErro(error, 'Erro ao carregar gestao de rotas.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'rotas')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const acao = String(body?.acao ?? '').toUpperCase()
    const supabase = getSupabaseAdmin(request, auth)

    if (!(await tabelaExiste(supabase, 'rotas'))) {
      return NextResponse.json({ error: 'Execute o arquivo supabase-add-gestao-rotas.sql no Supabase.' }, { status: 400 })
    }

    if (acao === 'CRIAR') {
      const origem = texto(body?.origem)
      const destino = texto(body?.destino)
      const dataInicio = texto(body?.dataInicio)
      const metodoRateio = normalizar(body?.metodoRateio, METODOS, 'RECEITA')
      if (!origem || !destino || !dataInicio) {
        return NextResponse.json({ error: 'Informe origem, destino e data inicial.' }, { status: 400 })
      }
      const { data: rota, error } = await supabase.from('rotas').insert({
        unidade_id: auth.unidadeId,
        origem,
        destino,
        data_inicio: dataInicio,
        data_fim: texto(body?.dataFim) || null,
        parceiro_id: numeroPositivo(body?.parceiroId) || null,
        motorista_nome: texto(body?.motoristaNome) || null,
        veiculo: texto(body?.veiculo) || null,
        km_total: numeroNaoNegativo(body?.kmTotal),
        metodo_rateio: metodoRateio,
        observacao: texto(body?.observacao) || null,
        criado_por_nome: auth.nome,
        criado_por_email: auth.email,
      }).select('id').single()
      if (error) throw error
      const numeroRota = `RT${new Date(`${dataInicio}T12:00:00`).getFullYear()}${String(rota.id).padStart(5, '0')}`
      const { error: numeroError } = await supabase.from('rotas').update({ numero_rota: numeroRota }).eq('id', rota.id)
      if (numeroError) throw numeroError
      return NextResponse.json({ ok: true, id: rota.id, numeroRota })
    }

    const rotaId = numeroPositivo(body?.rotaId)
    if (!rotaId) return NextResponse.json({ error: 'Rota invalida.' }, { status: 400 })
    const rota = await carregarRotaAutorizada(supabase, rotaId, auth.unidadeId)
    if (!rota) return NextResponse.json({ error: 'Rota nao encontrada nesta unidade.' }, { status: 404 })
    if (rota.status === 'CANCELADA' && acao !== 'ATUALIZAR') {
      return NextResponse.json({ error: 'Uma rota cancelada nao pode receber alteracoes operacionais.' }, { status: 400 })
    }

    if (acao === 'ATUALIZAR') {
      const metodoRateio = normalizar(body?.metodoRateio, METODOS, String(rota.metodo_rateio ?? 'RECEITA'))
      const status = normalizar(body?.status, STATUS, String(rota.status ?? 'PLANEJADA'))
      const payload: Record<string, unknown> = {
        metodo_rateio: metodoRateio,
        status,
        atualizado_por_nome: auth.nome,
        atualizado_por_email: auth.email,
        atualizado_em: new Date().toISOString(),
      }
      if (body?.origem !== undefined) payload.origem = texto(body.origem) || rota.origem
      if (body?.destino !== undefined) payload.destino = texto(body.destino) || rota.destino
      if (body?.dataInicio !== undefined) payload.data_inicio = texto(body.dataInicio) || rota.data_inicio
      if (body?.dataFim !== undefined) payload.data_fim = texto(body.dataFim) || null
      if (body?.parceiroId !== undefined) payload.parceiro_id = numeroPositivo(body.parceiroId) || null
      if (body?.motoristaNome !== undefined) payload.motorista_nome = texto(body.motoristaNome) || null
      if (body?.veiculo !== undefined) payload.veiculo = texto(body.veiculo) || null
      if (body?.kmTotal !== undefined) payload.km_total = numeroNaoNegativo(body.kmTotal)
      if (body?.observacao !== undefined) payload.observacao = texto(body.observacao) || null
      const { error } = await supabase.from('rotas').update(payload).eq('id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, metodoRateio)
      return NextResponse.json({ ok: true })
    }

    if (acao === 'ADICIONAR_DESPESA') {
      const tipo = normalizar(body?.tipo, TIPOS_DESPESA, 'OUTRA')
      const valor = dinheiro(body?.valor)
      if (valor <= 0) return NextResponse.json({ error: 'Informe um valor de despesa maior que zero.' }, { status: 400 })
      const { error } = await supabase.from('rota_despesas').insert({
        rota_id: rotaId,
        tipo,
        descricao: texto(body?.descricao) || null,
        valor,
        data_despesa: texto(body?.dataDespesa) || new Date().toISOString().slice(0, 10),
        criado_por_nome: auth.nome,
        criado_por_email: auth.email,
      })
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (acao === 'EXCLUIR_DESPESA') {
      const despesaId = numeroPositivo(body?.despesaId)
      if (!despesaId) return NextResponse.json({ error: 'Despesa invalida.' }, { status: 400 })
      const { error } = await supabase.from('rota_despesas').delete().eq('id', despesaId).eq('rota_id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (acao === 'VINCULAR_OS') {
      const osId = numeroPositivo(body?.osId)
      if (!osId) return NextResponse.json({ error: 'Selecione uma ordem de servico.' }, { status: 400 })
      const { data: ordem, error: ordemError } = await supabase.from('ordens_servico')
        .select('id, unidade_id, cliente_total, total').eq('id', osId).maybeSingle()
      if (ordemError) throw ordemError
      if (!ordem || Number(ordem.unidade_id) !== auth.unidadeId) {
        return NextResponse.json({ error: 'OS nao encontrada nesta unidade.' }, { status: 404 })
      }
      const { error } = await supabase.from('rota_ordens').insert({
        rota_id: rotaId,
        os_id: osId,
        finalidade: normalizar(body?.finalidade, FINALIDADES, 'ATENDIMENTO'),
        km_referencia: numeroNaoNegativo(body?.kmReferencia),
        receita_referencia: dinheiro(ordem.cliente_total ?? ordem.total),
        vinculado_por_nome: auth.nome,
        vinculado_por_email: auth.email,
      })
      if (error) {
        if (String(error.code) === '23505') {
          return NextResponse.json({ error: 'Esta OS ja esta vinculada a esta rota.' }, { status: 409 })
        }
        throw error
      }
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (acao === 'ATUALIZAR_KM_OS') {
      const vinculoId = numeroPositivo(body?.vinculoId)
      const { error } = await supabase.from('rota_ordens')
        .update({ km_referencia: numeroNaoNegativo(body?.kmReferencia) })
        .eq('id', vinculoId).eq('rota_id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (acao === 'DESVINCULAR_OS') {
      const vinculoId = numeroPositivo(body?.vinculoId)
      const { error } = await supabase.from('rota_ordens').delete().eq('id', vinculoId).eq('rota_id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: formatarErro(error, 'Erro ao atualizar gestao de rotas.') }, { status: 500 })
  }
}

async function carregarRotaAutorizada(supabase: ReturnType<typeof getSupabaseAdmin>, rotaId: number, unidadeId: number) {
  const { data, error } = await supabase.from('rotas').select('*').eq('id', rotaId).eq('unidade_id', unidadeId).maybeSingle()
  if (error) throw error
  return data
}

async function recalcularRateio(supabase: ReturnType<typeof getSupabaseAdmin>, rotaId: number, metodo: string) {
  const [{ data: despesas, error: despesasError }, { data: vinculos, error: vinculosError }] = await Promise.all([
    supabase.from('rota_despesas').select('valor').eq('rota_id', rotaId),
    supabase.from('rota_ordens').select('id, os_id, km_referencia, receita_referencia').eq('rota_id', rotaId).order('id'),
  ])
  if (despesasError) throw despesasError
  if (vinculosError) throw vinculosError
  if (!vinculos?.length) return

  const osIds = vinculos.map((item) => Number(item.os_id))
  const { data: ordens, error: ordensError } = await supabase
    .from('ordens_servico')
    .select('id, cliente_total, total')
    .in('id', osIds)
  if (ordensError) throw ordensError
  const receitasAtuais = new Map((ordens ?? []).map((item) => [
    Number(item.id),
    dinheiro(item.cliente_total ?? item.total),
  ]))
  const totalDespesas = (despesas ?? []).reduce((acc, item) => acc + Number(item.valor ?? 0), 0)
  const pesos = vinculos.map((item) => metodo === 'QUILOMETRAGEM'
    ? numeroNaoNegativo(item.km_referencia)
    : metodo === 'RECEITA'
      ? receitasAtuais.get(Number(item.os_id)) ?? numeroNaoNegativo(item.receita_referencia)
      : 1)
  const rateio = calcularRateioDespesas(totalDespesas, pesos)

  for (let index = 0; index < vinculos.length; index += 1) {
    const { error } = await supabase.from('rota_ordens').update({
      receita_referencia: receitasAtuais.get(Number(vinculos[index].os_id)) ?? numeroNaoNegativo(vinculos[index].receita_referencia),
      percentual_rateio: rateio[index].percentual,
      custo_rateado: rateio[index].valor,
    }).eq('id', vinculos[index].id)
    if (error) throw error
  }
}

async function tabelaExiste(supabase: ReturnType<typeof getSupabaseAdmin>, tabela: string) {
  const { error } = await supabase.from(tabela).select('id').limit(0)
  return !error
}

function texto(value: unknown) { return String(value ?? '').trim() }
function numeroPositivo(value: unknown) { const numero = Number(value); return Number.isFinite(numero) && numero > 0 ? numero : 0 }
function numeroNaoNegativo(value: unknown) { const numero = Number(value); return Number.isFinite(numero) && numero >= 0 ? numero : 0 }
function dinheiro(value: unknown) { return Math.round(numeroNaoNegativo(value) * 100) / 100 }
function normalizar(value: unknown, opcoes: Set<string>, fallback: string) {
  const normalizado = texto(value).toUpperCase()
  return opcoes.has(normalizado) ? normalizado : fallback
}
function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return fallback
}
