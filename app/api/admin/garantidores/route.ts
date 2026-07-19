import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'garantidores')
    if (!auth.ok) return auth.response
    const { data, error } = await db().from('garantidores').select('*').order('nome')
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    return respostaErro(error, 'Erro ao listar os garantidores.')
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'garantidores')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const payload = validarPayload(body)
    if (!payload.nome) return NextResponse.json({ error: 'Informe o nome do garantidor.' }, { status: 400 })
    const { error } = await db().from('garantidores').insert(payload)
    if (error) throw error
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    return respostaErro(error, 'Erro ao cadastrar o garantidor.')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'garantidores')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    if (!id) return NextResponse.json({ error: 'Garantidor invalido.' }, { status: 400 })
    const payload = body?.somenteStatus
      ? { ativo: Boolean(body?.ativo) }
      : validarPayload(body)
    if (!body?.somenteStatus && !('nome' in payload && payload.nome)) {
      return NextResponse.json({ error: 'Informe o nome do garantidor.' }, { status: 400 })
    }
    const { data, error } = await db().from('garantidores').update(payload).eq('id', id).select('id').maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Garantidor nao encontrado.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return respostaErro(error, 'Erro ao atualizar o garantidor.')
  }
}

function validarPayload(body: Record<string, unknown> | null) {
  return {
    nome: String(body?.nome ?? '').trim(),
    cnpj: String(body?.cnpj ?? '').trim(),
    inscricao_estadual: String(body?.inscricao_estadual ?? '').trim(),
    tipo: String(body?.tipo ?? 'FABRICANTE').trim().toUpperCase(),
    contato: String(body?.contato ?? '').trim(),
    telefone: String(body?.telefone ?? '').trim(),
    email: String(body?.email ?? '').trim(),
    prazo_pagamento: Math.max(0, Math.round(Number(body?.prazo_pagamento ?? 0) || 0)),
    endereco: String(body?.endereco ?? '').trim(),
    observacoes: String(body?.observacoes ?? '').trim(),
    ativo: body?.ativo !== false,
  }
}

function respostaErro(error: unknown, fallback: string) {
  console.error(fallback, error)
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 })
}
