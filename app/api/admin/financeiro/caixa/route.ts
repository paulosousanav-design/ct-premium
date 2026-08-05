import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminEscopoGerencial } from '@/lib/admin-unidade'
import { cabecalhosAuditoria, type AtorAuditoria } from '@/lib/auditoria-contexto'
import { registrarEventoSistema } from '@/lib/monitoramento'
import { registrarMovimentoFinanceiro } from '@/lib/financeiro-contas'
import {
  calcularDiferencaCaixa,
  calcularResumoCaixa,
  normalizarFormaCaixa,
  type MovimentoCaixaCalculo,
} from '@/lib/calculos-caixa'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type Registro = Record<string, unknown>
type AuthGerencial = Extract<Awaited<ReturnType<typeof requireAdminEscopoGerencial>>, { ok: true }>

function db(request?: NextRequest, ator?: AtorAuditoria) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: request && ator ? { headers: cabecalhosAuditoria(request, ator) } : undefined,
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await autenticarUnidade(request)
    if (!auth.ok) return auth.response
    const supabase = db()
    if (!(await tabelaExiste(supabase, 'caixa_sessoes'))) {
      return NextResponse.json({ estruturaPendente: true, sessao: null, historico: [] })
    }

    return NextResponse.json(await montarPainel(supabase, auth))
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'FINANCEIRO_CAIXA', gravidade: 'CRITICO', request })
    return NextResponse.json({ error: mensagem(error, 'Erro ao carregar o fechamento de caixa.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await autenticarUnidade(request)
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const acao = texto(body?.acao).toUpperCase()
    const supabase = db(request, auth)
    if (!(await tabelaExiste(supabase, 'caixa_sessoes'))) {
      return NextResponse.json({ error: 'Execute o arquivo supabase-add-fechamento-caixa.sql antes de utilizar o caixa.' }, { status: 400 })
    }

    if (acao === 'ABRIR') return abrirCaixa(supabase, auth, body)
    if (acao === 'MOVIMENTO') return adicionarMovimento(supabase, auth, body)
    if (acao === 'ESTORNAR') return estornarMovimento(supabase, auth, body)
    if (acao === 'FECHAR') return fecharCaixa(supabase, auth, body)
    return NextResponse.json({ error: 'Acao de caixa invalida.' }, { status: 400 })
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'FINANCEIRO_CAIXA', gravidade: 'CRITICO', request })
    return NextResponse.json({ error: mensagem(error, 'Erro ao atualizar o caixa.') }, { status: 500 })
  }
}

async function abrirCaixa(supabase: ReturnType<typeof db>, auth: AuthGerencial, body: Record<string, unknown>) {
  const saldoInicial = dinheiro(body?.saldoInicial)
  if (saldoInicial < 0) return NextResponse.json({ error: 'O saldo inicial nao pode ser negativo.' }, { status: 400 })
  const unidadeId = Number(auth.unidadeId)
  const { data: aberta } = await supabase.from('caixa_sessoes').select('id').eq('unidade_id', unidadeId).eq('status', 'ABERTO').maybeSingle()
  if (aberta) return NextResponse.json({ error: 'Esta unidade ja possui um caixa aberto.' }, { status: 409 })
  const { data: contaCaixa, error: contaError } = await supabase.from('contas_financeiras').select('id').eq('unidade_id', unidadeId).eq('tipo', 'CAIXA').eq('ativa', true).order('padrao_dinheiro', { ascending: false }).limit(1).maybeSingle()
  if (contaError) throw contaError
  if (!contaCaixa) return NextResponse.json({ error: 'Cadastre uma conta do tipo Caixa físico antes de abrir o caixa.' }, { status: 400 })

  const { data, error } = await supabase.from('caixa_sessoes').insert({
    unidade_id: unidadeId,
    conta_caixa_id: contaCaixa.id,
    data_operacao: dataCuiaba(),
    saldo_inicial_dinheiro: saldoInicial,
    aberto_por_id: auth.usuarioId,
    aberto_por_nome: auth.nome,
    aberto_por_email: auth.email,
    observacao_abertura: texto(body?.observacao) || null,
  }).select('id').single()
  if (error) throw error
  return NextResponse.json({ ok: true, id: data.id })
}

