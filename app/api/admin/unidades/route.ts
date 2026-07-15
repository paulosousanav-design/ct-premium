import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!url || !key) throw new Error('Supabase não configurado.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'unidades')
    if (!auth.ok) return auth.response
    const supabase = db()
    const { error: tabelaError } = await supabase.from('unidades').select('id').limit(0)
    if (tabelaError) return NextResponse.json({ tabelaPendente: true, data: [], vinculos: [] })
    const [{ data, error }, { data: vinculos }] = await Promise.all([
      supabase.from('unidades').select('*').order('tipo').order('nome_fantasia'),
      supabase.from('admin_usuario_unidades').select('unidade_id, admin_usuario_id'),
    ])
    if (error) throw error
    return NextResponse.json({ tabelaPendente: false, data: data ?? [], vinculos: vinculos ?? [] })
  } catch (error) { return NextResponse.json({ error: mensagem(error, 'Erro ao carregar unidades.') }, { status: 500 }) }
}

export async function POST(request: NextRequest) { return salvar(request, false) }
export async function PATCH(request: NextRequest) { return salvar(request, true) }

async function salvar(request: NextRequest, editando: boolean) {
  try {
    const auth = await requireAdminPermission(request, 'unidades')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const tipo = texto(body?.tipo) === 'MATRIZ' ? 'MATRIZ' : 'FILIAL'
    const nomeFantasia = texto(body?.nomeFantasia)
    const codigo = normalizarCodigo(body?.codigo || nomeFantasia)
    if (!nomeFantasia || !codigo || (editando && !id)) return NextResponse.json({ error: 'Informe código e nome da unidade.' }, { status: 400 })
    const payload = { codigo, tipo, nome_fantasia: nomeFantasia, razao_social: texto(body?.razaoSocial) || null, cnpj: texto(body?.cnpj) || null, telefone: texto(body?.telefone) || null, whatsapp: texto(body?.whatsapp) || null, email: texto(body?.email) || null, cep: texto(body?.cep) || null, logradouro: texto(body?.logradouro) || null, numero: texto(body?.numero) || null, bairro: texto(body?.bairro) || null, cidade: texto(body?.cidade) || null, estado: texto(body?.estado).toUpperCase() || null, complemento: texto(body?.complemento) || null, ativa: body?.ativa !== false, atualizado_em: new Date().toISOString() }
    const supabase = db()
    if (editando) {
      const { data: atual } = await supabase.from('unidades').select('tipo').eq('id', id).maybeSingle()
      if (atual?.tipo === 'MATRIZ' && tipo !== 'MATRIZ') return NextResponse.json({ error: 'A unidade Matriz não pode ser transformada em Filial.' }, { status: 400 })
      if (atual?.tipo === 'MATRIZ' && body?.ativa === false) return NextResponse.json({ error: 'A unidade Matriz não pode ser desativada.' }, { status: 400 })
      const { data, error } = await supabase.from('unidades').update(payload).eq('id', id).select('*').single(); if (error) throw error
      return NextResponse.json({ ok: true, data })
    }
    const { data, error } = await supabase.from('unidades').insert(payload).select('*').single(); if (error) throw error
    return NextResponse.json({ ok: true, data })
  } catch (error) { return NextResponse.json({ error: mensagem(error, 'Erro ao salvar unidade.') }, { status: 500 }) }
}

function texto(value: unknown) { return String(value ?? '').trim() }
function normalizarCodigo(value: unknown) { return texto(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 30) }
function mensagem(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
