import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { lerSessaoTecnico, tecnicoSessionCookie } from '@/lib/tecnico-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
function db() { if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase não configurado.'); return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } }) }
function tecnicoId(request: NextRequest) { return lerSessaoTecnico(request.cookies.get(tecnicoSessionCookie)?.value) }

export async function GET(request: NextRequest) {
  try {
    const id = tecnicoId(request)
    if (!id) return NextResponse.json({ error: 'Técnico não autenticado.' }, { status: 401 })
    const { data, error } = await db().from('parceiros').select('id, responsavel, nome_fantasia, tipo_vinculo, especialidades, cidade, estado, status, foto_cracha_url, cracha_codigo, cracha_status, cracha_validade').eq('id', id).maybeSingle()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) { return NextResponse.json({ error: erro(error) }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const id = tecnicoId(request)
    if (!id) return NextResponse.json({ error: 'Técnico não autenticado.' }, { status: 401 })
    const form = await request.formData()
    const foto = form.get('foto')
    if (!(foto instanceof File) || !foto.type.startsWith('image/') || foto.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Envie uma imagem de até 5 MB.' }, { status: 400 })
    const supabase = db()
    const { data: atual } = await supabase.from('parceiros').select('cracha_codigo').eq('id', id).maybeSingle()
    const extensao = foto.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
    const caminho = `${id}/${Date.now()}.${extensao}`
    const { error: uploadError } = await supabase.storage.from('tecnico-crachas').upload(caminho, foto, { contentType: foto.type, upsert: false })
    if (uploadError) throw uploadError
    const url = supabase.storage.from('tecnico-crachas').getPublicUrl(caminho).data.publicUrl
    const { error } = await supabase.from('parceiros').update({ foto_cracha_url: url, cracha_codigo: atual?.cracha_codigo || crypto.randomUUID(), cracha_status: 'PENDENTE', cracha_aprovado_por: null, cracha_aprovado_em: null }).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) { return NextResponse.json({ error: erro(error) }, { status: 500 }) }
}
function erro(error: unknown) { return error instanceof Error ? error.message : 'Erro ao atualizar o crachá.' }