async function adicionarMovimento(supabase: ReturnType<typeof db>, auth: AuthGerencial, body: Record<string, unknown>) {
  const unidadeId = Number(auth.unidadeId)
  const sessao = await buscarSessaoAberta(supabase, unidadeId)
  if (!sessao) return NextResponse.json({ error: 'Abra o caixa antes de registrar movimentos.' }, { status: 400 })
  const tipo = texto(body?.tipo).toUpperCase()
  if (!['SANGRIA', 'SUPRIMENTO', 'ENTRADA_MANUAL', 'SAIDA_MANUAL'].includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de movimento invalido.' }, { status: 400 })
  }
  const valor = dinheiro(body?.valor)
  const descricao = texto(body?.descricao)
  if (valor <= 0 || !descricao) return NextResponse.json({ error: 'Informe um valor maior que zero e o motivo do movimento.' }, { status: 400 })
  const natureza = ['SUPRIMENTO', 'ENTRADA_MANUAL'].includes(tipo) ? 'ENTRADA' : 'SAIDA'
  const forma = ['SANGRIA', 'SUPRIMENTO'].includes(tipo) ? 'DINHEIRO' : normalizarFormaCaixa(body?.forma)
  const { data: movimento, error } = await supabase.from('caixa_movimentos').insert({
    sessao_id: sessao.id,
    unidade_id: unidadeId,
    tipo,
    natureza,
    forma,
    valor,
    descricao,
    criado_por_id: auth.usuarioId,
    criado_por_nome: auth.nome,
    criado_por_email: auth.email,
  }).select('id').single()
  if (error) throw error
  await registrarMovimentoFinanceiro(supabase, { unidadeId, contaId: Number(sessao.conta_caixa_id), natureza, tipo, forma, valorBruto: valor, origemTipo: 'CAIXA_MOVIMENTO', origemId: movimento.id, descricao, usuarioId: auth.usuarioId, nome: auth.nome, email: auth.email })
  return NextResponse.json({ ok: true })
}

async function estornarMovimento(supabase: ReturnType<typeof db>, auth: AuthGerencial, body: Record<string, unknown>) {
  const id = Number(body?.id)
  const motivo = texto(body?.motivo)
  if (!id || !motivo) return NextResponse.json({ error: 'Informe o movimento e o motivo do estorno.' }, { status: 400 })
  const unidadeId = Number(auth.unidadeId)
  const sessao = await buscarSessaoAberta(supabase, unidadeId)
  if (!sessao) return NextResponse.json({ error: 'Somente movimentos de um caixa aberto podem ser estornados.' }, { status: 400 })
  const { data, error } = await supabase.from('caixa_movimentos').update({
    status: 'ESTORNADO',
    estornado_por_id: auth.usuarioId,
    estornado_por_nome: auth.nome,
    estornado_por_email: auth.email,
    estornado_em: new Date().toISOString(),
    estorno_motivo: motivo,
  }).eq('id', id).eq('sessao_id', sessao.id).eq('unidade_id', unidadeId).eq('status', 'ATIVO').select('id').maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Movimento nao localizado ou ja estornado.' }, { status: 404 })
  await supabase.from('movimentos_financeiros').update({ status: 'ESTORNADO', estornado_em: new Date().toISOString(), estorno_motivo: motivo }).eq('origem_tipo', 'CAIXA_MOVIMENTO').eq('origem_id', String(id)).eq('unidade_id', unidadeId).eq('status', 'ATIVO')
  return NextResponse.json({ ok: true })
}

async function fecharCaixa(supabase: ReturnType<typeof db>, auth: AuthGerencial, body: Record<string, unknown>) {
  const unidadeId = Number(auth.unidadeId)
  const sessao = await buscarSessaoAberta(supabase, unidadeId)
  if (!sessao) return NextResponse.json({ error: 'Nenhum caixa aberto nesta unidade.' }, { status: 400 })
  const painel = await montarPainel(supabase, auth)
  const resumo = painel.resumo
  if (!resumo) throw new Error('Nao foi possivel calcular o resumo do caixa.')
  const contado = dinheiro(body?.dinheiroContado)
  if (contado < 0) return NextResponse.json({ error: 'O dinheiro contado nao pode ser negativo.' }, { status: 400 })
  const diferenca = calcularDiferencaCaixa(contado, resumo.dinheiroEsperado)
  const observacao = texto(body?.observacao)
  if (Math.abs(diferenca) >= 0.01 && !observacao) {
    return NextResponse.json({ error: 'Informe uma justificativa para a diferenca encontrada no caixa.' }, { status: 400 })
  }

  const fechamentoEm = new Date().toISOString()
  const { data, error } = await supabase.from('caixa_sessoes').update({
    status: 'FECHADO',
    fechado_por_id: auth.usuarioId,
    fechado_por_nome: auth.nome,
    fechado_por_email: auth.email,
    fechado_em: fechamentoEm,
    dinheiro_esperado: resumo.dinheiroEsperado,
    dinheiro_contado: contado,
    diferenca_dinheiro: diferenca,
    total_entradas: resumo.totalEntradas,
    total_saidas: resumo.totalSaidas,
    resultado_liquido: resumo.resultadoLiquido,
    resumo_fechamento: { ...resumo, movimentosAutomaticos: painel.movimentosAutomaticos, movimentosManuais: painel.movimentosManuais },
    observacao_fechamento: observacao || null,
    atualizado_em: fechamentoEm,
  }).eq('id', sessao.id).eq('unidade_id', unidadeId).eq('status', 'ABERTO').select('id').maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'O caixa ja foi encerrado por outro usuario.' }, { status: 409 })
  return NextResponse.json({ ok: true, diferenca })
}

