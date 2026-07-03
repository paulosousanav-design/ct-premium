import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type OrdemRelatorio = {
  id: number
  numero_os: string | null
  created_at: string | null
  finalizada_em?: string | null
  status: string | null
  status_financeiro?: string | null
  data_pagamento?: string | null
  data_ultimo_recebimento?: string | null
  garantia?: boolean | null
  total?: number | string | null
  cliente_total?: number | string | null
  valor_recebido_cliente?: number | string | null
  tecnico_total?: number | string | null
  tecnico_status_pagamento?: string | null
  tecnico_pago_em?: string | null
  tipo_atendimento?: string | null
  parceiro_id?: number | null
  garantidor_id?: number | null
  categorias?: { nome?: string | null } | { nome?: string | null }[] | null
  clientes?: { nome?: string | null } | { nome?: string | null }[] | null
  parceiros?: RelacaoNome | RelacaoNome[] | null
  garantidores?: RelacaoNome | RelacaoNome[] | null
}

type RelacaoNome = {
  nome?: string | null
  responsavel?: string | null
  nome_fantasia?: string | null
  razao_social?: string | null
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

async function tabelaExiste(supabase: ReturnType<typeof getSupabaseAdmin>, tabela: string) {
  const { error } = await supabase.from(tabela).select('id').limit(0)
  return !error
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'relatorios')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const hoje = new Date()
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const inicio = request.nextUrl.searchParams.get('inicio') || formatDateInput(primeiroDia)
    const fim = request.nextUrl.searchParams.get('fim') || formatDateInput(hoje)
    const origemFiltro = normalizarFiltro(request.nextUrl.searchParams.get('origemFinanceira'))
    const statusFinanceiroFiltro = normalizarFiltro(request.nextUrl.searchParams.get('statusFinanceiro'))
    const statusOsFiltro = normalizarFiltro(request.nextUrl.searchParams.get('statusOs'))
    const tecnicoFiltro = normalizarFiltro(request.nextUrl.searchParams.get('tecnico'))
    const garantidorFiltro = normalizarFiltro(request.nextUrl.searchParams.get('garantidor'))
    const inicioIso = `${inicio}T00:00:00.000Z`
    const fimIso = `${fim}T23:59:59.999Z`

    const temClienteTotal = await colunaExiste(supabase, 'ordens_servico', 'cliente_total')
    const temTecnicoTotal = await colunaExiste(supabase, 'ordens_servico', 'tecnico_total')
    const temFinanceiro = await colunaExiste(supabase, 'ordens_servico', 'status_financeiro')
    const temPagamentoTecnico = await colunaExiste(supabase, 'ordens_servico', 'tecnico_status_pagamento')
    const temDataPagamento = await colunaExiste(supabase, 'ordens_servico', 'data_pagamento')
    const temValorRecebidoCliente = await colunaExiste(supabase, 'ordens_servico', 'valor_recebido_cliente')
    const temDataUltimoRecebimento = await colunaExiste(supabase, 'ordens_servico', 'data_ultimo_recebimento')
    const temTecnicoPagoEm = await colunaExiste(supabase, 'ordens_servico', 'tecnico_pago_em')
    const temGarantidor = await colunaExiste(supabase, 'ordens_servico', 'garantidor_id')

    const selectOrdens = `
      id,
      numero_os,
      created_at,
      finalizada_em,
      status,
      garantia,
      total,
      ${temClienteTotal ? 'cliente_total,' : ''}
      ${temTecnicoTotal ? 'tecnico_total,' : ''}
      ${temFinanceiro ? 'status_financeiro,' : ''}
      ${temDataPagamento ? 'data_pagamento,' : ''}
      ${temValorRecebidoCliente ? 'valor_recebido_cliente,' : ''}
      ${temDataUltimoRecebimento ? 'data_ultimo_recebimento,' : ''}
      ${temPagamentoTecnico ? 'tecnico_status_pagamento,' : ''}
      ${temTecnicoPagoEm ? 'tecnico_pago_em,' : ''}
      tipo_atendimento,
      parceiro_id,
      ${temGarantidor ? 'garantidor_id,' : ''}
      categorias:categoria_id ( nome ),
      clientes:cliente_id ( nome ),
      parceiros:parceiro_id ( responsavel, nome_fantasia, razao_social )
      ${temGarantidor ? ', garantidores:garantidor_id ( nome )' : ''}
    `

    const { data: ordens, error: ordensError } = await supabase
      .from('ordens_servico')
      .select(selectOrdens)
      .gte('created_at', inicioIso)
      .lte('created_at', fimIso)
      .order('created_at', { ascending: false })

    if (ordensError) throw ordensError

    const inicioMensal = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1)
    const { data: ordensMensais, error: ordensMensaisError } = await supabase
      .from('ordens_servico')
      .select(selectOrdens)
      .gte('created_at', inicioMensal.toISOString())
      .lte('created_at', fimIso)
      .order('created_at', { ascending: true })

    if (ordensMensaisError) throw ordensMensaisError

    const ordensPeriodoBase = (ordens ?? []) as unknown as OrdemRelatorio[]
    const ordensPeriodo = filtrarOrdens(ordensPeriodoBase, {
      origemFinanceira: origemFiltro,
      statusFinanceiro: statusFinanceiroFiltro,
      statusOs: statusOsFiltro,
      tecnico: tecnicoFiltro,
      garantidor: garantidorFiltro,
    })
    const documentosTecnicosPagos = await carregarDocumentosTecnicosPagos(supabase)
    const statusResumo = agruparPorStatus(ordensPeriodo)
    const tecnicoResumo = agruparPorNome(ordensPeriodo, (ordem) => getNomeRelacao(ordem.parceiros) || 'Sem tecnico')
    const garantidorResumo = agruparPorNome(
      ordensPeriodo.filter(ehGarantidorOuSeguradora),
      (ordem) => getNomeRelacao(ordem.garantidores) || 'Sem garantidor'
    )
    const ticketCategorias = montarTicketPorCategoria(ordensPeriodo)

    const financeiro = ordensPeriodo.reduce(
      (acc, ordem) => {
        const valorCliente = valorPreferencial(ordem.cliente_total, ordem.total)
        const valorTecnico = valorPreferencial(ordem.tecnico_total, 0)
        const recebidoCliente = valorRecebidoCliente(ordem)
        const aReceberCliente = ordem.status === 'FINALIZADA' ? Math.max(valorCliente - recebidoCliente, 0) : 0
        const tecnicoPago =
          String(ordem.tecnico_status_pagamento ?? '').toUpperCase() === 'RECEBIDO' ||
          documentosTecnicosPagos.has(ordem.id)
        const origemGarantidor = ehGarantidorOuSeguradora(ordem)
        const contaPagamentoTecnico = ordem.status === 'FINALIZADA' && Boolean(ordem.parceiro_id)

        if (origemGarantidor) {
          acc.valorGarantidor += valorCliente
          acc.recebidoGarantidor += recebidoCliente
          acc.aReceberGarantidor += aReceberCliente
        } else {
          acc.valorCliente += valorCliente
          acc.recebidoCliente += recebidoCliente
          acc.aReceberCliente += aReceberCliente
        }

        if (contaPagamentoTecnico) {
          acc.aPagarTecnico += tecnicoPago ? 0 : valorTecnico
          acc.pagoTecnico += tecnicoPago ? valorTecnico : 0
        }

        return acc
      },
      {
        valorCliente: 0,
        recebidoCliente: 0,
        aReceberCliente: 0,
        valorGarantidor: 0,
        recebidoGarantidor: 0,
        aReceberGarantidor: 0,
        aPagarTecnico: 0,
        pagoTecnico: 0,
      }
    )

    const pecas = await carregarResumoPecas(supabase)
    const contasPagar = await carregarResumoContasPagar(supabase, inicioIso, fimIso)
    const contasPagarMensal = await carregarResumoContasPagar(supabase, inicioMensal.toISOString(), fimIso)
    const resumoMensal = montarResumoMensal(
      filtrarOrdens((ordensMensais ?? []) as unknown as OrdemRelatorio[], {
        origemFinanceira: origemFiltro,
        statusFinanceiro: statusFinanceiroFiltro,
        statusOs: statusOsFiltro,
        tecnico: tecnicoFiltro,
        garantidor: garantidorFiltro,
      }),
      inicioMensal,
      hoje,
      contasPagarMensal.itens
    )
    const resultadoLiquido =
      financeiro.recebidoCliente + financeiro.recebidoGarantidor - financeiro.pagoTecnico - contasPagar.pagas

    return NextResponse.json({
      periodo: { inicio, fim },
      filtros: {
        origemFinanceira: origemFiltro,
        statusFinanceiro: statusFinanceiroFiltro,
        statusOs: statusOsFiltro,
        tecnico: tecnicoFiltro,
        garantidor: garantidorFiltro,
        opcoes: montarOpcoesFiltro(ordensPeriodoBase),
      },
      cards: {
        totalOs: ordensPeriodo.length,
        novas: ordensPeriodo.filter((ordem) => ordem.status === 'NOVA').length,
        emAndamento: ordensPeriodo.filter((ordem) => ['EM_TRIAGEM', 'EM_ATENDIMENTO'].includes(ordem.status ?? '')).length,
        finalizadas: ordensPeriodo.filter((ordem) => ordem.status === 'FINALIZADA').length,
        garantia: ordensPeriodo.filter((ordem) => ordem.garantia).length,
        valorCliente: financeiro.valorCliente,
        recebidoCliente: financeiro.recebidoCliente,
        aReceberCliente: financeiro.aReceberCliente,
        valorGarantidor: financeiro.valorGarantidor,
        recebidoGarantidor: financeiro.recebidoGarantidor,
        aReceberGarantidor: financeiro.aReceberGarantidor,
        valorFaturamento: financeiro.valorCliente + financeiro.valorGarantidor,
        recebidoTotal: financeiro.recebidoCliente + financeiro.recebidoGarantidor,
        aReceberTotal: financeiro.aReceberCliente + financeiro.aReceberGarantidor,
        aPagarTecnico: financeiro.aPagarTecnico,
        pagoTecnico: financeiro.pagoTecnico,
        contasAPagar: contasPagar.pendentes,
        contasPagas: contasPagar.pagas,
        resultadoLiquido,
        margemTotal: financeiro.valorCliente + financeiro.valorGarantidor - financeiro.aPagarTecnico - financeiro.pagoTecnico,
        ticketMedioBruto: mediaValor(financeiro.valorCliente + financeiro.valorGarantidor, ordensComValor(ordensPeriodo).length),
        ticketMedioMargem: mediaValor(
          financeiro.valorCliente + financeiro.valorGarantidor - financeiro.aPagarTecnico - financeiro.pagoTecnico,
          ordensComValor(ordensPeriodo).length
        ),
        estoqueBaixo: pecas.estoqueBaixo,
        valorEstoque: pecas.valorEstoque,
      },
      statusResumo,
      tecnicoResumo,
      garantidorResumo,
      resumoMensal,
      ticketCategorias,
      pecas,
      contasPagar,
      despesasCategorias: contasPagar.despesasCategorias,
      ultimasOrdens: ordensPeriodo.slice(0, 12).map((ordem) => ({
        id: ordem.id,
        numero_os: ordem.numero_os,
        cliente: getNomeRelacao(ordem.clientes) || '-',
        tecnico: getNomeRelacao(ordem.parceiros) || '-',
        status: ordem.status,
        garantia: Boolean(ordem.garantia),
        origemFinanceira: ehGarantidorOuSeguradora(ordem) ? 'GARANTIDOR/SEGURADORA' : 'CLIENTE',
        valor: valorPreferencial(ordem.cliente_total, ordem.total),
        criada_em: ordem.created_at,
      })),
    })
  } catch (error) {
    console.error('Erro ao carregar relatorios:', error)
    return NextResponse.json({ error: formatarErro(error, 'Erro ao carregar relatorios.') }, { status: 500 })
  }
}

