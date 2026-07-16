import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminEscopoGerencial } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type BaseCalculo = 'COMPETENCIA' | 'CAIXA'
type Registro = Record<string, unknown>

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminEscopoGerencial(request, 'dre')
    if (!auth.ok) return auth.response

    const hoje = new Date()
    const inicioPadrao = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const inicio = validarData(request.nextUrl.searchParams.get('inicio')) ?? dataInput(inicioPadrao)
    const fim = validarData(request.nextUrl.searchParams.get('fim')) ?? dataInput(hoje)
    const base: BaseCalculo = request.nextUrl.searchParams.get('base') === 'CAIXA' ? 'CAIXA' : 'COMPETENCIA'

    if (inicio > fim) return NextResponse.json({ error: 'A data inicial deve ser menor ou igual a data final.' }, { status: 400 })

    const supabase = db()
    const inicioIso = `${inicio}T00:00:00.000Z`
    const fimIso = `${fim}T23:59:59.999Z`
    const idsUnidades = auth.unidadeId ? [auth.unidadeId] : auth.unidadesPermitidas

    const [ordens, vendas, contas, recebimentos, pagamentosTecnicos] = await Promise.all([
      carregarOrdens(supabase, idsUnidades, inicioIso, fimIso, base),
      carregarVendas(supabase, idsUnidades, inicioIso, fimIso),
      carregarContas(supabase, idsUnidades),
      base === 'CAIXA' ? carregarHistorico(supabase, 'RECEBIMENTO_OS', inicioIso, fimIso) : Promise.resolve([]),
      base === 'CAIXA' ? carregarHistorico(supabase, 'PAGAMENTO_TECNICO', inicioIso, fimIso) : Promise.resolve([]),
    ])

    const ordemIds = ordens.map((item) => numero(item.id)).filter(Boolean)
    const vendaIds = vendas.map((item) => numero(item.id)).filter(Boolean)
    const [pecasOs, itensVenda, comissoesPagas] = await Promise.all([
      carregarPecasOs(supabase, ordemIds),
      carregarItensVenda(supabase, vendaIds),
      base === 'CAIXA' ? carregarComissoesPagas(supabase, inicioIso, fimIso, ordemIds) : Promise.resolve([]),
    ])

    const ordemPorId = new Map(ordens.map((item) => [numero(item.id), item]))
    const recebimentosEscopo = recebimentos.filter((item) => ordemPorId.has(numero(item.os_id)))
    const pagamentosTecnicosEscopo = pagamentosTecnicos.filter((item) => ordemPorId.has(numero(item.os_id)))

    const receitaServicosCompetencia = soma(ordens, (item) => valorPreferencial(item.cliente_valor_mao_obra, item.valor_mao_obra))
    const receitaPecasOsCompetencia = soma(ordens, (item) => valorPreferencial(item.cliente_valor_pecas, item.valor_pecas))
    const descontosOsCompetencia = soma(ordens, (item) => valorPreferencial(item.cliente_desconto, item.desconto))
    const receitaVendasBruta = soma(vendas, (item) => numero(item.subtotal))
    const descontosVendas = soma(vendas, (item) => numero(item.desconto))
    const recebimentosOs = soma(recebimentosEscopo, (item) => numero(item.valor)) || soma(ordens, recebimentoFallbackNoPeriodo(inicio, fim))

    let receitaServicos = receitaServicosCompetencia
    let receitaPecasOs = receitaPecasOsCompetencia
    let receitaVendas = receitaVendasBruta
    let deducoes = descontosOsCompetencia + descontosVendas

    if (base === 'CAIXA') {
      const composicaoOs = receitaServicosCompetencia + receitaPecasOsCompetencia
      const proporcaoServico = composicaoOs > 0 ? receitaServicosCompetencia / composicaoOs : 1
      receitaServicos = recebimentosOs * proporcaoServico
      receitaPecasOs = recebimentosOs - receitaServicos
      receitaVendas = soma(vendas, (item) => numero(item.total))
      deducoes = 0
    }

    const custoPecaOsReconhecido = (item: Registro) => {
      const ordem = ordemPorId.get(numero(item.os_id))
      if (!ordem) return 0
      const parceiroRaw = Array.isArray(ordem.parceiros) ? ordem.parceiros[0] : ordem.parceiros
      const parceiro = (parceiroRaw ?? {}) as Registro
      const terceirizadoComCustoCompleto = String(parceiro.tipo_vinculo ?? '').toUpperCase() !== 'PROPRIO' && numero(ordem.tecnico_total) > 0
      return terceirizadoComCustoCompleto ? 0 : numero(item.quantidade) * numero(item.valor_custo)
    }
    const custoPecasOs = base === 'COMPETENCIA'
      ? soma(pecasOs, custoPecaOsReconhecido)
      : 0
    const custoVendas = base === 'COMPETENCIA'
      ? soma(itensVenda, (item) => numero(item.quantidade) * numero(item.valor_custo_unitario))
      : 0

    const custoTecnicosCompetencia = soma(ordens, custoTecnicoCompetencia)
    const custoTecnicosCaixa = soma(pagamentosTecnicosEscopo, (item) => numero(item.valor))
      || soma(ordens.filter((item) => noPeriodo(item.tecnico_pago_em, inicio, fim)), (item) => numero(item.tecnico_total))
    const comissoesCaixa = soma(comissoesPagas, (item) => numero(item.total_comissao))
    const custoTecnicos = base === 'COMPETENCIA' ? custoTecnicosCompetencia : custoTecnicosCaixa + comissoesCaixa

    const contasPeriodo = contas.filter((item) => {
      if (base === 'CAIXA') return String(item.status ?? '').toUpperCase() === 'PAGO' && noPeriodo(item.pago_em, inicio, fim)
      return noPeriodo(item.vencimento ?? item.criado_em, inicio, fim)
    })
    const despesasCategorias = agruparCategorias(contasPeriodo)
    const despesasOperacionais = despesasCategorias.reduce((total, item) => total + item.valor, 0)

    const receitaBruta = receitaServicos + receitaPecasOs + receitaVendas
    const receitaLiquida = Math.max(receitaBruta - deducoes, 0)
    const custosDiretos = custoPecasOs + custoVendas + custoTecnicos
    const lucroBruto = receitaLiquida - custosDiretos
    const resultadoOperacional = lucroBruto - despesasOperacionais

    const meses = montarMeses(inicio, fim)
    if (base === 'COMPETENCIA') {
      for (const ordem of ordens) {
        adicionarMes(meses, ordem.finalizada_em, {
          receita: valorPreferencial(ordem.cliente_total, ordem.total),
          custos: custoTecnicoCompetencia(ordem),
        })
      }
      const custoOsPorId = agruparValor(pecasOs, 'os_id', custoPecaOsReconhecido)
      for (const ordem of ordens) adicionarMes(meses, ordem.finalizada_em, { custos: custoOsPorId.get(numero(ordem.id)) ?? 0 })
      const custoVendaPorId = agruparValor(itensVenda, 'venda_id', (item) => numero(item.quantidade) * numero(item.valor_custo_unitario))
      for (const venda of vendas) adicionarMes(meses, venda.criado_em, { receita: numero(venda.total), custos: custoVendaPorId.get(numero(venda.id)) ?? 0 })
    } else {
      for (const item of recebimentosEscopo) adicionarMes(meses, item.criado_em, { receita: numero(item.valor) })
      for (const venda of vendas) adicionarMes(meses, venda.criado_em, { receita: numero(venda.total) })
      for (const item of pagamentosTecnicosEscopo) adicionarMes(meses, item.criado_em, { custos: numero(item.valor) })
      for (const item of comissoesPagas) adicionarMes(meses, item.pago_em, { custos: numero(item.total_comissao) })
    }
    for (const conta of contasPeriodo) adicionarMes(meses, base === 'CAIXA' ? conta.pago_em : conta.vencimento ?? conta.criado_em, { despesas: numero(conta.valor) })

    return NextResponse.json({
      filtros: { inicio, fim, base, consolidado: auth.consolidado },
      resumo: {
        receitaBruta, deducoes, receitaLiquida, custosDiretos, lucroBruto,
        despesasOperacionais, resultadoOperacional,
        margemBruta: percentual(lucroBruto, receitaLiquida),
        margemOperacional: percentual(resultadoOperacional, receitaLiquida),
      },
      linhas: {
        receitaServicos, receitaPecasOs, receitaVendas,
        descontos: deducoes,
        custoPecasOs, custoVendas, custoTecnicos,
      },
      despesasCategorias,
      meses: Array.from(meses.values()).map((item) => ({ ...item, resultado: item.receita - item.custos - item.despesas })),
      contagens: { ordens: ordens.length, vendas: vendas.length, despesas: contasPeriodo.length },
      avisos: base === 'CAIXA'
        ? ['A visao de caixa considera valores efetivamente recebidos e pagos. Custos de estoque sao reconhecidos na competencia para evitar dupla contagem com compras pagas.']
        : pecasOs.some((item) => numero(item.valor_custo) === 0)
          ? ['Existem pecas de OS sem custo cadastrado. Isso pode elevar a margem exibida.']
          : [],
    })
  } catch (error) {
    console.error('Erro ao carregar DRE:', error)
    return NextResponse.json({ error: mensagem(error, 'Erro ao calcular o DRE.') }, { status: 500 })
  }
}

