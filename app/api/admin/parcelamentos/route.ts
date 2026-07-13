import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
function db() { if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase não configurado.'); return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } }) }

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro'); if (!auth.ok) return auth.response
    const supabase = db()
    const { error: tabelaError } = await supabase.from('recebimento_parcelas').select('id').limit(0)
    if (tabelaError) return NextResponse.json({ estruturaPendente: true, ordens: [], parcelas: [] })
    const { data: ordens, error: ordensError } = await supabase.from('ordens_servico')
      .select('id, numero_os, status, status_financeiro, total, cliente_total, valor_recebido_cliente, desconto_recebimento_cliente, clientes:cliente_id(nome)')
      .eq('status', 'FINALIZADA').order('created_at', { ascending: false })
    if (ordensError) throw ordensError
    const { data: parcelas, error: parcelasError } = await supabase.from('recebimento_parcelas')
      .select('*, ordens_servico:os_id(numero_os, cliente_total, total, clientes:cliente_id(nome))')
      .order('vencimento', { ascending: true })
    if (parcelasError) throw parcelasError
    return NextResponse.json({ estruturaPendente: false, ordens: ordens ?? [], parcelas: parcelas ?? [] })
  } catch (error) { return NextResponse.json({ error: erro(error, 'Erro ao carregar parcelamentos.') }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro'); if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const osId = Number(body?.osId); const quantidade = Math.floor(Number(body?.quantidade)); const primeiroVencimento = String(body?.primeiroVencimento ?? '')
    if (!osId || quantidade < 2 || quantidade > 60 || !/^\d{4}-\d{2}-\d{2}$/.test(primeiroVencimento)) return NextResponse.json({ error: 'Informe OS, quantidade entre 2 e 60 e primeiro vencimento.' }, { status: 400 })
    const supabase = db()
    const { data: os, error: osError } = await supabase.from('ordens_servico').select('id, numero_os, status, status_financeiro, total, cliente_total, valor_recebido_cliente, desconto_recebimento_cliente').eq('id', osId).maybeSingle()
    if (osError || !os || os.status !== 'FINALIZADA') return NextResponse.json({ error: 'Somente OS finalizadas podem ser parceladas.' }, { status: 400 })
    const { count } = await supabase.from('recebimento_parcelas').select('*', { count: 'exact', head: true }).eq('os_id', osId).in('status', ['PENDENTE', 'RECEBIDO'])
    if ((count ?? 0) > 0) return NextResponse.json({ error: 'Esta OS já possui parcelamento cadastrado.' }, { status: 400 })
    const total = numero(os.cliente_total ?? os.total); const recebido = numero(os.valor_recebido_cliente); const desconto = numero(os.desconto_recebimento_cliente)
    const saldoCentavos = Math.round(Math.max(total - recebido - desconto, 0) * 100)
    if (saldoCentavos <= 0) return NextResponse.json({ error: 'Esta OS não possui saldo em aberto.' }, { status: 400 })
    const base = Math.floor(saldoCentavos / quantidade); const resto = saldoCentavos % quantidade
    const ator = `${auth.nome} (${auth.email})`
    const parcelas = Array.from({ length: quantidade }, (_, index) => ({ os_id: osId, numero_parcela: index + 1, total_parcelas: quantidade, valor: (base + (index < resto ? 1 : 0)) / 100, vencimento: adicionarMeses(primeiroVencimento, index), forma_recebimento: 'BOLETO', status: 'PENDENTE', criado_por: ator }))
    const { error } = await supabase.from('recebimento_parcelas').insert(parcelas); if (error) throw error
    const { error: osUpdateError } = await supabase.from('ordens_servico').update({ status_financeiro: 'FATURADO' }).eq('id', osId)
    if (osUpdateError) { await supabase.from('recebimento_parcelas').delete().eq('os_id', osId).eq('status', 'PENDENTE'); throw osUpdateError }
    await historico(supabase, { osId, ator, tipo: 'PARCELAMENTO_CRIADO', statusAnterior: os.status_financeiro, statusNovo: 'FATURADO', valor: saldoCentavos / 100, descricao: `${os.numero_os}: parcelamento em ${quantidade} boletos criado.` })
    return NextResponse.json({ ok: true })
  } catch (error) { return NextResponse.json({ error: erro(error, 'Erro ao criar parcelamento.') }, { status: 500 }) }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro'); if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null); const id = Number(body?.id); const acao = String(body?.acao ?? '').toUpperCase()
    if (!id || !['RECEBER', 'CANCELAR'].includes(acao)) return NextResponse.json({ error: 'Parcela ou ação inválida.' }, { status: 400 })
    const supabase = db(); const ator = `${auth.nome} (${auth.email})`
    const { data: parcela, error: parcelaError } = await supabase.from('recebimento_parcelas').select('id, os_id, numero_parcela, total_parcelas, valor, status').eq('id', id).maybeSingle()
    if (parcelaError || !parcela || parcela.status !== 'PENDENTE') return NextResponse.json({ error: 'Parcela não localizada ou já baixada.' }, { status: 400 })
    if (acao === 'CANCELAR') {
      const { error } = await supabase.from('recebimento_parcelas').update({ status: 'CANCELADO', recebido_por: ator }).eq('id', id).eq('status', 'PENDENTE'); if (error) throw error
      await historico(supabase, { osId: parcela.os_id, ator, tipo: 'PARCELA_CANCELADA', statusAnterior: 'PENDENTE', statusNovo: 'CANCELADO', valor: numero(parcela.valor), descricao: `Parcela ${parcela.numero_parcela}/${parcela.total_parcelas} cancelada.` })
      return NextResponse.json({ ok: true })
    }
    const agora = new Date().toISOString()
    const { data: atualizada, error: baixaError } = await supabase.from('recebimento_parcelas').update({ status: 'RECEBIDO', recebido_em: agora, recebido_por: ator }).eq('id', id).eq('status', 'PENDENTE').select('id').maybeSingle()
    if (baixaError || !atualizada) return NextResponse.json({ error: 'A parcela já foi processada.' }, { status: 409 })
    const { data: os, error: osError } = await supabase.from('ordens_servico').select('id, numero_os, total, cliente_total, valor_recebido_cliente, desconto_recebimento_cliente, status_financeiro').eq('id', parcela.os_id).maybeSingle()
    if (osError || !os) throw osError ?? new Error('OS não localizada.')
    const total = numero(os.cliente_total ?? os.total); const novoRecebido = Math.min(total, numero(os.valor_recebido_cliente) + numero(parcela.valor)); const desconto = numero(os.desconto_recebimento_cliente); const quitado = novoRecebido + desconto >= total
    const { error: osUpdateError } = await supabase.from('ordens_servico').update({ valor_recebido_cliente: novoRecebido, status_financeiro: quitado ? 'RECEBIDO' : 'PARCIAL', data_ultimo_recebimento: agora, data_pagamento: quitado ? agora : null, forma_recebimento: 'BOLETO' }).eq('id', parcela.os_id)
    if (osUpdateError) { await supabase.from('recebimento_parcelas').update({ status: 'PENDENTE', recebido_em: null, recebido_por: null }).eq('id', id); throw osUpdateError }
    await historico(supabase, { osId: parcela.os_id, ator, tipo: 'PARCELA_RECEBIDA', statusAnterior: os.status_financeiro, statusNovo: quitado ? 'RECEBIDO' : 'PARCIAL', valor: numero(parcela.valor), descricao: `${os.numero_os}: boleto ${parcela.numero_parcela}/${parcela.total_parcelas} recebido.` })
    return NextResponse.json({ ok: true })
  } catch (error) { return NextResponse.json({ error: erro(error, 'Erro ao atualizar parcela.') }, { status: 500 }) }
}

function adicionarMeses(data: string, meses: number) { const [a, m, d] = data.split('-').map(Number); const alvo = new Date(Date.UTC(a, m - 1 + meses, 1)); const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate(); return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}` }
async function historico(supabase: ReturnType<typeof db>, item: { osId: number; ator: string; tipo: string; statusAnterior?: string | null; statusNovo: string; valor: number; descricao: string }) { const { error } = await supabase.from('financeiro_historico').insert({ os_id: item.osId, tipo: item.tipo, status_anterior: item.statusAnterior, status_novo: item.statusNovo, valor: item.valor, descricao: item.descricao, responsavel: item.ator }); if (error && !['42P01', 'PGRST205'].includes(String(error.code))) throw error }
function numero(value: unknown) { return Number(value ?? 0) || 0 }
function erro(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
