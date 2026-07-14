import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const tipos = new Set(['COMUNICADO', 'BOLETIM', 'VIDEO', 'CURSO'])

function db() {
  if (!url || !key) throw new Error('Supabase não configurado.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'academia')
    if (!auth.ok) return auth.response
    const supabase = db()
    const { error: tabelaError } = await supabase.from('academia_conteudos').select('id').limit(0)
    if (tabelaError) return NextResponse.json({ tabelaPendente: true, conteudos: [], tecnicos: [], destinatarios: [], progressos: [] })

    const [{ data: conteudos, error }, { data: tecnicos }, { data: destinatarios }, { data: progressos }] = await Promise.all([
      supabase.from('academia_conteudos').select('*').order('criado_em', { ascending: false }),
      supabase.from('parceiros').select('id, responsavel, nome_fantasia, status').order('responsavel'),
      supabase.from('academia_conteudo_tecnicos').select('conteudo_id, parceiro_id'),
      supabase.from('academia_progresso').select('conteudo_id, parceiro_id, visualizado_em, confirmado_em'),
    ])
    if (error) throw error
    return NextResponse.json({ tabelaPendente: false, conteudos: conteudos ?? [], tecnicos: tecnicos ?? [], destinatarios: destinatarios ?? [], progressos: progressos ?? [] })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error, 'Erro ao carregar Academia Técnica.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'academia')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const id = Number(body?.id) || null
    const tipo = tipos.has(texto(body?.tipo)) ? texto(body?.tipo) : 'COMUNICADO'
    const titulo = texto(body?.titulo)
    const todos = body?.destinatarioTodos !== false
    const tecnicoIds = Array.isArray(body?.tecnicoIds) ? [...new Set(body.tecnicoIds.map(Number).filter(Boolean))] : []
    if (!titulo) return NextResponse.json({ error: 'Informe o título do conteúdo.' }, { status: 400 })
    if (!todos && !tecnicoIds.length) return NextResponse.json({ error: 'Selecione ao menos um técnico.' }, { status: 400 })

    const agora = new Date().toISOString()
    const payload = {
      tipo,
      titulo,
      resumo: texto(body?.resumo) || null,
      conteudo: texto(body?.conteudo) || null,
      video_url: urlSegura(body?.videoUrl),
      arquivo_url: urlSegura(body?.arquivoUrl),
      destaque: Boolean(body?.destaque),
      obrigatorio: Boolean(body?.obrigatorio),
      publicado: Boolean(body?.publicado),
      destinatario_todos: todos,
      publicado_em: body?.publicado ? agora : null,
      atualizado_em: agora,
    }
    const supabase = db()
    const query = id
      ? supabase.from('academia_conteudos').update(payload).eq('id', id)
      : supabase.from('academia_conteudos').insert({ ...payload, criado_por_nome: auth.nome, criado_por_email: auth.email })
    const { data, error } = await query.select('id').single()
    if (error) throw error

    await supabase.from('academia_conteudo_tecnicos').delete().eq('conteudo_id', data.id)
    if (!todos) {
      const { error: destinatariosError } = await supabase.from('academia_conteudo_tecnicos').insert(tecnicoIds.map((parceiroId) => ({ conteudo_id: data.id, parceiro_id: parceiroId })))
      if (destinatariosError) throw destinatariosError
    }
    return NextResponse.json({ ok: true, id: data.id })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error, 'Erro ao salvar conteúdo.') }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'academia')
    if (!auth.ok) return auth.response
    const id = Number(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Conteúdo inválido.' }, { status: 400 })
    const { error } = await db().from('academia_conteudos').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error, 'Erro ao excluir conteúdo.') }, { status: 500 })
  }
}

function texto(value: unknown) { return String(value ?? '').trim() }
function urlSegura(value: unknown) {
  const result = texto(value)
  if (!result) return null
  try { const parsed = new URL(result); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null } catch { return null }
}
function mensagem(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