async function carregarOrdens(supabase: ReturnType<typeof db>, unidades: number[], inicio: string, fim: string, base: BaseCalculo) {
  let query = supabase.from('ordens_servico').select(`
    id, unidade_id, numero_os, status, finalizada_em, data_pagamento, data_ultimo_recebimento,
    valor_pecas, valor_mao_obra, desconto, total,
    cliente_valor_pecas, cliente_valor_mao_obra, cliente_desconto, cliente_total,
    valor_recebido_cliente, tecnico_total, tecnico_pago_em,
    parceiros:parceiro_id ( tipo_vinculo, comissao_pecas_percentual, comissao_mao_obra_percentual )
  `).in('unidade_id', unidades)

  if (base === 'COMPETENCIA') query = query.eq('status', 'FINALIZADA').gte('finalizada_em', inicio).lte('finalizada_em', fim)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as Registro[]
}

async function carregarVendas(supabase: ReturnType<typeof db>, unidades: number[], inicio: string, fim: string) {
  const { data, error } = await supabase.from('vendas').select('id, unidade_id, subtotal, desconto, total, criado_em').in('unidade_id', unidades).eq('status', 'PAGO').gte('criado_em', inicio).lte('criado_em', fim)
  if (error && !tabelaAusente(error)) throw error
  return (data ?? []) as Registro[]
}

