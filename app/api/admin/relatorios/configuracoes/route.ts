import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuração do Supabase ausente.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, 'relatorios')
  if (!auth.ok) return auth.response

  const supabase = db()
  const { data, error } = await supabase
    .from('empresas')
    .select('id, sla_particular_dias, sla_garantia_dias, kpi_meta_sla_percentual, kpi_meta_conclusao_dias, kpi_meta_aprovacao_percentual, kpi_meta_produtividade, kpi_meta_ticket')
    .eq('ativa', true)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    const { data: empresa } = await supabase
      .from('empresas')
      .select('id, sla_particular_dias, sla_garantia_dias')
      .eq('ativa', true)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      data: montarConfiguracao(empresa),
      tabelaKpiPendente: true,
    })
  }
  return NextResponse.json({
    data: montarConfiguracao(data),
    tabelaKpiPendente: false,
  })
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminPermission(request, 'relatorios')
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const supabase = db()
  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .select('id')
    .eq('ativa', true)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (empresaError || !empresa) {
    return NextResponse.json({ error: 'Empresa ativa não encontrada.' }, { status: 400 })
  }

  const payload: Record<string, number | string> = { atualizado_em: new Date().toISOString() }

  if (body && (Object.hasOwn(body, 'slaParticularDias') || Object.hasOwn(body, 'slaGarantiaDias'))) {
    payload.sla_particular_dias = normalizarDias(body.slaParticularDias, 3)
    payload.sla_garantia_dias = normalizarDias(body.slaGarantiaDias, 7)
  }

  if (body && Object.hasOwn(body, 'metaSlaPercentual')) {
    payload.kpi_meta_sla_percentual = normalizarPercentual(body.metaSlaPercentual, 90)
    payload.kpi_meta_conclusao_dias = normalizarPositivo(body.metaConclusaoDias, 5)
    payload.kpi_meta_aprovacao_percentual = normalizarPercentual(body.metaAprovacaoPercentual, 70)
    payload.kpi_meta_produtividade = normalizarPositivo(body.metaProdutividade, 10)
    payload.kpi_meta_ticket = normalizarPositivo(body.metaTicket, 500)
  }

  const { error } = await supabase
    .from('empresas')
    .update(payload)
    .eq('id', empresa.id)

  if (error) {
    return NextResponse.json(
      { error: body && Object.hasOwn(body, 'metaSlaPercentual')
        ? 'Execute o arquivo supabase-add-config-kpi.sql no Supabase antes de salvar as metas.'
        : 'Execute o arquivo supabase-add-config-sla.sql no Supabase antes de salvar.' },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}

function normalizarDias(value: unknown, fallback: number) {
  const numero = Math.trunc(Number(value))
  return Number.isFinite(numero) && numero >= 1 && numero <= 365 ? numero : fallback
}

function montarConfiguracao(data: Record<string, unknown> | null | undefined) {
  return {
    slaParticularDias: normalizarDias(data?.sla_particular_dias, 3),
    slaGarantiaDias: normalizarDias(data?.sla_garantia_dias, 7),
    metaSlaPercentual: normalizarPercentual(data?.kpi_meta_sla_percentual, 90),
    metaConclusaoDias: normalizarPositivo(data?.kpi_meta_conclusao_dias, 5),
    metaAprovacaoPercentual: normalizarPercentual(data?.kpi_meta_aprovacao_percentual, 70),
    metaProdutividade: normalizarPositivo(data?.kpi_meta_produtividade, 10),
    metaTicket: normalizarPositivo(data?.kpi_meta_ticket, 500),
  }
}

function normalizarPercentual(value: unknown, fallback: number) {
  const numero = Number(value)
  return Number.isFinite(numero) && numero >= 0 && numero <= 100 ? numero : fallback
}

function normalizarPositivo(value: unknown, fallback: number) {
  const numero = Number(value)
  return Number.isFinite(numero) && numero > 0 ? numero : fallback
}