async function montarPainel(supabase: ReturnType<typeof db>, auth: AuthGerencial) {
  const unidadeId = Number(auth.unidadeId)
  const { data: sessao, error: sessaoError } = await supabase.from('caixa_sessoes').select('*').eq('unidade_id', unidadeId).eq('status', 'ABERTO').maybeSingle()
  if (sessaoError) throw sessaoError
  const { data: historico, error: historicoError } = await supabase.from('caixa_sessoes').select('*').eq('unidade_id', unidadeId).eq('status', 'FECHADO').order('fechado_em', { ascending: false }).limit(30)
  if (historicoError) throw historicoError
  if (!sessao) return { estruturaPendente: false, sessao: null, resumo: null, movimentosAutomaticos: [], movimentosManuais: [], historico: historico ?? [] }

  const [{ data: manuais, error: manuaisError }, automaticos] = await Promise.all([
    supabase.from('caixa_movimentos').select('*').eq('sessao_id', sessao.id).eq('unidade_id', unidadeId).order('criado_em', { ascending: false }),
    carregarMovimentosAutomaticos(supabase, unidadeId, String(sessao.aberto_em)),
  ])
  if (manuaisError) throw manuaisError
  const movimentosManuais: Registro[] = ((manuais ?? []) as Registro[]).map((item) => ({ ...item, origem: 'MANUAL' }))
  const ativos = movimentosManuais.filter((item) => item.status === 'ATIVO')
  const calculo: MovimentoCaixaCalculo[] = [...automaticos, ...ativos].map((item) => ({
    natureza: item.natureza as 'ENTRADA' | 'SAIDA',
    forma: normalizarFormaCaixa(item.forma),
    valor: numero(item.valor),
  }))
  const resumo = calcularResumoCaixa(numero(sessao.saldo_inicial_dinheiro), calculo)
  return { estruturaPendente: false, sessao, resumo, movimentosAutomaticos: automaticos, movimentosManuais, historico: historico ?? [] }
}

