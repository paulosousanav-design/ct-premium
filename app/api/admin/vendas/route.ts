import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
type PecaVenda = { id: number; codigo?: string | null; descricao: string; valor_custo?: number | string | null; valor_venda?: number | string | null; estoque?: number | string | null; ativo?: boolean | null }
type ItemCalculado = { peca: PecaVenda | null; descricao: string; codigo: string | null; custo: number; quantidade: number; valorUnitario: number; desconto: number; total: number }
type ItemEntrada = { pecaId?: unknown; descricao?: unknown; quantidade?: unknown; valorUnitario?: unknown; desconto?: unknown }
function db() { if (!url || !key) throw new Error('Supabase não configurado.'); return createClient(url, key, { auth: { persistSession: false } }) }

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'vendas'); if (!auth.ok) return auth.response
    const supabase = db(); const { error: tabelaError } = await supabase.from('vendas').select('id').limit(0)
    if (tabelaError) return NextResponse.json({ estruturaPendente: true, pecas: [], clientes: [], vendas: [], itens: [] })
    const [{ data: pecas, error: pecasError }, { data: clientes, error: clientesError }, { data: vendas, error: vendasError }] = await Promise.all([
      supabase.from('pecas').select('id, codigo, descricao, categoria, marca, valor_custo, valor_venda, estoque, ativo').eq('ativo', true).eq('unidade_id', auth.unidadeId).order('descricao'),
      supabase.from('clientes').select('id, nome, cpf_cnpj, whatsapp').order('nome').limit(1000),
      supabase.from('vendas').select('*, clientes:cliente_id(nome, cpf_cnpj)').eq('unidade_id', auth.unidadeId).order('criado_em', { ascending: false }).limit(100),
    ])
    if (pecasError || clientesError || vendasError) throw pecasError || clientesError || vendasError
    const ids = (vendas ?? []).map((v) => Number(v.id)); const { data: itens } = ids.length ? await supabase.from('venda_itens').select('*').in('venda_id', ids) : { data: [] }
    return NextResponse.json({ estruturaPendente: false, pecas, clientes, vendas, itens: itens ?? [] })
  } catch (error) { return NextResponse.json({ error: mensagem(error, 'Erro ao carregar vendas.') }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUnidade(request, 'vendas'); if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null); const itensBody = Array.isArray(body?.itens) ? body.itens : []; const descontoVenda = dinheiro(body?.desconto)
  if (!itensBody.length) return NextResponse.json({ error: 'Adicione ao menos um produto.' }, { status: 400 })
  const supabase = db(); const ids = [...new Set(itensBody.map((i: ItemEntrada) => Number(i.pecaId)).filter((id: number) => id > 0))]
  const { data: pecas, error: pecasError } = await supabase.from('pecas').select('id, codigo, descricao, valor_custo, valor_venda, estoque, ativo').in('id', ids).eq('unidade_id', auth.unidadeId)
  if (pecasError) return NextResponse.json({ error: mensagem(pecasError, 'Erro ao consultar estoque.') }, { status: 500 })
  const mapa = new Map((pecas ?? []).map((p) => [Number(p.id), p as PecaVenda])); let itens: ItemCalculado[]
  try {
    itens = itensBody.map((entrada: ItemEntrada) => {
      const avulso = Number(entrada.pecaId) <= 0; const peca = avulso ? null : mapa.get(Number(entrada.pecaId)) ?? null; const descricao = avulso ? texto(entrada.descricao) : peca?.descricao ?? ''; const quantidade = numero(entrada.quantidade); const valorUnitario = dinheiro(entrada.valorUnitario ?? peca?.valor_venda); const desconto = dinheiro(entrada.desconto)
      if (!descricao || (!avulso && (!peca || peca.ativo === false || quantidade > numero(peca.estoque))) || quantidade <= 0 || valorUnitario < 0 || desconto < 0) throw new Error(`Item ou estoque inválido: ${descricao || entrada.pecaId}`)
      const bruto = arredondar(quantidade * valorUnitario); if (desconto > bruto) throw new Error(`Desconto inválido em ${descricao}.`)
      return { peca, descricao, codigo: peca?.codigo ?? 'AVULSO', custo: peca ? dinheiro(peca.valor_custo) : 0, quantidade, valorUnitario, desconto, total: arredondar(bruto - desconto) }
    })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error, 'Item inválido.') }, { status: 400 })
  }
  const subtotal = arredondar(itens.reduce((a, i) => a + i.quantidade * i.valorUnitario, 0)); if (descontoVenda < 0 || descontoVenda > subtotal - itens.reduce((a, i) => a + i.desconto, 0)) return NextResponse.json({ error: 'Desconto da venda inválido.' }, { status: 400 })
  const total = arredondar(subtotal - itens.reduce((a, i) => a + i.desconto, 0) - descontoVenda); const forma = formaRecebimento(body?.formaRecebimento); const ator = `${auth.nome} (${auth.email})`; const numeroVenda = `VD${Date.now()}`; const processados: Array<{ id: number; estoque: number }> = []
  try {
    const { data: venda, error: vendaError } = await supabase.from('vendas').insert({ numero_venda: numeroVenda, cliente_id: Number(body?.clienteId) || null, unidade_id: auth.unidadeId, subtotal, desconto: descontoVenda + itens.reduce((a, i) => a + i.desconto, 0), total, forma_recebimento: forma, status: 'PAGO', observacao: texto(body?.observacao) || null, criado_por_nome: auth.nome, criado_por_email: auth.email }).select('id, numero_venda').single()
    if (vendaError) throw vendaError
    const { error: itensError } = await supabase.from('venda_itens').insert(itens.map((i) => ({ venda_id: venda.id, peca_id: i.peca?.id ?? null, descricao: i.descricao, codigo: i.codigo, quantidade: i.quantidade, valor_custo_unitario: i.custo, valor_unitario: i.valorUnitario, desconto: i.desconto, total_item: i.total }))); if (itensError) throw itensError
    for (const item of itens) { if (!item.peca) continue; const anterior = numero(item.peca.estoque); const posterior = anterior - item.quantidade; const { data: atualizada, error } = await supabase.from('pecas').update({ estoque: posterior }).eq('id', item.peca.id).eq('unidade_id', auth.unidadeId).eq('estoque', anterior).select('id').maybeSingle(); if (error || !atualizada) throw error ?? new Error(`Estoque de ${item.peca.descricao} foi alterado por outra operação.`); processados.push({ id: item.peca.id, estoque: anterior }); const { error: movError } = await supabase.from('pecas_movimentacoes').insert({ peca_id: item.peca.id, venda_id: venda.id, unidade_id: auth.unidadeId, tipo: 'SAIDA_VENDA', quantidade: item.quantidade, estoque_anterior: anterior, estoque_posterior: posterior, observacao: `${numeroVenda} • ${ator}` }); if (movError) throw movError }
    await historico(supabase, venda.id, 'VENDA_REALIZADA', null, 'PAGO', total, `${numeroVenda} recebida via ${forma}.`, ator)
    return NextResponse.json({ ok: true, id: venda.id, numeroVenda })
  } catch (error) { for (const item of processados) await supabase.from('pecas').update({ estoque: item.estoque }).eq('id', item.id).eq('unidade_id', auth.unidadeId); await supabase.from('vendas').delete().eq('numero_venda', numeroVenda).eq('unidade_id', auth.unidadeId); return NextResponse.json({ error: mensagem(error, 'Erro ao finalizar venda.') }, { status: 500 }) }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'vendas'); if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null); const id = Number(body?.id); const motivo = texto(body?.motivo)
    if (!id || !motivo) return NextResponse.json({ error: 'Informe venda e motivo do cancelamento.' }, { status: 400 })
    const supabase = db(); const { data: venda } = await supabase.from('vendas').select('id, numero_venda, status, total').eq('id', id).eq('unidade_id', auth.unidadeId).maybeSingle(); if (!venda || venda.status === 'CANCELADA') return NextResponse.json({ error: 'Venda não localizada ou já cancelada.' }, { status: 400 })
    const { data: itens, error: itensError } = await supabase.from('venda_itens').select('peca_id, quantidade').eq('venda_id', id); if (itensError) throw itensError; const ator = `${auth.nome} (${auth.email})`
    for (const item of itens ?? []) { if (!item.peca_id) continue; const { data: peca } = await supabase.from('pecas').select('estoque').eq('id', item.peca_id).eq('unidade_id', auth.unidadeId).maybeSingle(); const anterior = numero(peca?.estoque); const posterior = anterior + numero(item.quantidade); const { error } = await supabase.from('pecas').update({ estoque: posterior }).eq('id', item.peca_id).eq('unidade_id', auth.unidadeId); if (error) throw error; await supabase.from('pecas_movimentacoes').insert({ peca_id: item.peca_id, venda_id: id, unidade_id: auth.unidadeId, tipo: 'ENTRADA_CANCELAMENTO_VENDA', quantidade: item.quantidade, estoque_anterior: anterior, estoque_posterior: posterior, observacao: `${venda.numero_venda} cancelada • ${ator}` }) }
    const { error } = await supabase.from('vendas').update({ status: 'CANCELADA', cancelado_por_nome: auth.nome, cancelado_por_email: auth.email, cancelado_em: new Date().toISOString(), cancelamento_motivo: motivo }).eq('id', id).eq('unidade_id', auth.unidadeId); if (error) throw error
    await historico(supabase, id, 'VENDA_CANCELADA', 'PAGO', 'CANCELADA', numero(venda.total), `${venda.numero_venda} cancelada: ${motivo}`, ator)
    return NextResponse.json({ ok: true })
  } catch (error) { return NextResponse.json({ error: mensagem(error, 'Erro ao cancelar venda.') }, { status: 500 }) }
}

async function historico(supabase: ReturnType<typeof db>, vendaId: number, tipo: string, anterior: string | null, novo: string, valor: number, descricao: string, ator: string) { const { error } = await supabase.from('financeiro_historico').insert({ tipo, status_anterior: anterior, status_novo: novo, valor, descricao, responsavel: ator }); if (error && !['42P01', 'PGRST205'].includes(String(error.code))) throw error; void vendaId }
function formaRecebimento(v: unknown) { const forma = texto(v).toUpperCase(); return ['PIX', 'CARTAO', 'DINHEIRO', 'BOLETO', 'DEPOSITO'].includes(forma) ? forma : 'PIX' }
function texto(v: unknown) { return String(v ?? '').trim() }
function numero(v: unknown) { return Number(v ?? 0) || 0 }
function dinheiro(v: unknown) { return arredondar(Number(String(v ?? 0).replace(',', '.')) || 0) }
function arredondar(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100 }
function mensagem(error: unknown, fallback: string) { return error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : fallback }
