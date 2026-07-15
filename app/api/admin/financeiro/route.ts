import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'
import { requireAdminEscopoGerencial } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type OrdemFinanceiro = Record<string, unknown> & {
  id: number
  tecnico_status_pagamento?: string | null
}

type ContaPagar = {
  id: number
  descricao?: string | null
  fornecedor?: string | null
  categoria?: string | null
  valor?: number | string | null
  vencimento?: string | null
  status?: string | null
  forma_pagamento?: string | null
}

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configuracao do Supabase ausente no servidor.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function colunaExiste(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tabela: string,
  coluna: string
) {
  const { error } = await supabase.from(tabela).select(coluna).limit(0)
  return !error
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminEscopoGerencial(request, 'financeiro')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const temPagamentoTecnico = await colunaExiste(supabase, 'ordens_servico', 'tecnico_status_pagamento')
    const temFormaRecebimento = await colunaExiste(supabase, 'ordens_servico', 'forma_recebimento')
    const temFormaPagamentoTecnico = await colunaExiste(supabase, 'ordens_servico', 'forma_pagamento_tecnico')
    const temValorRecebidoCliente = await colunaExiste(supabase, 'ordens_servico', 'valor_recebido_cliente')
    const temDataUltimoRecebimento = await colunaExiste(supabase, 'ordens_servico', 'data_ultimo_recebimento')
    const temDescontoRecebimentoCliente = await colunaExiste(supabase, 'ordens_servico', 'desconto_recebimento_cliente')
    const selectPagamentoTecnico = temPagamentoTecnico
      ? `
        tecnico_status_pagamento,
        tecnico_pago_em,`
      : ''
    const selectFormaRecebimento = temFormaRecebimento ? 'forma_recebimento,' : ''
    const selectFormaPagamentoTecnico = temFormaPagamentoTecnico ? 'forma_pagamento_tecnico,' : ''
    const selectValorRecebidoCliente = temValorRecebidoCliente ? 'valor_recebido_cliente,' : ''
    const selectDataUltimoRecebimento = temDataUltimoRecebimento ? 'data_ultimo_recebimento,' : ''
    const selectDescontoRecebimentoCliente = temDescontoRecebimentoCliente ? 'desconto_recebimento_cliente,' : ''

    const selectOrdens = `
        id,
        numero_os,
        created_at,
        status,
        status_financeiro,
        data_pagamento,
        ${selectDataUltimoRecebimento}
        ${selectFormaRecebimento}
        total,
        cliente_total,
        ${selectValorRecebidoCliente}
        ${selectDescontoRecebimentoCliente}
        tecnico_total,
        ${selectPagamentoTecnico}
        ${selectFormaPagamentoTecnico}
        parceiro_id,
        garantidor_id,
        garantia,
        tipo_atendimento,
        numero_nota_fiscal,
        clientes:cliente_id ( nome ),
        parceiros:parceiro_id ( responsavel, nome_fantasia, razao_social, tipo_vinculo ),
        garantidores:garantidor_id ( nome )
      `
    type QueryOrdens = {
      eq: (column: string, value: number) => QueryOrdens
      in: (column: string, values: number[]) => QueryOrdens
      order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: unknown }>
    }
    let ordensQuery = supabase.from('ordens_servico').select(selectOrdens) as unknown as QueryOrdens
    ordensQuery = auth.unidadeId
      ? ordensQuery.eq('unidade_id', auth.unidadeId)
      : ordensQuery.in('unidade_id', auth.unidadesPermitidas)
    const { data: ordens, error: ordensError } = await ordensQuery.order('created_at', { ascending: false })

    if (ordensError) throw ordensError

    const ordensIds = new Set(((ordens ?? []) as Array<{ id?: number }>).map((item) => Number(item.id)).filter(Boolean))
    const documentosBase = await carregarDocumentosTecnicos(supabase)
    const documentos = { ...documentosBase, data: documentosBase.data.filter((item: { os_id?: number | null }) => item.os_id && ordensIds.has(Number(item.os_id))) }
    const contasPagar = await carregarContasPagar(supabase, auth.unidadeId, auth.unidadesPermitidas)
    const contasIds = new Set(contasPagar.data.map((item) => Number(item.id)))
    const historicoBase = await carregarHistoricoFinanceiro(supabase)
    const historico = { ...historicoBase, data: historicoBase.data.filter((item: { os_id?: number | null; conta_id?: number | null }) => (item.os_id && ordensIds.has(Number(item.os_id))) || (item.conta_id && contasIds.has(Number(item.conta_id)))) }
    const vendasResumo = await carregarResumoVendas(supabase, auth.unidadeId, auth.unidadesPermitidas)
    const ordensData = (ordens ?? []) as unknown as OrdemFinanceiro[]
    const ordensComPagamentoTecnico = ordensData.map((ordem) => {
      const documentoPago = documentos.data.some(
        (doc: { os_id?: number | null; status?: string | null }) =>
          doc.os_id === ordem.id && doc.status === 'PAGO'
      )

      if (!documentoPago || ordem.tecnico_status_pagamento === 'RECEBIDO') return ordem

      return {
        ...ordem,
        tecnico_status_pagamento: 'RECEBIDO',
      }
    })

    return NextResponse.json({
      ordens: ordensComPagamentoTecnico,
      documentos: documentos.data,
      documentosPendentes: documentos.tabelaPendente,
      contasPagar: contasPagar.data,
      contasPagarPendente: contasPagar.tabelaPendente,
      historico: historico.data,
      historicoPendente: historico.tabelaPendente,
      descontoRecebimentoPendente: !temDescontoRecebimentoCliente,
      vendasResumo,
    })
  } catch (error) {
    console.error('Erro ao carregar financeiro admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar financeiro.') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminEscopoGerencial(request, 'financeiro')
    if (!auth.ok) return auth.response
    if (!auth.unidadeId) {
      return NextResponse.json({ error: 'Selecione Matriz ou uma Filial para cadastrar a conta.' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const descricao = String(body?.descricao ?? '').trim()
    const valor = toNumber(body?.valor)
    const vencimento = String(body?.vencimento ?? '').trim() || null

    if (!descricao || valor <= 0) {
      return NextResponse.json({ error: 'Informe descricao e valor da conta.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('contas_pagar')
      .insert({
        descricao,
        fornecedor: String(body?.fornecedor ?? '').trim() || null,
        categoria: String(body?.categoria ?? '').trim() || 'OPERACIONAL',
        valor,
        vencimento,
        status: 'PENDENTE',
        unidade_id: auth.unidadeId,
        observacao: String(body?.observacao ?? '').trim() || null,
      })
      .select('id, descricao, fornecedor, categoria, valor, vencimento, status, forma_pagamento, pago_em, observacao, criado_em')
      .single()

    if (error) throw error

    await registrarHistoricoFinanceiro(supabase, {
      responsavel: `${auth.nome} (${auth.email})`,
      contaId: Number(data?.id),
      tipo: 'CONTA_PAGAR_CRIADA',
      statusAnterior: null,
      statusNovo: 'PENDENTE',
      valor,
      descricao: `Conta a pagar cadastrada: ${descricao}.`,
    })

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao criar conta a pagar:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao criar conta a pagar.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const tipo = String(body?.tipo ?? '').trim().toUpperCase()
    const id = Number(body?.id)
    const supabase = getSupabaseAdmin()

    if (!id || !['OS', 'DOCUMENTO', 'TECNICO', 'CONTA'].includes(tipo)) {
      return NextResponse.json({ error: 'Dados invalidos para atualizar financeiro.' }, { status: 400 })
    }

    if (tipo === 'CONTA') {
      const forma = normalizarFormaPagamento(body?.forma)
      const status = String(body?.status ?? 'PAGO').trim().toUpperCase()

      if (!['PENDENTE', 'PAGO', 'CANCELADO'].includes(status)) {
        return NextResponse.json({ error: 'Status da conta invalido.' }, { status: 400 })
      }

      const { data: contaAtual } = await supabase
        .from('contas_pagar')
        .select('id, descricao, status, valor')
        .eq('id', id)
        .maybeSingle()

      const updatePayload: Record<string, unknown> = {
        status,
        pago_em: status === 'PAGO' ? new Date().toISOString() : null,
      }

      if (await colunaExiste(supabase, 'contas_pagar', 'forma_pagamento')) {
        updatePayload.forma_pagamento = status === 'PAGO' ? forma : null
      }

      const { error } = await supabase.from('contas_pagar').update(updatePayload).eq('id', id)
      if (error) throw error

      await registrarHistoricoFinanceiro(supabase, {
        responsavel: `${auth.nome} (${auth.email})`,
        contaId: id,
        tipo: 'CONTA_PAGAR',
        statusAnterior: String(contaAtual?.status ?? 'PENDENTE'),
        statusNovo: status,
        valor: toNumber(contaAtual?.valor),
        descricao: `${contaAtual?.descricao ?? `Conta #${id}`} marcada como ${status}${status === 'PAGO' ? ` via ${forma}` : ''}.`,
      })

      return NextResponse.json({ ok: true })
    }

    if (tipo === 'OS') {
      const status = String(body?.status ?? 'RECEBIDO').trim().toUpperCase()
      const forma = normalizarFormaPagamento(body?.forma)
      if (!['PENDENTE', 'FATURADO', 'PARCIAL', 'RECEBIDO'].includes(status)) {
        return NextResponse.json({ error: 'Status financeiro invalido.' }, { status: 400 })
      }

      const temValorRecebidoCliente = await colunaExiste(supabase, 'ordens_servico', 'valor_recebido_cliente')
      const temDataUltimoRecebimento = await colunaExiste(supabase, 'ordens_servico', 'data_ultimo_recebimento')
      const temDescontoRecebimentoCliente = await colunaExiste(supabase, 'ordens_servico', 'desconto_recebimento_cliente')
      const selectValorRecebido = temValorRecebidoCliente ? ', valor_recebido_cliente' : ''
      const selectDescontoRecebimento = temDescontoRecebimentoCliente ? ', desconto_recebimento_cliente' : ''
      const ordemAtualQuery = supabase.from('ordens_servico') as unknown as {
        select: (columns: string) => {
          eq: (column: string, value: number) => {
            maybeSingle: () => Promise<{ data: (Record<string, unknown> & {
              id?: number
              numero_os?: string | null
              status?: string | null
              status_financeiro?: string | null
              total?: number | string | null
              cliente_total?: number | string | null
              valor_recebido_cliente?: number | string | null
              desconto_recebimento_cliente?: number | string | null
            }) | null; error: unknown }>
          }
        }
      }
      const { data: ordemAtual, error: ordemAtualError } = await ordemAtualQuery
        .select(`id, numero_os, status, status_financeiro, total, cliente_total${selectValorRecebido}${selectDescontoRecebimento}`)
        .eq('id', id)
        .maybeSingle()

      if (ordemAtualError) throw ordemAtualError

      const pagamento = status === 'PARCIAL' || status === 'RECEBIDO'
      if (ordemAtual?.status !== 'FINALIZADA' && !(pagamento && status === 'PARCIAL')) {
        return NextResponse.json(
          { error: 'Somente OS finalizadas podem ser baixadas no recebimento. Para OS em andamento, lance como adiantamento parcial.' },
          { status: 400 }
        )
      }

      const totalCliente = valorPreferencial(ordemAtual?.cliente_total, ordemAtual?.total)
      const recebidoAtual = valorRecebidoCliente(ordemAtual)
      const descontoAtual = descontoRecebimentoCliente(ordemAtual)
      const valorLancado = toNumber(body?.valor)
      const descontoLancado = toNumber(body?.desconto)
      const agora = new Date().toISOString()
      const saldoAtual = Math.max(totalCliente - recebidoAtual - descontoAtual, 0)
      const proximoDesconto = pagamento ? Math.min(totalCliente, descontoAtual + descontoLancado) : status === 'PENDENTE' ? 0 : descontoAtual
      const proximoRecebido = pagamento
        ? Math.min(totalCliente, recebidoAtual + valorLancado)
        : status === 'PENDENTE'
          ? 0
          : recebidoAtual
      const statusFinal = pagamento
        ? proximoRecebido + proximoDesconto >= totalCliente
          ? 'RECEBIDO'
          : 'PARCIAL'
        : status

      if (pagamento && totalCliente <= 0) {
        return NextResponse.json({ error: 'OS sem valor para recebimento.' }, { status: 400 })
      }

      if (pagamento && !temValorRecebidoCliente) {
        return NextResponse.json(
          { error: 'Rode o SQL de recebimento parcial antes de baixar valores parciais.' },
          { status: 400 }
        )
      }

      if (pagamento && descontoLancado > 0 && !temDescontoRecebimentoCliente) {
        return NextResponse.json(
          { error: 'Rode o SQL de desconto no recebimento antes de conceder desconto.' },
          { status: 400 }
        )
      }

      if (pagamento && (valorLancado <= 0 || descontoLancado < 0 || valorLancado + descontoLancado > saldoAtual)) {
        return NextResponse.json({ error: 'Informe valor recebido e desconto validos para o saldo da OS.' }, { status: 400 })
      }

      const updatePayload: Record<string, unknown> = {
        status_financeiro: statusFinal,
        data_pagamento: statusFinal === 'RECEBIDO' ? agora : null,
      }
      if (temDataUltimoRecebimento && pagamento) {
        updatePayload.data_ultimo_recebimento = agora
      }
      if (temValorRecebidoCliente) {
        updatePayload.valor_recebido_cliente = proximoRecebido
      }
      if (temDescontoRecebimentoCliente) {
        updatePayload.desconto_recebimento_cliente = proximoDesconto
      }
      if (await colunaExiste(supabase, 'ordens_servico', 'forma_recebimento')) {
        updatePayload.forma_recebimento = pagamento ? forma : null
      }

      const { error } = await supabase
        .from('ordens_servico')
        .update(updatePayload)
        .eq('id', id)

      if (error) throw error
      await registrarHistoricoFinanceiro(supabase, {
        responsavel: `${auth.nome} (${auth.email})`,
        osId: id,
        tipo: 'RECEBIMENTO_OS',
        statusAnterior: ordemAtual?.status_financeiro ?? null,
        statusNovo: statusFinal,
        valor: pagamento ? valorLancado : totalCliente,
        descricao: pagamento
          ? `${ordemAtual?.numero_os ?? `OS #${id}`} recebeu ${formatCurrency(valorLancado)} via ${forma}${descontoLancado > 0 ? ` com desconto de ${formatCurrency(descontoLancado)}` : ''}. Saldo: ${formatCurrency(Math.max(totalCliente - proximoRecebido - proximoDesconto, 0))}.`
          : `${ordemAtual?.numero_os ?? `OS #${id}`} marcada como ${statusFinal}.`,
      })
      return NextResponse.json({ ok: true })
    }

    if (tipo === 'TECNICO') {
      const temPagamentoTecnico = await colunaExiste(supabase, 'ordens_servico', 'tecnico_status_pagamento')
      const forma = normalizarFormaPagamento(body?.forma)
      const pagoEm = new Date().toISOString()
      const { data: ordemAtual } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, status_financeiro, tecnico_status_pagamento, tecnico_total, total, parceiros:parceiro_id(tipo_vinculo)')
        .eq('id', id)
        .maybeSingle()

      const parceiro = Array.isArray(ordemAtual?.parceiros) ? ordemAtual.parceiros[0] : ordemAtual?.parceiros
      if (parceiro?.tipo_vinculo === 'PROPRIO') {
        return NextResponse.json({ error: 'Tecnico proprio deve ser pago pelo fechamento de comissoes.' }, { status: 400 })
      }

      const documentos = await carregarDocumentosTecnicos(supabase)
      const documentoRecebido = documentos.data.some(
        (doc: { os_id?: number | null }) => doc.os_id === id
      )

      if (!documentoRecebido) {
        return NextResponse.json(
          { error: 'Anexe a NF/recibo do tecnico antes de marcar o pagamento.' },
          { status: 400 }
        )
      }

      if (temPagamentoTecnico) {
        const { error } = await supabase
          .from('ordens_servico')
          .update({
            tecnico_status_pagamento: 'RECEBIDO',
            tecnico_pago_em: pagoEm,
            ...((await colunaExiste(supabase, 'ordens_servico', 'forma_pagamento_tecnico')) ? { forma_pagamento_tecnico: forma } : {}),
            status_financeiro: ordemAtual?.status_financeiro ?? null,
          })
          .eq('id', id)

        if (error) throw error
      }

      const { error: documentoError } = await supabase
        .from('tecnico_documentos')
        .update({ status: 'PAGO', pago_em: pagoEm })
        .eq('os_id', id)

      if (documentoError && String(documentoError.code) !== '42703' && String(documentoError.code) !== '42P01') {
        throw documentoError
      }

      await registrarHistoricoFinanceiro(supabase, {
        responsavel: `${auth.nome} (${auth.email})`,
        osId: id,
        tipo: 'PAGAMENTO_TECNICO',
        statusAnterior: ordemAtual?.tecnico_status_pagamento ?? null,
        statusNovo: 'RECEBIDO',
        valor: valorPreferencial(ordemAtual?.tecnico_total, 0),
        descricao: `${ordemAtual?.numero_os ?? `OS #${id}`} paga ao tecnico via ${forma}.`,
      })

      return NextResponse.json({ ok: true })
    }

    const { data: documento } = await supabase
      .from('tecnico_documentos')
      .select('id, os_id, status, valor, nome_arquivo')
      .eq('id', id)
      .maybeSingle()

    const pagoEm = new Date().toISOString()
    const { error } = await supabase
      .from('tecnico_documentos')
      .update({ status: 'PAGO', pago_em: pagoEm })
      .eq('id', id)

    if (error) throw error

    if (documento?.os_id && await colunaExiste(supabase, 'ordens_servico', 'tecnico_status_pagamento')) {
      const { error: osError } = await supabase
        .from('ordens_servico')
        .update({
          tecnico_status_pagamento: 'RECEBIDO',
          tecnico_pago_em: pagoEm,
        })
        .eq('id', documento.os_id)

      if (osError) throw osError
    }

    await registrarHistoricoFinanceiro(supabase, {
      responsavel: `${auth.nome} (${auth.email})`,
      osId: documento?.os_id ?? null,
      documentoId: id,
      tipo: 'DOCUMENTO_TECNICO',
      statusAnterior: documento?.status ?? null,
      statusNovo: 'PAGO',
      valor: toNumber(documento?.valor),
      descricao: `${documento?.nome_arquivo ?? `Documento #${id}`} marcado como pago.`,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao atualizar financeiro admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao atualizar financeiro.') },
      { status: 500 }
    )
  }
}

async function carregarHistoricoFinanceiro(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from('financeiro_historico')
    .select('id, os_id, documento_id, conta_id, tipo, status_anterior, status_novo, valor, descricao, responsavel, criado_em')
    .order('criado_em', { ascending: false })
    .limit(100)

  if (error) {
    if (String(error.code) === '42P01' || String(error.code) === 'PGRST205') {
      return { data: [], tabelaPendente: true }
    }
    throw error
  }

  return { data: data ?? [], tabelaPendente: false }
}

async function carregarResumoVendas(supabase: ReturnType<typeof getSupabaseAdmin>, unidadeId: number | null, unidadesPermitidas: number[]) {
  let query = supabase.from('vendas').select('total, criado_em').eq('status', 'PAGO')
  query = unidadeId ? query.eq('unidade_id', unidadeId) : query.in('unidade_id', unidadesPermitidas)
  const { data, error } = await query
  if (error) {
    if (String(error.code) === '42P01' || String(error.code) === 'PGRST205') return { total: 0, totalMes: 0, quantidade: 0 }
    throw error
  }
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  return {
    total: (data ?? []).reduce((acc, venda) => acc + toNumber(venda.total), 0),
    totalMes: (data ?? []).filter((venda) => venda.criado_em && new Date(venda.criado_em) >= inicioMes).reduce((acc, venda) => acc + toNumber(venda.total), 0),
    quantidade: data?.length ?? 0,
  }
}

async function registrarHistoricoFinanceiro(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  item: {
    osId?: number | null
    documentoId?: number | null
    contaId?: number | null
    tipo: string
    statusAnterior?: string | null
    statusNovo?: string | null
    valor: number
    descricao: string
    responsavel?: string
  }
) {
  const { error } = await supabase.from('financeiro_historico').insert({
    os_id: item.osId ?? null,
    documento_id: item.documentoId ?? null,
    conta_id: item.contaId ?? null,
    tipo: item.tipo,
    status_anterior: item.statusAnterior ?? null,
    status_novo: item.statusNovo ?? null,
    valor: item.valor,
    descricao: item.descricao,
    responsavel: item.responsavel ?? 'Admin',
  })

  if (
    error &&
    String(error.code) !== '42P01' &&
    String(error.code) !== 'PGRST205' &&
    String(error.code) !== '42703'
  ) {
    throw error
  }
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0) || 0
}

function valorPreferencial(principal: unknown, fallback: unknown) {
  return principal === null || principal === undefined || principal === '' ? toNumber(fallback as never) : toNumber(principal as never)
}

function valorRecebidoCliente(ordem: Record<string, unknown> | null | undefined) {
  if (!ordem) return 0
  const recebido = toNumber(ordem.valor_recebido_cliente as never)
  if (recebido > 0) return recebido
  return String(ordem.status_financeiro ?? '').toUpperCase() === 'RECEBIDO'
    ? valorPreferencial(ordem.cliente_total, ordem.total)
    : 0
}

function descontoRecebimentoCliente(ordem: Record<string, unknown> | null | undefined) {
  if (!ordem) return 0
  return Math.max(toNumber(ordem.desconto_recebimento_cliente as never), 0)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function normalizarFormaPagamento(value: unknown) {
  const forma = String(value ?? 'PIX').trim().toUpperCase()
  const permitidas = ['PIX', 'CARTAO', 'DEPOSITO', 'BOLETO', 'DINHEIRO']

  return permitidas.includes(forma) ? forma : 'PIX'
}

async function carregarDocumentosTecnicos(supabase: ReturnType<typeof getSupabaseAdmin>) {
  let { data, error } = await supabase
    .from('tecnico_documentos')
    .select('id, os_id, parceiro_id, tipo, valor, nome_arquivo, url, observacao, status, criado_em, pago_em')
    .order('criado_em', { ascending: false })

  if (error && String(error.code) === '42703') {
    const fallback = await supabase
      .from('tecnico_documentos')
      .select('id, parceiro_id, tipo, valor, nome_arquivo, url, observacao, status, criado_em, pago_em')
      .order('criado_em', { ascending: false })

    data = (fallback.data ?? []).map((doc) => ({ ...doc, os_id: null })) as unknown as typeof data
    error = fallback.error
  }

  if (error) {
    if (String(error.code) === '42P01') return { data: [], tabelaPendente: true }
    throw error
  }

  return { data: data ?? [], tabelaPendente: false }
}

async function carregarContasPagar(supabase: ReturnType<typeof getSupabaseAdmin>, unidadeId: number | null, unidadesPermitidas: number[]) {
  let query = supabase
    .from('contas_pagar')
    .select('id, descricao, fornecedor, categoria, valor, vencimento, status, forma_pagamento, pago_em, observacao, criado_em')
    .order('vencimento', { ascending: true, nullsFirst: false })
  query = unidadeId ? query.eq('unidade_id', unidadeId) : query.in('unidade_id', unidadesPermitidas)
  const { data, error } = await query

  if (error) {
    if (String(error.code) === '42P01' || String(error.code) === 'PGRST205') {
      return { data: [] as ContaPagar[], tabelaPendente: true }
    }
    throw error
  }

  return { data: (data ?? []) as ContaPagar[], tabelaPendente: false }
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code].filter(Boolean).map(String)
    if (possiveis.length > 0) return possiveis.join(' | ')
  }

  return fallback
}
