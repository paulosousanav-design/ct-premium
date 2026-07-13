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

  const { data, error } = await db()
    .from('empresas')
    .select('id, sla_particular_dias, sla_garantia_dias')
    .eq('ativa', true)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ data: { slaParticularDias: 3, slaGarantiaDias: 7 }, tabelaPendente: true })
  return NextResponse.json({
    data: {
      slaParticularDias: normalizarDias(data?.sla_particular_dias, 3),
      slaGarantiaDias: normalizarDias(data?.sla_garantia_dias, 7),
    },
    tabelaPendente: false,
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

  const { error } = await supabase
    .from('empresas')
    .update({
      sla_particular_dias: normalizarDias(body?.slaParticularDias, 3),
      sla_garantia_dias: normalizarDias(body?.slaGarantiaDias, 7),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', empresa.id)

  if (error) {
    return NextResponse.json(
      { error: 'Execute o arquivo supabase-add-config-sla.sql no Supabase antes de salvar.' },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}

function normalizarDias(value: unknown, fallback: number) {
  const numero = Math.trunc(Number(value))
  return Number.isFinite(numero) && numero >= 1 && numero <= 365 ? numero : fallback
}
