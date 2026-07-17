import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro')
    if (!auth.ok) return auth.response
    const supabase = getSupabaseAdmin()
    if (!(await tabelaExiste(supabase, 'comissao_fechamentos'))) {
      return NextResponse.json({ estruturaPendente: true, tecnicos: [], elegiveis: [], fechamentos: [] })
    }

    const inicio = request.nextUrl.searchParams.get('inicio') || primeiroDiaMes()
    const fim = request.nextUrl.searchParams.get('fim') || hojeInput()
    const parceiroId = Number(request.nextUrl.searchParams.get('parceiroId') || 0)

    const { data: tecnicos, error: tecnicosError } = await supabase
      .from('parceiros')
      .select('id, responsavel, nome_fantasia, tipo_vinculo, comissao_pecas_percentual, comissao_mao_obra_percentual, periodicidade_comissao')
      .eq('tipo_vinculo', 'PROPRIO')
      .eq('status', 'ATIVO')
      .order('responsavel')
    if (tecnicosError) throw tecnicosError

    let ordensQuery = supabase
      .from('ordens_servico')
      .select('id, numero_os, parceiro_id, data_pagamento, cliente_valor_pecas, valor_pecas, cliente_valor_mao_obra, valor_mao_obra, cliente_total, total')
      .eq('status', 'FINALIZADA')
      .eq('status_financeiro', 'RECEBIDO')
      .gte('data_pagamento', `${inicio}T00:00:00.000Z`)
      .lte('data_pagamento', `${fim}T23:59:59.999Z`)
      .not('parceiro_id', 'is', null)
      .order('data_pagamento', { ascending: true })
    if (parceiroId) ordensQuery = ordensQuery.eq('parceiro_id', parceiroId)
    const { data: ordens, error: ordensError } = await ordensQuery
    if (ordensError) throw ordensError

    const ids = (ordens ?? []).map((item) => Number(item.id))
    const { data: usados } = ids.length
      ? await supabase.from('comissao_fechamento_itens').select('os_id').in('os_id', ids).eq('tipo', 'OS')
      : { data: [] as Array<{ os_id: number }> }
    const usadosSet = new Set((usados ?? []).map((item) => Number(item.os_id)))
    const tecnicosMap = new Map((tecnicos ?? []).map((item) => [Number(item.id), item]))
    const elegiveis = (ordens ?? [])
      .filter((item) => tecnicosMap.has(Number(item.parceiro_id)) && !usadosSet.has(Number(item.id)))
      .map((item) => calcularItem(item, tecnicosMap.get(Number(item.parceiro_id))!))

    const { data: fechamentos, error: fechamentosError } = await supabase
      .from('comissao_fechamentos')
      .select('*, parceiros:parceiro_id(responsavel, nome_fantasia)')
      .order('criado_em', { ascending: false })
      .limit(100)
    if (fechamentosError) throw fechamentosError

    const fechamentoIds = (fechamentos ?? []).map((item) => Number(item.id))
    const { data: itens } = fechamentoIds.length
      ? await supabase.from('comissao_fechamento_itens').select('*').in('fechamento_id', fechamentoIds).order('criado_em')
      : { data: [] }

    return NextResponse.json({ estruturaPendente: false, tecnicos, elegiveis, fechamentos, itens: itens ?? [] })
  } catch (error) {
    return NextResponse.json({ error: formatarErro(error, 'Erro ao carregar comissoes.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const acao = String(body?.acao ?? '').toUpperCase()
    const supabase = getSupabaseAdmin()

    if (acao === 'PAGAR') {
      const id = Number(body?.id)
      const forma = normalizarForma(body?.forma)
      if (!id) return NextResponse.json({ error: 'Fechamento invalido.' }, { status: 400 })
      const { error } = await supabase.from('comissao_fechamentos').update({
        status: 'PAGO', pago_em: new Date().toISOString(), forma_pagamento: forma,
        pago_por_nome: auth.nome, pago_por_email: auth.email,
      }).eq('id', id).eq('status', 'FECHADO')
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (acao === 'AJUSTAR') {
      const fechamentoId = Number(body?.id)
      const valor = arredondar(Number(body?.valor ?? 0))
      const descricao = String(body?.descricao ?? '').trim()
      if (!fechamentoId || !valor || !descricao) return NextResponse.json({ error: 'Informe valor e motivo do ajuste.' }, { status: 400 })
      const { error: itemError } = await supabase.from('comissao_fechamento_itens').insert({
        fechamento_id: fechamentoId, tipo: 'AJUSTE', descricao, valor_ajuste: valor,
        criado_por_nome: auth.nome, criado_por_email: auth.email,
      })
      if (itemError) throw itemError
      await recalcularFechamento(supabase, fechamentoId)
      return NextResponse.json({ ok: true })
    }

    if (acao !== 'FECHAR') return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 })
    const parceiroId = Number(body?.parceiroId)
    const inicio = String(body?.inicio ?? '')
    const fim = String(body?.fim ?? '')
    if (!parceiroId || !inicio || !fim || inicio > fim) return NextResponse.json({ error: 'Periodo ou tecnico invalido.' }, { status: 400 })

    const { data: tecnico, error: tecnicoError } = await supabase.from('parceiros')
      .select('id, responsavel, tipo_vinculo, comissao_pecas_percentual, comissao_mao_obra_percentual, periodicidade_comissao')
      .eq('id', parceiroId).eq('tipo_vinculo', 'PROPRIO').maybeSingle()
    if (tecnicoError || !tecnico) return NextResponse.json({ error: 'Tecnico proprio nao localizado.' }, { status: 404 })

    const { data: ordens, error: ordensError } = await supabase.from('ordens_servico')
      .select('id, numero_os, parceiro_id, data_pagamento, cliente_valor_pecas, valor_pecas, cliente_valor_mao_obra, valor_mao_obra, cliente_total, total')
      .eq('parceiro_id', parceiroId).eq('status', 'FINALIZADA').eq('status_financeiro', 'RECEBIDO')
      .gte('data_pagamento', `${inicio}T00:00:00.000Z`).lte('data_pagamento', `${fim}T23:59:59.999Z`)
    if (ordensError) throw ordensError
    const ids = (ordens ?? []).map((item) => Number(item.id))
    const { data: usados } = ids.length ? await supabase.from('comissao_fechamento_itens').select('os_id').in('os_id', ids).eq('tipo', 'OS') : { data: [] }
    const usadosSet = new Set((usados ?? []).map((item) => Number(item.os_id)))
    const itens = (ordens ?? []).filter((item) => !usadosSet.has(Number(item.id))).map((item) => calcularItem(item, tecnico))
    if (!itens.length) return NextResponse.json({ error: 'Nenhuma OS quitada e pendente de fechamento neste periodo.' }, { status: 400 })

    const totais = somarItens(itens)
    const { data: fechamento, error: fechamentoError } = await supabase.from('comissao_fechamentos').insert({
      parceiro_id: parceiroId, periodo_inicio: inicio, periodo_fim: fim,
      periodicidade: tecnico.periodicidade_comissao ?? 'MENSAL', status: 'FECHADO', ...totais,
      criado_por_nome: auth.nome, criado_por_email: auth.email,
    }).select('id').single()
    if (fechamentoError) throw fechamentoError

    const { error: itensError } = await supabase.from('comissao_fechamento_itens').insert(itens.map((item) => ({
      fechamento_id: fechamento.id, os_id: item.os_id, tipo: 'OS', descricao: item.numero_os,
      valor_pecas_venda: item.valor_pecas_venda, valor_mao_obra_venda: item.valor_mao_obra_venda,
      percentual_pecas: item.percentual_pecas, percentual_mao_obra: item.percentual_mao_obra,
      comissao_pecas: item.comissao_pecas, comissao_mao_obra: item.comissao_mao_obra,
      criado_por_nome: auth.nome, criado_por_email: auth.email,
    })))
    if (itensError) {
      await supabase.from('comissao_fechamentos').delete().eq('id', fechamento.id)
      throw itensError
    }
    return NextResponse.json({ ok: true, id: fechamento.id })
  } catch (error) {
    return NextResponse.json({ error: formatarErro(error, 'Erro ao atualizar comissoes.') }, { status: 500 })
  }
}

function calcularItem(os: Record<string, unknown>, tecnico: Record<string, unknown>) {
  const pecas = valor(os.cliente_valor_pecas, os.valor_pecas)
  const maoObra = valor(os.cliente_valor_mao_obra, os.valor_mao_obra)
  const percentualPecas = Number(tecnico.comissao_pecas_percentual ?? 0) || 0
  const percentualMaoObra = Number(tecnico.comissao_mao_obra_percentual ?? 0) || 0
  return { os_id: Number(os.id), numero_os: String(os.numero_os ?? `OS #${os.id}`), parceiro_id: Number(os.parceiro_id), data_pagamento: os.data_pagamento,
    valor_pecas_venda: pecas, valor_mao_obra_venda: maoObra, percentual_pecas: percentualPecas, percentual_mao_obra: percentualMaoObra,
    comissao_pecas: arredondar(pecas * percentualPecas / 100), comissao_mao_obra: arredondar(maoObra * percentualMaoObra / 100) }
}

function somarItens(itens: ReturnType<typeof calcularItem>[]) {
  const soma = (campo: keyof ReturnType<typeof calcularItem>) => arredondar(itens.reduce((acc, item) => acc + Number(item[campo] ?? 0), 0))
  const totalPecas = soma('comissao_pecas'); const totalMaoObra = soma('comissao_mao_obra')
  return { total_pecas_venda: soma('valor_pecas_venda'), total_mao_obra_venda: soma('valor_mao_obra_venda'), total_comissao_pecas: totalPecas,
    total_comissao_mao_obra: totalMaoObra, total_ajustes: 0, total_comissao: arredondar(totalPecas + totalMaoObra) }
}

async function recalcularFechamento(supabase: ReturnType<typeof getSupabaseAdmin>, id: number) {
  const { data, error } = await supabase.from('comissao_fechamento_itens').select('comissao_pecas, comissao_mao_obra, valor_ajuste').eq('fechamento_id', id)
  if (error) throw error
  const pecas = arredondar((data ?? []).reduce((a, i) => a + Number(i.comissao_pecas ?? 0), 0))
  const mao = arredondar((data ?? []).reduce((a, i) => a + Number(i.comissao_mao_obra ?? 0), 0))
  const ajustes = arredondar((data ?? []).reduce((a, i) => a + Number(i.valor_ajuste ?? 0), 0))
  const { error: updateError } = await supabase.from('comissao_fechamentos').update({ total_comissao_pecas: pecas, total_comissao_mao_obra: mao, total_ajustes: ajustes, total_comissao: arredondar(pecas + mao + ajustes) }).eq('id', id).eq('status', 'FECHADO')
  if (updateError) throw updateError
}

async function tabelaExiste(supabase: ReturnType<typeof getSupabaseAdmin>, tabela: string) { const { error } = await supabase.from(tabela).select('id').limit(0); return !error }
function valor(principal: unknown, fallback: unknown) { return Number(principal ?? fallback ?? 0) || 0 }
function arredondar(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100 }
function normalizarForma(value: unknown) { const v = String(value ?? 'PIX').toUpperCase(); return ['PIX', 'CARTAO', 'DEPOSITO', 'BOLETO', 'DINHEIRO'].includes(v) ? v : 'PIX' }
function hojeInput() { return new Date().toISOString().slice(0, 10) }
function primeiroDiaMes() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
function formatarErro(error: unknown, fallback: string) { return error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : fallback }
