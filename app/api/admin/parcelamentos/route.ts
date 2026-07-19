import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase nao configurado.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro')
    if (!auth.ok) return auth.response
    const supabase = db()
    const { error: tabelaError } = await supabase.from('recebimento_parcelas').select('id').limit(0)
    if (tabelaError) return NextResponse.json({ estruturaPendente: true, acrescimosPendente: true, ordens: [], parcelas: [] })
    const { error: acrescimosError } = await supabase.from('recebimento_parcelas').select('juros, multa, desconto_baixa, iss_retido, valor_recebido').limit(0)
    const camposOrdens = `id, numero_os, status, status_financeiro, total, cliente_total, valor_recebido_cliente, desconto_recebimento_cliente${acrescimosError ? '' : ', iss_retido_cliente'}, clientes:cliente_id(nome)`
    const { data: ordens, error: ordensError } = await supabase.from('ordens_servico')
      .select(camposOrdens)
      .eq('status', 'FINALIZADA').order('created_at', { ascending: false })
    if (ordensError) throw ordensError
    const { data: parcelas, error: parcelasError } = await supabase.from('recebimento_parcelas')
      .select('*, ordens_servico:os_id(numero_os, cliente_total, total, clientes:cliente_id(nome))')
      .order('vencimento', { ascending: true })
    if (parcelasError) throw parcelasError
    return NextResponse.json({ estruturaPendente: false, acrescimosPendente: Boolean(acrescimosError), ordens: ordens ?? [], parcelas: parcelas ?? [] })
  } catch (error) {
    return NextResponse.json({ error: erro(error, 'Erro ao carregar parcelamentos.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const osId = Number(body?.osId)
    const quantidade = Math.floor(Number(body?.quantidade))
    const primeiroVencimento = String(body?.primeiroVencimento ?? '')
    const intervaloDias = Math.floor(Number(body?.intervaloDias ?? 30))
    if (!osId || quantidade < 2 || quantidade > 60 || intervaloDias < 1 || intervaloDias > 365 || !/^\d{4}-\d{2}-\d{2}$/.test(primeiroVencimento)) {
      return NextResponse.json({ error: 'Informe OS, quantidade, intervalo em dias e primeiro vencimento validos.' }, { status: 400 })
    }
    const supabase = db()
    const { data: os, error: osError } = await supabase.from('ordens_servico').select('id, numero_os, status, status_financeiro, total, cliente_total, valor_recebido_cliente, desconto_recebimento_cliente, iss_retido_cliente').eq('id', osId).maybeSingle()
    if (osError || !os || os.status !== 'FINALIZADA') return NextResponse.json({ error: 'Somente OS finalizadas podem ser parceladas.' }, { status: 400 })
    const { count } = await supabase.from('recebimento_parcelas').select('*', { count: 'exact', head: true }).eq('os_id', osId).in('status', ['PENDENTE', 'RECEBIDO'])
    if ((count ?? 0) > 0) return NextResponse.json({ error: 'Esta OS ja possui parcelamento cadastrado.' }, { status: 400 })
    const { error: limpezaError } = await supabase.from('recebimento_parcelas').delete().eq('os_id', osId).eq('status', 'CANCELADO')
    if (limpezaError) throw limpezaError
    const total = numero(os.cliente_total ?? os.total)
    const recebido = numero(os.valor_recebido_cliente)
    const desconto = numero(os.desconto_recebimento_cliente)
    const saldoCentavos = Math.round(Math.max(total - recebido - desconto - numero(os.iss_retido_cliente), 0) * 100)
    if (saldoCentavos <= 0) return NextResponse.json({ error: 'Esta OS nao possui saldo em aberto.' }, { status: 400 })
    const base = Math.floor(saldoCentavos / quantidade)
    const resto = saldoCentavos % quantidade
    const ator = `${auth.nome} (${auth.email})`
    const parcelas = Array.from({ length: quantidade }, (_, index) => ({
      os_id: osId,
      numero_parcela: index + 1,
      total_parcelas: quantidade,
      valor: (base + (index < resto ? 1 : 0)) / 100,
      vencimento: adicionarDias(primeiroVencimento, index * intervaloDias),
      forma_recebimento: 'BOLETO',
      status: 'PENDENTE',
      criado_por: ator,
    }))
    const { error } = await supabase.from('recebimento_parcelas').insert(parcelas)
    if (error) throw error
    const { error: osUpdateError } = await supabase.from('ordens_servico').update({ status_financeiro: 'FATURADO' }).eq('id', osId)
    if (osUpdateError) {
      await supabase.from('recebimento_parcelas').delete().eq('os_id', osId).eq('status', 'PENDENTE')
      throw osUpdateError
    }
    await historico(supabase, { osId, ator, tipo: 'PARCELAMENTO_CRIADO', statusAnterior: os.status_financeiro, statusNovo: 'FATURADO', valor: saldoCentavos / 100, descricao: `${os.numero_os}: parcelamento em ${quantidade} boletos com intervalo de ${intervaloDias} dias criado.` })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: erro(error, 'Erro ao criar parcelamento.') }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const acao = String(body?.acao ?? '').toUpperCase()
    if (!id || !['RECEBER', 'CANCELAR', 'EDITAR'].includes(acao)) return NextResponse.json({ error: 'Parcela ou acao invalida.' }, { status: 400 })
    const supabase = db()
    const ator = `${auth.nome} (${auth.email})`
    const { data: parcela, error: parcelaError } = await supabase.from('recebimento_parcelas').select('id, os_id, numero_parcela, total_parcelas, valor, status').eq('id', id).maybeSingle()
    if (parcelaError || !parcela || parcela.status !== 'PENDENTE') return NextResponse.json({ error: 'Parcela nao localizada ou ja baixada.' }, { status: 400 })

    if (acao === 'EDITAR') {
      const valorNovo = centavos(body?.valor)
      const vencimentoNovo = String(body?.vencimento ?? '')
      if (valorNovo <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(vencimentoNovo)) return NextResponse.json({ error: 'Informe valor e vencimento validos.' }, { status: 400 })
      const { data: os } = await supabase.from('ordens_servico').select('total, cliente_total, valor_recebido_cliente, desconto_recebimento_cliente, iss_retido_cliente').eq('id', parcela.os_id).maybeSingle()
      const { data: outras } = await supabase.from('recebimento_parcelas').select('valor').eq('os_id', parcela.os_id).eq('status', 'PENDENTE').neq('id', id)
      const saldo = Math.max(numero(os?.cliente_total ?? os?.total) - numero(os?.valor_recebido_cliente) - numero(os?.desconto_recebimento_cliente) - numero(os?.iss_retido_cliente), 0)
      const outrasPendentes = (outras ?? []).reduce((acc, item) => acc + numero(item.valor), 0)
      if (valorNovo + outrasPendentes > saldo + 0.009) return NextResponse.json({ error: `A soma das parcelas nao pode ultrapassar o saldo de ${moeda(saldo)}. Reduza primeiro outra parcela.` }, { status: 400 })
      const { error } = await supabase.from('recebimento_parcelas').update({ valor: valorNovo, vencimento: vencimentoNovo }).eq('id', id).eq('status', 'PENDENTE')
      if (error) throw error
      await historico(supabase, { osId: parcela.os_id, ator, tipo: 'PARCELA_EDITADA', statusAnterior: 'PENDENTE', statusNovo: 'PENDENTE', valor: valorNovo, descricao: `Parcela ${parcela.numero_parcela}/${parcela.total_parcelas} alterada de ${moeda(numero(parcela.valor))} para ${moeda(valorNovo)}, vencimento ${vencimentoNovo}.` })
      return NextResponse.json({ ok: true })
    }

    if (acao === 'CANCELAR') {
      const { error } = await supabase.from('recebimento_parcelas').update({ status: 'CANCELADO', recebido_por: ator }).eq('id', id).eq('status', 'PENDENTE')
      if (error) throw error
      await historico(supabase, { osId: parcela.os_id, ator, tipo: 'PARCELA_CANCELADA', statusAnterior: 'PENDENTE', statusNovo: 'CANCELADO', valor: numero(parcela.valor), descricao: `Parcela ${parcela.numero_parcela}/${parcela.total_parcelas} cancelada.` })
      return NextResponse.json({ ok: true })
    }

    const { error: estruturaError } = await supabase.from('recebimento_parcelas').select('juros, multa, desconto_baixa, iss_retido, valor_recebido').limit(0)
    if (estruturaError) return NextResponse.json({ error: 'Rode o arquivo supabase-add-acrescimos-iss-recebimentos.sql antes de receber parcelas.' }, { status: 400 })
    const juros = centavos(body?.juros)
    const multa = centavos(body?.multa)
    const descontoBaixa = centavos(body?.desconto)
    const issRetido = centavos(body?.issRetido)
    const valorParcela = centavos(parcela.valor)
    if ([juros, multa, descontoBaixa, issRetido].some((valor) => valor < 0) || descontoBaixa + issRetido > valorParcela) {
      return NextResponse.json({ error: 'Juros, multa, desconto ou ISS retido invalidos para esta parcela.' }, { status: 400 })
    }
    const principalRecebido = centavos(valorParcela - descontoBaixa - issRetido)
    const valorLiquido = centavos(principalRecebido + juros + multa)
    if (valorLiquido <= 0 && issRetido <= 0) return NextResponse.json({ error: 'O valor total da baixa deve ser maior que zero.' }, { status: 400 })

    const agora = new Date().toISOString()
    const { data: atualizada, error: baixaError } = await supabase.from('recebimento_parcelas').update({
      status: 'RECEBIDO', recebido_em: agora, recebido_por: ator,
      juros, multa, desconto_baixa: descontoBaixa, iss_retido: issRetido, valor_recebido: valorLiquido,
    }).eq('id', id).eq('status', 'PENDENTE').select('id').maybeSingle()
    if (baixaError || !atualizada) return NextResponse.json({ error: 'A parcela ja foi processada.' }, { status: 409 })

    const { data: os, error: osError } = await supabase.from('ordens_servico').select('id, numero_os, total, cliente_total, valor_recebido_cliente, desconto_recebimento_cliente, juros_recebidos_cliente, multa_recebida_cliente, iss_retido_cliente, status_financeiro').eq('id', parcela.os_id).maybeSingle()
    if (osError || !os) throw osError ?? new Error('OS nao localizada.')
    const total = numero(os.cliente_total ?? os.total)
    const novoRecebido = centavos(numero(os.valor_recebido_cliente) + principalRecebido)
    const novoDesconto = centavos(numero(os.desconto_recebimento_cliente) + descontoBaixa)
    const novoIss = centavos(numero(os.iss_retido_cliente) + issRetido)
    const quitado = novoRecebido + novoDesconto + novoIss >= total - 0.009
    const { error: osUpdateError } = await supabase.from('ordens_servico').update({
      valor_recebido_cliente: novoRecebido,
      desconto_recebimento_cliente: novoDesconto,
      juros_recebidos_cliente: centavos(numero(os.juros_recebidos_cliente) + juros),
      multa_recebida_cliente: centavos(numero(os.multa_recebida_cliente) + multa),
      iss_retido_cliente: novoIss,
      status_financeiro: quitado ? 'RECEBIDO' : 'PARCIAL',
      data_ultimo_recebimento: agora,
      data_pagamento: quitado ? agora : null,
      forma_recebimento: 'BOLETO',
    }).eq('id', parcela.os_id)
    if (osUpdateError) {
      await supabase.from('recebimento_parcelas').update({ status: 'PENDENTE', recebido_em: null, recebido_por: null, juros: 0, multa: 0, desconto_baixa: 0, iss_retido: 0, valor_recebido: null }).eq('id', id)
      throw osUpdateError
    }
    await historico(supabase, {
      osId: parcela.os_id, ator, tipo: 'RECEBIMENTO_OS', statusAnterior: os.status_financeiro,
      statusNovo: quitado ? 'RECEBIDO' : 'PARCIAL', valor: centavos(principalRecebido + issRetido),
      valorPrincipal: principalRecebido, juros, multa, desconto: descontoBaixa, issRetido, valorLiquido,
      descricao: `${os.numero_os}: boleto ${parcela.numero_parcela}/${parcela.total_parcelas} recebido. Principal ${moeda(principalRecebido)}, juros ${moeda(juros)}, multa ${moeda(multa)}, desconto ${moeda(descontoBaixa)}, ISS retido ${moeda(issRetido)} e entrada no caixa ${moeda(valorLiquido)}.`,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: erro(error, 'Erro ao atualizar parcela.') }, { status: 500 })
  }
}

function adicionarDias(data: string, dias: number) {
  const alvo = new Date(`${data}T12:00:00Z`)
  alvo.setUTCDate(alvo.getUTCDate() + dias)
  return alvo.toISOString().slice(0, 10)
}

type Historico = {
  osId: number
  ator: string
  tipo: string
  statusAnterior?: string | null
  statusNovo: string
  valor: number
  descricao: string
  valorPrincipal?: number
  juros?: number
  multa?: number
  desconto?: number
  issRetido?: number
  valorLiquido?: number
}

async function historico(supabase: ReturnType<typeof db>, item: Historico) {
  const financeiro = {
    os_id: item.osId, tipo: item.tipo, status_anterior: item.statusAnterior,
    status_novo: item.statusNovo, valor: item.valor, descricao: item.descricao, responsavel: item.ator,
    ...(item.valorPrincipal === undefined ? {} : {
      valor_principal: item.valorPrincipal, juros: item.juros ?? 0, multa: item.multa ?? 0,
      desconto: item.desconto ?? 0, iss_retido: item.issRetido ?? 0, valor_liquido: item.valorLiquido ?? item.valor,
    }),
  }
  const { error } = await supabase.from('financeiro_historico').insert(financeiro)
  if (error && !['42P01', 'PGRST205'].includes(String(error.code))) throw error
}

function numero(value: unknown) { return Number(value ?? 0) || 0 }
function centavos(value: unknown) { return Math.round(numero(value) * 100) / 100 }
function moeda(value: number) { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function erro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message)
  return fallback
}
