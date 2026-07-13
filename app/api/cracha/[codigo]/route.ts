import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(_request: Request, context: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await context.params
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 500 })
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data } = await supabase.from('parceiros').select('responsavel, nome_fantasia, tipo_vinculo, especialidades, cidade, estado, status, foto_cracha_url, cracha_status, cracha_validade').eq('cracha_codigo', codigo).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Crachá não localizado.' }, { status: 404 })
  const valido = data.status === 'ATIVO' && data.cracha_status === 'APROVADO' && (!data.cracha_validade || data.cracha_validade >= new Date().toISOString().slice(0, 10))
  return NextResponse.json({ data: { nome: data.responsavel || data.nome_fantasia, vinculo: data.tipo_vinculo, especialidades: data.especialidades, localidade: [data.cidade, data.estado].filter(Boolean).join(' / '), foto: valido ? data.foto_cracha_url : null, validade: data.cracha_validade, valido } })
}