function normalizarFiltro(value: string | null) {
  return String(value || 'TODOS').trim() || 'TODOS'
}

function filtrarOrdens(
  ordens: OrdemRelatorio[],
  filtros: {
    origemFinanceira: string
    statusFinanceiro: string
    statusOs: string
    tecnico: string
    garantidor: string
  }
) {
  return ordens.filter((ordem) => {
    const origemGarantidor = ehGarantidorOuSeguradora(ordem)
    const origem = origemGarantidor ? 'GARANTIDOR' : 'CLIENTE'
    const statusFinanceiro = String(ordem.status_financeiro ?? 'PENDENTE').toUpperCase()
    const statusOs = String(ordem.status ?? 'SEM_STATUS').toUpperCase()
    const tecnico = getNomeRelacao(ordem.parceiros) || 'Sem tecnico'
    const garantidor = getNomeRelacao(ordem.garantidores) || 'Sem garantidor'

    return (
      (filtros.origemFinanceira === 'TODOS' || filtros.origemFinanceira === origem) &&
      (filtros.statusFinanceiro === 'TODOS' || filtros.statusFinanceiro === statusFinanceiro) &&
      (filtros.statusOs === 'TODOS' || filtros.statusOs === statusOs) &&
      (filtros.tecnico === 'TODOS' || filtros.tecnico === tecnico) &&
      (filtros.garantidor === 'TODOS' || filtros.garantidor === garantidor)
    )
  })
}

