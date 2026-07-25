import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const tamanhoMaximo = 15 * 1024 * 1024

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase não configurado.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'academia')
    if (!auth.ok) return auth.response

    const formData = await request.formData()
    const arquivo = formData.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return NextResponse.json({ error: 'Selecione um arquivo PDF.' }, { status: 400 })
    }
    if (arquivo.size > tamanhoMaximo) {
      return NextResponse.json({ error: 'O PDF deve ter no máximo 15 MB.' }, { status: 400 })
    }
    if (!arquivo.name.toLowerCase().endsWith('.pdf') || (arquivo.type && arquivo.type !== 'application/pdf')) {
      return NextResponse.json({ error: 'O arquivo selecionado deve estar no formato PDF.' }, { status: 400 })
    }

    const conteudo = Buffer.from(await arquivo.arrayBuffer())
    if (conteudo.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return NextResponse.json({ error: 'O arquivo selecionado não é um PDF válido.' }, { status: 400 })
    }

    const nomeBase = arquivo.name
      .replace(/\.pdf$/i, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'material'
    const pasta = new Date().toISOString().slice(0, 7)
    const caminho = `${pasta}/${Date.now()}-${crypto.randomUUID()}-${nomeBase}.pdf`
    const supabase = db()
    const { error } = await supabase.storage
      .from('academia-materiais')
      .upload(caminho, conteudo, { contentType: 'application/pdf', upsert: false })
    if (error) throw error

    const arquivoUrl = supabase.storage.from('academia-materiais').getPublicUrl(caminho).data.publicUrl
    return NextResponse.json({ ok: true, arquivoUrl, nomeArquivo: arquivo.name })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao enviar PDF.' }, { status: 500 })
  }
}
