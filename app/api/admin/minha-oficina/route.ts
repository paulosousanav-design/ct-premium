import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!url || !key) throw new Error('Configuração do Supabase ausente.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, 'minha_oficina')
  if (!auth.ok) return auth.response
  const supabase = db()
  const { data: usuario, error: usuarioError } = await supabase.from('admin_usuarios').select('unidade_padrao_id').eq('id', auth.usuarioId).single()
  if (usuarioError || !usuario?.unidade_padrao_id) return NextResponse.json({ error: 'Empresa da oficina não localizada.' }, { status: 404 })
  const { data, error } = await supabase.from('unidades').select('id, nome_fantasia, razao_social, cnpj, telefone, whatsapp, email, cep, logradouro, numero, bairro, cidade, estado, complemento, regime_tributario, inscricao_estadual, inscricao_municipal').eq('id', usuario.unidade_padrao_id).eq('organizacao_id', auth.organizacaoId).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminPermission(request, 'minha_oficina')
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const supabase = db()
  const { data: usuario, error: usuarioError } = await supabase.from('admin_usuarios').select('unidade_padrao_id').eq('id', auth.usuarioId).single()
  if (usuarioError || !usuario?.unidade_padrao_id) return NextResponse.json({ error: 'Empresa da oficina não localizada.' }, { status: 404 })
  const texto = (v: unknown) => String(v ?? '').trim() || null
  const payload = { nome_fantasia: texto(body?.nome_fantasia), razao_social: texto(body?.razao_social), cnpj: texto(body?.cnpj), telefone: texto(body?.telefone), whatsapp: texto(body?.whatsapp), email: texto(body?.email), cep: texto(body?.cep), logradouro: texto(body?.logradouro), numero: texto(body?.numero), bairro: texto(body?.bairro), cidade: texto(body?.cidade), estado: texto(body?.estado)?.toUpperCase() ?? null, complemento: texto(body?.complemento), regime_tributario: texto(body?.regime_tributario), inscricao_estadual: texto(body?.inscricao_estadual), inscricao_municipal: texto(body?.inscricao_municipal), atualizado_em: new Date().toISOString() }
  if (!payload.nome_fantasia) return NextResponse.json({ error: 'Informe o nome da oficina.' }, { status: 400 })
  const { data, error } = await supabase.from('unidades').update(payload).eq('id', usuario.unidade_padrao_id).eq('organizacao_id', auth.organizacaoId).select('id, nome_fantasia').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}