function montarOpcoesFiltro(ordens: OrdemRelatorio[]) {
  return {
    statusOs: valoresUnicos(ordens.map((ordem) => String(ordem.status ?? 'SEM_STATUS').toUpperCase())),
    statusFinanceiro: valoresUnicos(ordens.map((ordem) => String(ordem.status_financeiro ?? 'PENDENTE').toUpperCase())),
    tecnicos: valoresUnicos(ordens.map((ordem) => getNomeRelacao(ordem.parceiros) || 'Sem tecnico')),
    garantidores: valoresUnicos(
      ordens
        .filter(ehGarantidorOuSeguradora)
        .map((ordem) => getNomeRelacao(ordem.garantidores) || 'Sem garantidor')
    ),
  }
}

function valoresUnicos(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

async function carregarDocumentosTecnicosPagos(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const documentosExiste = await tabelaExiste(supabase, 'tecnico_documentos')
  if (!documentosExiste) return new Set<number>()

  const { data, error } = await supabase
    .from('tecnico_documentos')
    .select('os_id, status')
    .eq('status', 'PAGO')

  if (error) return new Set<number>()

  return new Set(
    (data ?? [])
      .map((item: { os_id?: number | null }) => item.os_id)
      .filter((id): id is number => typeof id === 'number')
  )
}

async function carregarResumoPecas(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const pecasExiste = await tabelaExiste(supabase, 'pecas')
  if (!pecasExiste) {
    return { total: 0, estoqueBaixo: 0, valorEstoque: 0, movimentacoes: [] }
  }

  const { data: pecas, error } = await supabase
    .from('pecas')
    .select('id, codigo, descricao, valor_custo, estoque, estoque_minimo, localizacao')
    .order('descricao', { ascending: true })

  if (error) throw error

  const lista = (pecas ?? []) as Array<{
    id: number
    codigo?: string | null
    descricao?: string | null
    valor_custo?: number | string | null
    estoque?: number | string | null
    estoque_minimo?: number | string | null
    localizacao?: string | null
  }>

  const movimentacoesExiste = await tabelaExiste(supabase, 'pecas_movimentacoes')
  let movimentacoes: unknown[] = []
  if (movimentacoesExiste) {
    const { data: movs, error: movError } = await supabase
      .from('pecas_movimentacoes')
      .select('id, tipo, quantidade, estoque_anterior, estoque_posterior, criado_em, pecas:peca_id ( descricao ), ordens_servico:os_id ( numero_os )')
      .order('criado_em', { ascending: false })
      .limit(8)

    if (movError) throw movError
    movimentacoes = movs ?? []
  }

  return {
    total: lista.length,
    estoqueBaixo: lista.filter((peca) => toNumber(peca.estoque) <= toNumber(peca.estoque_minimo)).length,
    valorEstoque: lista.reduce((acc, peca) => acc + toNumber(peca.estoque) * toNumber(peca.valor_custo), 0),
    itensBaixos: lista
      .filter((peca) => toNumber(peca.estoque) <= toNumber(peca.estoque_minimo))
      .slice(0, 8)
      .map((peca) => ({
        id: peca.id,
        descricao: peca.descricao,
        codigo: peca.codigo,
        estoque: toNumber(peca.estoque),
        minimo: toNumber(peca.estoque_minimo),
        localizacao: peca.localizacao,
      })),
    movimentacoes,
  }
}

async function carregarResumoContasPagar(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  inicioIso: string,
  fimIso: string
) {
  const existe = await tabelaExiste(supabase, 'contas_pagar')
  if (!existe) {
    return { pendentes: 0, pagas: 0, total: 0, despesasCategorias: [], itens: [] }
  }

  const { data, error } = await supabase
    .from('contas_pagar')
    .select('id, descricao, fornecedor, categoria, valor, vencimento, status, forma_pagamento, pago_em, criado_em')
    .order('vencimento', { ascending: true, nullsFirst: false })

  if (error) throw error

  const lista = (data ?? []) as Array<{
    id: number
    descricao?: string | null
    fornecedor?: string | null
    categoria?: string | null
    valor?: number | string | null
    vencimento?: string | null
    status?: string | null
    forma_pagamento?: string | null
    pago_em?: string | null
    criado_em?: string | null
  }>

  const inicioTime = new Date(inicioIso).getTime()
  const fimTime = new Date(fimIso).getTime()
  const listaPeriodo = lista.filter((conta) => {
    const status = String(conta.status ?? 'PENDENTE').toUpperCase()
    const dataBase = status === 'PAGO' ? conta.pago_em ?? conta.criado_em : conta.criado_em
    return estaNoPeriodo(dataBase, inicioTime, fimTime)
  })

  const pendentes = listaPeriodo
    .filter((conta) => String(conta.status ?? 'PENDENTE').toUpperCase() === 'PENDENTE')
    .reduce((acc, conta) => acc + toNumber(conta.valor), 0)
  const pagas = listaPeriodo
    .filter((conta) => String(conta.status ?? '').toUpperCase() === 'PAGO')
    .reduce((acc, conta) => acc + toNumber(conta.valor), 0)
  const despesasCategorias = montarDespesasPorCategoria(
    listaPeriodo.filter((conta) => String(conta.status ?? '').toUpperCase() === 'PAGO')
  )

  return {
    pendentes,
    pagas,
    total: pendentes + pagas,
    despesasCategorias,
    itens: listaPeriodo.slice(0, 24),
  }
}

function montarDespesasPorCategoria(
  contas: Array<{ categoria?: string | null; valor?: number | string | null }>
) {
  const mapa = new Map<string, number>()

  for (const conta of contas) {
    const categoria = String(conta.categoria ?? 'OUTROS').toUpperCase()
    mapa.set(categoria, (mapa.get(categoria) ?? 0) + toNumber(conta.valor))
  }

  return Array.from(mapa.entries())
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor)
}

