import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminEscopoGerencial } from '@/lib/admin-unidade'
import { cabecalhosAuditoria, type AtorAuditoria } from '@/lib/auditoria-contexto'
import { registrarMovimentoFinanceiro, validarContaFinanceira } from '@/lib/financeiro-contas'
import { registrarEventoSistema } from '@/lib/monitoramento'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function db(request: NextRequest, ator: AtorAuditoria) {
  if (!url || !key) throw new Error('Configuração do Supabase ausente no servidor.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: cabecalhosAuditoria(request, ator) } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await autenticar(request); if (!auth.ok) return auth.response
    const supabase = db(request, auth)
    const { data: contas, error } = await supabase.from('contas_financeiras').select('*').eq('unidade_id', auth.unidadeId).order('ativa', { ascending: false }).order('nome')
    if (error) {
      if (['42P01', 'PGRST205'].includes(String(error.code))) return NextResponse.json({ estruturaPendente: true, contas: [], operadoras: [], taxas: [], movimentos: [] })
      throw error
    }
    const { data: operadoras, error: opError } = await supabase.from('operadoras_cartao').select('*, contas_financeiras:conta_recebimento_id(nome)').eq('unidade_id', auth.unidadeId).order('ativa', { ascending: false }).order('nome')
    if (opError) throw opError
    const ids = (operadoras ?? []).map((item) => Number(item.id))
    const { data: taxas, error: taxasError } = ids.length ? await supabase.from('operadoras_cartao_taxas').select('*').in('operadora_id', ids).order('modalidade').order('parcelas_de') : { data: [], error: null }
    if (taxasError) throw taxasError
    const { data: movimentos, error: movError } = await supabase.from('movimentos_financeiros').select('*, contas_financeiras:conta_financeira_id(nome), contraparte:conta_contrapartida_id(nome)').eq('unidade_id', auth.unidadeId).order('criado_em', { ascending: false }).limit(100)
    if (movError) throw movError
    const { data: movimentosSaldo, error: saldoError } = await supabase.from('movimentos_financeiros').select('conta_financeira_id, natureza, valor_liquido, status').eq('unidade_id', auth.unidadeId).eq('status', 'ATIVO').limit(10000)
    if (saldoError) throw saldoError
    const variacaoPorConta = new Map<number, number>()
    for (const movimento of movimentosSaldo ?? []) {
      const contaId = Number(movimento.conta_financeira_id)
      const sinal = movimento.natureza === 'ENTRADA' ? 1 : -1
      variacaoPorConta.set(contaId, (variacaoPorConta.get(contaId) ?? 0) + sinal * Number(movimento.valor_liquido ?? 0))
    }
    const contasComSaldo = (contas ?? []).map((conta) => ({
      ...conta,
      saldo_atual: dinheiro(Number(conta.saldo_inicial ?? 0) + (variacaoPorConta.get(Number(conta.id)) ?? 0)),
    }))
    return NextResponse.json({ estruturaPendente: false, contas: contasComSaldo, operadoras, taxas, movimentos })
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'CONTAS_FINANCEIRAS', gravidade: 'CRITICO', request })
    return NextResponse.json({ error: mensagem(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await autenticar(request); if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null); const acao = texto(body?.acao).toUpperCase(); const supabase = db(request, auth)
    if (acao === 'CONTA') {
      const nome = texto(body?.nome); const tipo = texto(body?.tipo).toUpperCase()
      if (!nome || !['CAIXA', 'BANCO', 'CARTEIRA_DIGITAL', 'ADQUIRENTE'].includes(tipo)) return NextResponse.json({ error: 'Informe nome e tipo válidos.' }, { status: 400 })
      const padrao = Boolean(body?.padraoDinheiro) && tipo === 'CAIXA'
      if (padrao) await supabase.from('contas_financeiras').update({ padrao_dinheiro: false }).eq('unidade_id', auth.unidadeId)
      const { error } = await supabase.from('contas_financeiras').insert({ unidade_id: auth.unidadeId, nome, tipo, banco: texto(body?.banco) || null, agencia: texto(body?.agencia) || null, numero_conta: texto(body?.numeroConta) || null, chave_pix: texto(body?.chavePix) || null, saldo_inicial: dinheiro(body?.saldoInicial), padrao_dinheiro: padrao, observacao: texto(body?.observacao) || null, criado_por_id: auth.usuarioId, criado_por_nome: auth.nome, criado_por_email: auth.email })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }
    if (acao === 'OPERADORA') {
      const nome = texto(body?.nome); const conta = await validarContaFinanceira(supabase, auth.unidadeId, body?.contaId)
      if (!nome) return NextResponse.json({ error: 'Informe o nome da operadora.' }, { status: 400 })
      const { error } = await supabase.from('operadoras_cartao').insert({ unidade_id: auth.unidadeId, nome, conta_recebimento_id: conta.id, observacao: texto(body?.observacao) || null, criado_por_id: auth.usuarioId, criado_por_nome: auth.nome, criado_por_email: auth.email })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }
    if (acao === 'TAXA') {
      const operadoraId = Number(body?.operadoraId); const modalidade = texto(body?.modalidade).toUpperCase(); const de = inteiro(body?.parcelasDe, 1); const ate = inteiro(body?.parcelasAte, de)
      const { data: operadora } = await supabase.from('operadoras_cartao').select('id').eq('id', operadoraId).eq('unidade_id', auth.unidadeId).maybeSingle()
      if (!operadora || !['DEBITO', 'CREDITO', 'PIX'].includes(modalidade) || de < 1 || ate < de || ate > 24) return NextResponse.json({ error: 'Operadora, modalidade ou faixa de parcelas inválida.' }, { status: 400 })
      const { error } = await supabase.from('operadoras_cartao_taxas').upsert({ operadora_id: operadoraId, modalidade, parcelas_de: de, parcelas_ate: ate, taxa_percentual: dinheiro(body?.taxaPercentual), taxa_fixa: dinheiro(body?.taxaFixa), prazo_dias: inteiro(body?.prazoDias, 1), ativa: true }, { onConflict: 'operadora_id,modalidade,parcelas_de,parcelas_ate' })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }
    if (acao === 'TRANSFERENCIA') {
      const origem = await validarContaFinanceira(supabase, auth.unidadeId, body?.origemId); const destino = await validarContaFinanceira(supabase, auth.unidadeId, body?.destinoId); const valor = dinheiro(body?.valor); const descricao = texto(body?.descricao) || `Transferência de ${origem.nome} para ${destino.nome}`
      if (origem.id === destino.id || valor <= 0) return NextResponse.json({ error: 'Selecione contas diferentes e informe um valor positivo.' }, { status: 400 })
      const grupo = crypto.randomUUID(); const ator = { usuarioId: auth.usuarioId, nome: auth.nome, email: auth.email }
      await registrarMovimentoFinanceiro(supabase, { unidadeId: auth.unidadeId, contaId: origem.id, contaContrapartidaId: destino.id, natureza: 'SAIDA', tipo: 'TRANSFERENCIA', forma: 'TRANSFERENCIA', valorBruto: valor, descricao, grupoTransferencia: grupo, ...ator })
      await registrarMovimentoFinanceiro(supabase, { unidadeId: auth.unidadeId, contaId: destino.id, contaContrapartidaId: origem.id, natureza: 'ENTRADA', tipo: 'TRANSFERENCIA', forma: 'TRANSFERENCIA', valorBruto: valor, descricao, grupoTransferencia: grupo, ...ator })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'CONTAS_FINANCEIRAS', gravidade: 'CRITICO', request })
    return NextResponse.json({ error: mensagem(error) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await autenticar(request); if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null); const tipo = texto(body?.tipo).toUpperCase(); const id = Number(body?.id); const supabase = db(request, auth)
    if (!id || !['CONTA', 'OPERADORA', 'TAXA'].includes(tipo)) return NextResponse.json({ error: 'Registro inválido.' }, { status: 400 })
    if (tipo === 'CONTA') { const { error } = await supabase.from('contas_financeiras').update({ ativa: Boolean(body?.ativa), atualizado_em: new Date().toISOString() }).eq('id', id).eq('unidade_id', auth.unidadeId); if (error) throw error }
    if (tipo === 'OPERADORA') { const { error } = await supabase.from('operadoras_cartao').update({ ativa: Boolean(body?.ativa), atualizado_em: new Date().toISOString() }).eq('id', id).eq('unidade_id', auth.unidadeId); if (error) throw error }
    if (tipo === 'TAXA') { const { data: taxa } = await supabase.from('operadoras_cartao_taxas').select('operadora_id').eq('id', id).maybeSingle(); const { data: op } = taxa ? await supabase.from('operadoras_cartao').select('id').eq('id', taxa.operadora_id).eq('unidade_id', auth.unidadeId).maybeSingle() : { data: null }; if (!op) return NextResponse.json({ error: 'Taxa não localizada.' }, { status: 404 }); const { error } = await supabase.from('operadoras_cartao_taxas').update({ ativa: Boolean(body?.ativa), atualizado_em: new Date().toISOString() }).eq('id', id); if (error) throw error }
    return NextResponse.json({ ok: true })
  } catch (error) { return NextResponse.json({ error: mensagem(error) }, { status: 500 }) }
}

async function autenticar(request: NextRequest) { const auth = await requireAdminEscopoGerencial(request, 'financeiro'); if (!auth.ok) return auth; if (!auth.unidadeId) return { ok: false as const, response: NextResponse.json({ error: 'Selecione Matriz ou uma Filial.' }, { status: 400 }) }; return auth }
function texto(v: unknown) { return String(v ?? '').trim() }
function dinheiro(v: unknown) { const n = Number(String(v ?? 0).replace(',', '.')); return Math.round(((Number.isFinite(n) ? n : 0) + Number.EPSILON) * 100) / 100 }
function inteiro(v: unknown, fallback: number) { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : fallback }
function mensagem(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Erro ao processar contas financeiras.' }
