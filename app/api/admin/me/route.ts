import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if (!auth.ok) return auth.response

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Configuracao do Supabase ausente.' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: usuario } = await supabase
    .from('admin_usuarios')
    .select('unidade_padrao_id')
    .eq('id', auth.usuarioId)
    .maybeSingle()
  const { data: vinculos } = await supabase
    .from('admin_usuario_unidades')
    .select('unidade_id, unidades:unidade_id(id, codigo, tipo, nome_fantasia, ativa)')
    .eq('admin_usuario_id', auth.usuarioId)

  const unidades = (vinculos ?? [])
    .map((item) => item.unidades)
    .flat()
    .filter((item) => item?.ativa !== false)

  return NextResponse.json({
    email: auth.email,
    permissoes: auth.permissoes,
    unidadePadraoId: Number(usuario?.unidade_padrao_id) || null,
    unidades,
  })
}