function agruparPorStatus(ordens: OrdemRelatorio[]) {
  const mapa = new Map<string, number>()
  for (const ordem of ordens) {
    const status = ordem.status ?? 'SEM_STATUS'
    mapa.set(status, (mapa.get(status) ?? 0) + 1)
  }

  return Array.from(mapa.entries())
    .map(([status, total]) => ({ status, total }))
    .sort((a, b) => b.total - a.total)
}

function agruparPorNome(ordens: OrdemRelatorio[], getNome: (ordem: OrdemRelatorio) => string) {
  const mapa = new Map<string, { nome: string; total: number; valor: number }>()
  for (const ordem of ordens) {
    const nome = getNome(ordem)
    const atual = mapa.get(nome) ?? { nome, total: 0, valor: 0 }
    atual.total += 1
    atual.valor += valorPreferencial(ordem.cliente_total, ordem.total)
    mapa.set(nome, atual)
  }

  return Array.from(mapa.values()).sort((a, b) => b.total - a.total).slice(0, 8)
}

function montarTicketPorCategoria(ordens: OrdemRelatorio[]) {
  const mapa = new Map<
    string,
    { categoria: string; totalOs: number; faturamento: number; tecnico: number; margem: number }
  >()

  for (const ordem of ordensComValor(ordens)) {
    const categoria = getNomeRelacao(ordem.categorias) || 'Sem categoria'
    const atual = mapa.get(categoria) ?? {
      categoria,
      totalOs: 0,
      faturamento: 0,
      tecnico: 0,
      margem: 0,
    }
    const faturamento = valorPreferencial(ordem.cliente_total, ordem.total)
    const tecnico = valorPreferencial(ordem.tecnico_total, 0)

    atual.totalOs += 1
    atual.faturamento += faturamento
    atual.tecnico += tecnico
    atual.margem += faturamento - tecnico
    mapa.set(categoria, atual)
  }

  return Array.from(mapa.values())
    .map((item) => ({
      ...item,
      ticketBruto: mediaValor(item.faturamento, item.totalOs),
      ticketMargem: mediaValor(item.margem, item.totalOs),
    }))
    .sort((a, b) => b.margem - a.margem)
}

