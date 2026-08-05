import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminEscopoGerencial } from '@/lib/admin-unidade'
import { calcularBaixaRecebimento } from '@/lib/calculos-financeiros'
import { cabecalhosAuditoria, type AtorAuditoria } from '@/lib/auditoria-contexto'
import { calcularLiquidacaoCartao, registrarMovimentoFinanceiro, validarContaFinanceira } from '@/lib/financeiro-contas'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type ItemEntrada = {
  osId: number
  valor: number
  juros: number
  multa: number
  desconto: number
  issRetido: number
}

function getSupabaseAdmin(request: NextRequest, ator: AtorAuditoria) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configuração do Supabase ausente no servidor.')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: cabecalhosAuditoria(request, ator) },
  })
}

export async function POST(request: NextRequest) {
  let loteId: string | null = null
  try {
    const auth = await requireAdminEscopoGerencial(request, 'financeiro')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const tipoPagador = String(body?.tipoPagador ?? '').toUpperCase()
    const forma = normalizarFormaPagamento(body?.forma)
    const itens = normalizarItens(body?.itens)

    if (!['CLIENTE', 'GARANTIDOR'].includes(tipoPagador) || itens.length < 2) {
      return NextResponse.json(
        { error: 'Selecione ao menos duas OS do mesmo cliente ou garantidor.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin(request, auth)
    const ids = itens.map((item) => item.osId)
    const { data: ordens, error: ordensError } = await supabase
      .from('ordens_servico')
      .select(`
        id, numero_os, cliente_id, garantidor_id, unidade_id, status, status_financeiro,
        total, cliente_total, encerramento_taxa_diagnostico,
        valor_recebido_cliente, desconto_recebimento_cliente,
        juros_recebidos_cliente, multa_recebida_cliente, iss_retido_cliente
      `)
      .in('id', ids)

    if (ordensError) {
      if (String(ordensError.message ?? '').includes('valor_recebido_cliente')) {
        return NextResponse.json(
          { error: 'Execute os SQLs de recebimento parcial, acréscimos e recebimento em lote.' },
          { status: 400 }
        )
      }
      throw ordensError
    }
    if ((ordens ?? []).length !== itens.length) {
      return NextResponse.json({ error: 'Uma ou mais OS não foram encontradas.' }, { status: 404 })
    }

    const unidadesPermitidas = new Set(auth.unidadesPermitidas.map(Number))
    if ((ordens ?? []).some((ordem) => !unidadesPermitidas.has(Number(ordem.unidade_id)))) {
      return NextResponse.json({ error: 'Há OS de uma unidade sem permissão neste lote.' }, { status: 403 })
    }

    const pagadores = new Set((ordens ?? []).map((ordem) =>
      tipoPagador === 'GARANTIDOR' ? Number(ordem.garantidor_id) : Number(ordem.cliente_id)
    ))
    const pagadorId = Array.from(pagadores)[0]
    if (pagadores.size !== 1 || !pagadorId) {
      return NextResponse.json(
        { error: `Todas as OS devem pertencer ao mesmo ${tipoPagador === 'GARANTIDOR' ? 'garantidor' : 'cliente'}.` },
        { status: 400 }
      )
    }

    const porId = new Map((ordens ?? []).map((ordem) => [Number(ordem.id), ordem]))
    const calculados = itens.map((item) => {
      const ordem = porId.get(item.osId)
      if (!ordem) throw new Error(`OS #${item.osId} não encontrada.`)
      const encerradaComTaxa = ordem.status === 'ENCERRADA_SEM_REPARO'
        && toNumber(ordem.encerramento_taxa_diagnostico) > 0
      if (ordem.status !== 'FINALIZADA' && !encerradaComTaxa) {
        throw new Error(`${ordem.numero_os ?? `OS #${ordem.id}`} ainda não pode ser recebida.`)
      }

      const total = encerradaComTaxa
        ? toNumber(ordem.encerramento_taxa_diagnostico)
        : valorPreferencial(ordem.cliente_total, ordem.total)
      const baixa = calcularBaixaRecebimento({
        total,
        recebidoAtual: toNumber(ordem.valor_recebido_cliente),
        descontoAtual: toNumber(ordem.desconto_recebimento_cliente),
        issRetidoAtual: toNumber(ordem.iss_retido_cliente),
        principal: item.valor,
        desconto: item.desconto,
        juros: item.juros,
        multa: item.multa,
        issRetido: item.issRetido,
      })
      return { item, ordem, baixa }
    })

    const totais = calculados.reduce((acc, atual) => ({
      principal: acc.principal + atual.item.valor,
      juros: acc.juros + atual.item.juros,
      multa: acc.multa + atual.item.multa,
      desconto: acc.desconto + atual.item.desconto,
      iss: acc.iss + atual.item.issRetido,
      caixa: acc.caixa + atual.baixa.entradaCaixa,
    }), { principal: 0, juros: 0, multa: 0, desconto: 0, iss: 0, caixa: 0 })

    const responsavel = `${auth.nome} (${auth.email})`
    const unidadeId = new Set((ordens ?? []).map((ordem) => Number(ordem.unidade_id))).size === 1
      ? Number(ordens?.[0]?.unidade_id)
      : null
    if (!unidadeId) return NextResponse.json({ error: 'Receba em lote somente OS da mesma unidade.' }, { status: 400 })
    const contaFinanceira = await validarContaFinanceira(supabase, unidadeId, body?.contaFinanceiraId)
    const parcelasCartao = Math.max(1, Math.min(24, Math.trunc(Number(body?.parcelas) || 1)))
    const liquidacao = forma === 'CARTAO' ? await calcularLiquidacaoCartao(supabase, { unidadeId, operadoraId: body?.operadoraId, modalidade: body?.modalidadeCartao, parcelas: parcelasCartao, valorBruto: totais.caixa }) : null
    const { data: lote, error: loteError } = await supabase
      .from('recebimentos_lotes')
      .insert({
        tipo_pagador: tipoPagador,
        cliente_id: tipoPagador === 'CLIENTE' ? pagadorId : null,
        garantidor_id: tipoPagador === 'GARANTIDOR' ? pagadorId : null,
        unidade_id: unidadeId,
        conta_financeira_id: contaFinanceira.id,
        forma_recebimento: forma,
        total_principal: totais.principal,
        total_juros: totais.juros,
        total_multa: totais.multa,
        total_desconto: totais.desconto,
        total_iss_retido: totais.iss,
        total_caixa: totais.caixa,
        quantidade_os: calculados.length,
        responsavel,
      })
      .select('id')
      .single()
    if (loteError) {
      if (String(loteError.message ?? '').includes('recebimentos_lotes')) {
        return NextResponse.json(
          { error: 'Execute o arquivo supabase-add-recebimento-em-lote.sql.' },
          { status: 400 }
        )
      }
      throw loteError
    }
    loteId = String(lote.id)

    for (const { item, ordem, baixa } of calculados) {
      const agora = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('ordens_servico')
        .update({
          status_financeiro: baixa.status,
          data_pagamento: baixa.status === 'RECEBIDO' ? agora : null,
          data_ultimo_recebimento: agora,
          forma_recebimento: forma,
          valor_recebido_cliente: baixa.recebido,
          desconto_recebimento_cliente: baixa.desconto,
          juros_recebidos_cliente: toNumber(ordem.juros_recebidos_cliente) + item.juros,
          multa_recebida_cliente: toNumber(ordem.multa_recebida_cliente) + item.multa,
          iss_retido_cliente: baixa.issRetido,
        })
        .eq('id', item.osId)
      if (updateError) throw updateError

      const { error: itemError } = await supabase.from('recebimentos_lotes_itens').insert({
        lote_id: loteId,
        os_id: item.osId,
        valor_principal: item.valor,
        juros: item.juros,
        multa: item.multa,
        desconto: item.desconto,
        iss_retido: item.issRetido,
        valor_caixa: baixa.entradaCaixa,
        status_anterior: ordem.status_financeiro,
        status_novo: baixa.status,
      })
      if (itemError) throw itemError

      const { error: historicoError } = await supabase.from('financeiro_historico').insert({
        os_id: item.osId,
        lote_id: loteId,
        tipo: 'RECEBIMENTO_OS_LOTE',
        status_anterior: ordem.status_financeiro,
        status_novo: baixa.status,
        valor: item.valor + item.issRetido,
        valor_principal: item.valor,
        juros: item.juros,
        multa: item.multa,
        desconto: item.desconto,
        iss_retido: item.issRetido,
        valor_liquido: baixa.entradaCaixa,
        responsavel,
        descricao: `${ordem.numero_os ?? `OS #${item.osId}`} recebida no lote ${loteId} via ${forma}.`,
      })
      if (historicoError) throw historicoError
    }

    const { error: concluirError } = await supabase
      .from('recebimentos_lotes')
      .update({ status: 'CONCLUIDO', concluido_em: new Date().toISOString() })
      .eq('id', loteId)
    if (concluirError) throw concluirError
    await registrarMovimentoFinanceiro(supabase, { unidadeId, contaId: contaFinanceira.id, natureza: 'ENTRADA', tipo: 'RECEBIMENTO_OS_LOTE', forma, valorBruto: totais.caixa, taxaValor: liquidacao?.taxaValor, valorLiquido: liquidacao?.valorLiquido ?? totais.caixa, operadoraId: liquidacao ? Number(body?.operadoraId) : null, taxaId: liquidacao?.taxaId, taxaPercentual: liquidacao?.taxaPercentual, parcelas: parcelasCartao, previsaoCredito: liquidacao?.previsaoCredito, origemTipo: 'RECEBIMENTO_LOTE', origemId: loteId, descricao: `Lote ${loteId} recebido via ${forma} em ${contaFinanceira.nome}.`, usuarioId: auth.usuarioId, nome: auth.nome, email: auth.email })

    return NextResponse.json({
      ok: true,
      loteId,
      quantidade: calculados.length,
      totalCaixa: totais.caixa,
    })
  } catch (error) {
    console.error('Erro ao receber OS em lote:', error)
    if (loteId && supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      await supabase.from('recebimentos_lotes').update({ status: 'ERRO' }).eq('id', loteId)
    }
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao processar recebimento em lote.') },
      { status: 500 }
    )
  }
}

function normalizarItens(value: unknown): ItemEntrada[] {
  if (!Array.isArray(value)) return []
  const mapa = new Map<number, ItemEntrada>()
  for (const bruto of value) {
    const item = bruto as Record<string, unknown>
    const osId = Number(item.osId)
    if (!Number.isInteger(osId) || osId <= 0) continue
    mapa.set(osId, {
      osId,
      valor: toNumber(item.valor),
      juros: toNumber(item.juros),
      multa: toNumber(item.multa),
      desconto: toNumber(item.desconto),
      issRetido: toNumber(item.issRetido),
    })
  }
  return Array.from(mapa.values())
}

function normalizarFormaPagamento(value: unknown) {
  const forma = String(value ?? '').trim().toUpperCase()
  if (!['PIX', 'CARTAO', 'DEPOSITO', 'BOLETO', 'DINHEIRO'].includes(forma)) {
    throw new Error('Forma de recebimento inválida.')
  }
  return forma
}

function valorPreferencial(preferencial: unknown, fallback: unknown) {
  const valor = toNumber(preferencial)
  return valor > 0 ? valor : toNumber(fallback)
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalizado = String(value ?? '').trim().replace(/\./g, '').replace(',', '.')
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : 0
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    return String(obj.message ?? obj.details ?? obj.hint ?? fallback)
  }
  return fallback
}