async function carregarContas(supabase: ReturnType<typeof db>, unidades: number[]) {
  const { data, error } = await supabase.from('contas_pagar').select('id, unidade_id, descricao, categoria, valor, vencimento, status, pago_em, criado_em').in('unidade_id', unidades)
  if (error && !tabelaAusente(error)) throw error
  return (data ?? []) as Registro[]
}

async function carregarPecasOs(supabase: ReturnType<typeof db>, ids: number[]) {
  if (!ids.length) return []
  const { data, error } = await supabase.from('os_pecas').select('os_id, quantidade, valor_custo').in('os_id', ids)
  if (error && String(error.code) !== '42703' && !tabelaAusente(error)) throw error
  return (data ?? []) as Registro[]
}

async function carregarItensVenda(supabase: ReturnType<typeof db>, ids: number[]) {
  if (!ids.length) return []
  const { data, error } = await supabase.from('venda_itens').select('venda_id, quantidade, valor_custo_unitario').in('venda_id', ids)
  if (error && !tabelaAusente(error)) throw error
  return (data ?? []) as Registro[]
}

async function carregarHistorico(supabase: ReturnType<typeof db>, tipo: string, inicio: string, fim: string) {
  const { data, error } = await supabase.from('financeiro_historico').select('os_id, tipo, valor, criado_em').eq('tipo', tipo).gte('criado_em', inicio).lte('criado_em', fim)
  if (error && !tabelaAusente(error)) throw error
  return (data ?? []) as Registro[]
}

async function carregarComissoesPagas(supabase: ReturnType<typeof db>, inicio: string, fim: string, ordemIds: number[]) {
  if (!ordemIds.length) return []
  const { data: fechamentos, error } = await supabase.from('comissao_fechamentos').select('id, pago_em').eq('status', 'PAGO').gte('pago_em', inicio).lte('pago_em', fim)
  if (error && !tabelaAusente(error)) throw error
  const lista = (fechamentos ?? []) as Registro[]
  const ids = lista.map((item) => numero(item.id)).filter(Boolean)
  if (!ids.length) return []
  const { data: itens, error: itensError } = await supabase.from('comissao_fechamento_itens').select('fechamento_id, os_id, comissao_pecas, comissao_mao_obra, valor_ajuste').in('fechamento_id', ids).in('os_id', ordemIds)
  if (itensError && !tabelaAusente(itensError)) throw itensError
  const porFechamento = agruparValor((itens ?? []) as Registro[], 'fechamento_id', (item) => numero(item.comissao_pecas) + numero(item.comissao_mao_obra) + numero(item.valor_ajuste))
  return lista.map((item) => ({ pago_em: item.pago_em, total_comissao: porFechamento.get(numero(item.id)) ?? 0 })).filter((item) => numero(item.total_comissao) !== 0)
}

