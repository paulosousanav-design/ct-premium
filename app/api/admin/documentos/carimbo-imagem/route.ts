import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!url || !key) throw new Error('Supabase não configurado.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'documentos')
    if (!auth.ok) return auth.response
    const form = await request.formData()
    const arquivo = form.get('arquivo')
    if (!(arquivo instanceof File) || !arquivo.type.startsWith('image/') || arquivo.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Envie uma imagem PNG, JPG ou WEBP de até 5 MB.' }, { status: 400 })
    }
    const extensao = arquivo.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
    const caminho = `${Date.now()}-${crypto.randomUUID()}.${extensao}`
    const supabase = db()
    const { error } = await supabase.storage.from('documento-carimbos').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
    if (error) throw error
    const imagemUrl = supabase.storage.from('documento-carimbos').getPublicUrl(caminho).data.publicUrl
    return NextResponse.json({ ok: true, imagemUrl })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao enviar imagem.' }, { status: 500 })
  }
}