async function carregarMovimentosAutomaticos(supabase: ReturnType<typeof db>, unidadeId: number, abertoEm: string) {
  if (await tabelaExiste(supabase, 'movimentos_financeiros')) {
    const { data, error } = await supabase.from('movimentos_financeiros').select('id, natureza, forma, valor_bruto, taxa_valor, valor_liquido, tipo, descricao, criado_em').eq('unidade_id', unidadeId).eq('status', 'ATIVO').neq('origem_tipo', 'CAIXA_MOVIMENTO').gte('criado_em', abertoEm).order('criado_em', { ascending: true }).limit(5000)
    if (error) throw error
    return ((data ?? []) as Registro[]).map((item) => ({ id: `M${item.id}`, origem: item.tipo, natureza: item.natureza, forma: normalizarFormaCaixa(item.forma), valor: numero(item.valor_liquido), valor_bruto: numero(item.valor_bruto), taxa: numero(item.taxa_valor), descricao: item.descricao, criado_em: item.criado_em }))
  }
  const historicoQuery = supabase.from('financeiro_historico').select('id, os_id, conta_id, tipo, status_novo, valor, valor_principal, juros, multa, valor_liquido, descricao, criado_em').gte('criado_em', abertoEm).order('criado_em', { ascending: true }).limit(5000)
  let { data: historico, error: historicoError } = await historicoQuery
  if (historicoError && String(historicoError.code) === '42703') {
    const fallback = await supabase.from('financeiro_historico').select('id, os_id, conta_id, tipo, status_novo, valor, descricao, criado_em').gte('criado_em', abertoEm).order('criado_em', { ascending: true }).limit(5000)
    historico = fallback.data as typeof historico
    historicoError = fallback.error
  }
  if (historicoError && !['42P01', 'PGRST205'].includes(String(historicoError.code))) throw historicoError
  const registros = (historico ?? []) as unknown as Registro[]
  const osIds = [...new Set(registros.map((item) => Number(item.os_id)).filter(Boolean))]
  const contaIds = [...new Set(registros.map((item) => Number(item.conta_id)).filter(Boolean))]
  const [{ data: ordens }, { data: contas }, { data: vendas, error: vendasError }] = await Promise.all([
    osIds.length ? supabase.from('ordens_servico').select('id, unidade_id, numero_os').in('id', osIds) : Promise.resolve({ data: [] }),
    contaIds.length ? supabase.from('contas_pagar').select('id, unidade_id, descricao').in('id', contaIds) : Promise.resolve({ data: [] }),
    supabase.from('vendas').select('id, numero_venda, total, forma_recebimento, criado_em').eq('unidade_id', unidadeId).eq('status', 'PAGO').gte('criado_em', abertoEm).order('criado_em', { ascending: true }),
  ])
  if (vendasError && !['42P01', 'PGRST205'].includes(String(vendasError.code))) throw vendasError
  const osUnidade = new Map(((ordens ?? []) as Registro[]).map((item) => [Number(item.id), Number(item.unidade_id)]))
  const contasUnidade = new Map(((contas ?? []) as Registro[]).map((item) => [Number(item.id), Number(item.unidade_id)]))
  const automaticos: Registro[] = []

  for (const item of registros) {
    const tipo = texto(item.tipo).toUpperCase()
    const osId = Number(item.os_id)
    const contaId = Number(item.conta_id)
    const pertence = osId ? osUnidade.get(osId) === unidadeId : contaId ? contasUnidade.get(contaId) === unidadeId : false
    if (!pertence) continue
    let natureza: 'ENTRADA' | 'SAIDA' | null = null
    if (tipo === 'RECEBIMENTO_OS' && ['PARCIAL', 'RECEBIDO'].includes(texto(item.status_novo).toUpperCase())) natureza = 'ENTRADA'
    const statusNovo = texto(item.status_novo).toUpperCase()
    if (['CONTA_PAGAR', 'DOCUMENTO_TECNICO'].includes(tipo) && statusNovo === 'PAGO') natureza = 'SAIDA'
    if (tipo === 'PAGAMENTO_TECNICO' && ['PAGO', 'RECEBIDO'].includes(statusNovo)) natureza = 'SAIDA'
    if (!natureza) continue
    const valor = item.valor_liquido === null || item.valor_liquido === undefined ? numero(item.valor) : numero(item.valor_liquido)
    if (valor <= 0) continue
    automaticos.push({
      id: `H${item.id}`,
      origem: tipo,
      natureza,
      forma: normalizarFormaCaixa(extrairForma(item.descricao)),
      valor,
      descricao: item.descricao,
      criado_em: item.criado_em,
    })
  }

  for (const venda of (vendas ?? []) as Registro[]) automaticos.push({
    id: `V${venda.id}`,
    origem: 'VENDA_BALCAO',
    natureza: 'ENTRADA',
    forma: normalizarFormaCaixa(venda.forma_recebimento),
    valor: numero(venda.total),
    descricao: `${venda.numero_venda ?? `Venda #${venda.id}`} - venda de balcao`,
    criado_em: venda.criado_em,
  })
  return automaticos.sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)))
}

async function buscarSessaoAberta(supabase: ReturnType<typeof db>, unidadeId: number) {
  const { data, error } = await supabase.from('caixa_sessoes').select('*').eq('unidade_id', unidadeId).eq('status', 'ABERTO').maybeSingle()
  if (error) throw error
  return data as Registro | null
}

async function autenticarUnidade(request: NextRequest) {
  const auth = await requireAdminEscopoGerencial(request, 'financeiro')
  if (!auth.ok) return auth
  if (!auth.unidadeId) return { ok: false as const, response: NextResponse.json({ error: 'Selecione Matriz ou uma Filial para operar o caixa.' }, { status: 400 }) }
  return auth
}

async function tabelaExiste(supabase: ReturnType<typeof db>, tabela: string) {
  const { error } = await supabase.from(tabela).select('id').limit(0)
  return !error
}

function extrairForma(descricao: unknown) {
  const textoDescricao = String(descricao ?? '')
  const encontrou = textoDescricao.match(/\b(?:via|forma[:\s]+)\s*(PIX|CART[AÃ]O|DINHEIRO|BOLETO|DEP[OÓ]SITO|TRANSFER[EÊ]NCIA)/i)
  return encontrou?.[1] ?? 'OUTROS'
}

function dataCuiaba() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const mapa = Object.fromEntries(partes.map((item) => [item.type, item.value]))
  return `${mapa.year}-${mapa.month}-${mapa.day}`
}

function texto(valor: unknown) { return String(valor ?? '').trim() }
function numero(valor: unknown) { return Number(valor ?? 0) || 0 }
function dinheiro(valor: unknown) { return Math.round(((Number(String(valor ?? 0).replace(',', '.')) || 0) + Number.EPSILON) * 100) / 100 }
function mensagem(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return error instanceof Error ? error.message : fallback
}