function custoTecnicoCompetencia(ordem: Registro) {
  const parceiroRaw = Array.isArray(ordem.parceiros) ? ordem.parceiros[0] : ordem.parceiros
  const parceiro = (parceiroRaw ?? {}) as Registro
  if (String(parceiro.tipo_vinculo ?? '').toUpperCase() === 'PROPRIO') {
    const pecas = valorPreferencial(ordem.cliente_valor_pecas, ordem.valor_pecas)
    const mao = valorPreferencial(ordem.cliente_valor_mao_obra, ordem.valor_mao_obra)
    return pecas * numero(parceiro.comissao_pecas_percentual) / 100 + mao * numero(parceiro.comissao_mao_obra_percentual) / 100
  }
  return numero(ordem.tecnico_total)
}

function agruparCategorias(contas: Registro[]) {
  const mapa = new Map<string, number>()
  for (const conta of contas) {
    const categoria = String(conta.categoria ?? 'SEM CATEGORIA').trim().toUpperCase() || 'SEM CATEGORIA'
    mapa.set(categoria, (mapa.get(categoria) ?? 0) + numero(conta.valor))
  }
  return Array.from(mapa, ([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)
}

function montarMeses(inicio: string, fim: string) {
  const mapa = new Map<string, { chave: string; label: string; receita: number; custos: number; despesas: number }>()
  const cursor = new Date(`${inicio}T12:00:00`)
  const limite = new Date(`${fim}T12:00:00`)
  cursor.setDate(1)
  while (cursor <= limite) {
    const chave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    const label = cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
    mapa.set(chave, { chave, label, receita: 0, custos: 0, despesas: 0 })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return mapa
}

function adicionarMes(meses: ReturnType<typeof montarMeses>, data: unknown, valores: { receita?: number; custos?: number; despesas?: number }) {
  if (!data) return
  const date = new Date(String(data))
  if (!Number.isFinite(date.getTime())) return
  const chave = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  const mes = meses.get(chave)
  if (!mes) return
  mes.receita += valores.receita ?? 0
  mes.custos += valores.custos ?? 0
  mes.despesas += valores.despesas ?? 0
}

function agruparValor(itens: Registro[], chave: string, getValor: (item: Registro) => number) {
  const mapa = new Map<number, number>()
  for (const item of itens) {
    const id = numero(item[chave])
    mapa.set(id, (mapa.get(id) ?? 0) + getValor(item))
  }
  return mapa
}

function recebimentoFallbackNoPeriodo(inicio: string, fim: string) {
  return (item: Registro) => noPeriodo(item.data_ultimo_recebimento ?? item.data_pagamento, inicio, fim) ? numero(item.valor_recebido_cliente) : 0
}

function noPeriodo(value: unknown, inicio: string, fim: string) {
  if (!value) return false
  const chave = String(value).slice(0, 10)
  return chave >= inicio && chave <= fim
}

function validarData(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function dataInput(date: Date) {
  const ano = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function soma(itens: Registro[], getValor: (item: Registro) => number) {
  return itens.reduce((total, item) => total + getValor(item), 0)
}

function numero(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function valorPreferencial(principal: unknown, fallback: unknown) {
  return principal === null || principal === undefined || principal === '' ? numero(fallback) : numero(principal)
}

function percentual(valor: number, base: number) {
  return base > 0 ? Number(((valor / base) * 100).toFixed(2)) : 0
}

function tabelaAusente(error: { code?: string | null }) {
  return ['42P01', 'PGRST205'].includes(String(error.code))
}

function mensagem(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error) {
    const item = error as Registro
    return [item.message, item.details, item.hint, item.code].filter(Boolean).map(String).join(' | ') || fallback
  }
  return fallback
}