function ordensComValor(ordens: OrdemRelatorio[]) {
  return ordens.filter((ordem) => valorPreferencial(ordem.cliente_total, ordem.total) > 0)
}

function mediaValor(total: number, quantidade: number) {
  return quantidade > 0 ? total / quantidade : 0
}

function montarResumoMensal(
  ordens: OrdemRelatorio[],
  inicio: Date,
  fim: Date,
  contas: Array<{ valor?: number | string | null; status?: string | null; pago_em?: string | null; criado_em?: string | null }>
) {
  const meses: Array<{
    chave: string
    label: string
    totalOs: number
    valor: number
    recebido: number
    pagoTecnico: number
    contasPagas: number
    resultadoLiquido: number
  }> = []
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1)
  const fimMes = new Date(fim.getFullYear(), fim.getMonth(), 1)

  while (cursor <= fimMes) {
    const chave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    meses.push({
      chave,
      label: cursor.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      totalOs: 0,
      valor: 0,
      recebido: 0,
      pagoTecnico: 0,
      contasPagas: 0,
      resultadoLiquido: 0,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  const mapa = new Map(meses.map((mes) => [mes.chave, mes]))

  for (const ordem of ordens) {
    if (!ordem.created_at) continue
    const data = new Date(ordem.created_at)
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
    const mes = mapa.get(chave)
    if (!mes) continue

    const valor = valorPreferencial(ordem.cliente_total, ordem.total)
    const valorTecnico = valorPreferencial(ordem.tecnico_total, 0)
    mes.totalOs += 1
    mes.valor += valor
    const recebido = valorRecebidoCliente(ordem)
    if (recebido > 0) {
      const dataRecebimento = ordem.data_ultimo_recebimento || ordem.data_pagamento
        ? new Date(ordem.data_ultimo_recebimento ?? ordem.data_pagamento ?? '')
        : data
      const chaveRecebimento = `${dataRecebimento.getFullYear()}-${String(dataRecebimento.getMonth() + 1).padStart(2, '0')}`
      const mesRecebimento = mapa.get(chaveRecebimento)
      if (mesRecebimento) mesRecebimento.recebido += recebido
    }
    if (String(ordem.tecnico_status_pagamento ?? '').toUpperCase() === 'RECEBIDO') {
      const dataPagamento = ordem.tecnico_pago_em ? new Date(ordem.tecnico_pago_em) : data
      const chavePagamento = `${dataPagamento.getFullYear()}-${String(dataPagamento.getMonth() + 1).padStart(2, '0')}`
      const mesPagamento = mapa.get(chavePagamento)
      if (mesPagamento) mesPagamento.pagoTecnico += valorTecnico
    }
  }

  for (const conta of contas) {
    if (String(conta.status ?? '').toUpperCase() !== 'PAGO') continue
    const data = new Date(conta.pago_em ?? conta.criado_em ?? '')
    if (!Number.isFinite(data.getTime())) continue
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
    const mes = mapa.get(chave)
    if (!mes) continue
    mes.contasPagas += toNumber(conta.valor)
  }

  for (const mes of meses) {
    mes.resultadoLiquido = mes.recebido - mes.pagoTecnico - mes.contasPagas
  }

  return meses
}

function ehGarantidorOuSeguradora(ordem: OrdemRelatorio) {
  const tipo = String(ordem.tipo_atendimento ?? '').toUpperCase()
  return Boolean(ordem.garantia) || tipo === 'GARANTIA' || tipo === 'SEGURO'
}

function primeiraRelacao<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getNomeRelacao(value: RelacaoNome | RelacaoNome[] | null | undefined) {
  const item = primeiraRelacao(value)
  return item?.nome ?? item?.responsavel ?? item?.nome_fantasia ?? item?.razao_social ?? ''
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function valorPreferencial(principal: unknown, fallback: unknown) {
  return principal === null || principal === undefined || principal === '' ? toNumber(fallback) : toNumber(principal)
}

function valorRecebidoCliente(ordem: OrdemRelatorio) {
  const total = valorPreferencial(ordem.cliente_total, ordem.total)
  const recebido = toNumber(ordem.valor_recebido_cliente)
  if (recebido > 0) return Math.min(recebido, total)
  return String(ordem.status_financeiro ?? '').toUpperCase() === 'RECEBIDO' ? total : 0
}

function estaNoPeriodo(value: string | null | undefined, inicioTime: number, fimTime: number) {
  if (!value) return false
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  return time >= inicioTime && time <= fimTime
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
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
