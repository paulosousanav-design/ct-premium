import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const permissoesValidas = new Set([
  'dashboard',
  'os',
  'finalizadas',
  'tecnicos',
  'garantidores',
  'aprovacao',
  'financeiro',
  'pecas',
  'usuarios',
  'relatorios',
  'configuracoes',
])

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configuracao do Supabase ausente no servidor.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await adminUsuariosExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json({ data: [], tabelaPendente: true })
    }

    const { data, error } = await supabase
      .from('admin_usuarios')
      .select('id, auth_user_id, nome, email, ativo, permissoes, criado_em, atualizado_em')
      .order('nome', { ascending: true })

    if (error) throw error

    return NextResponse.json({ data: data ?? [], tabelaPendente: false })
  } catch (error) {
    console.error('Erro ao listar usuarios admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao listar usuarios.') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const nome = String(body?.nome ?? '').trim()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const senha = String(body?.senha ?? '').trim()
    const permissoes = normalizarPermissoes(body?.permissoes)
    const ativo = body?.ativo !== false

    if (!nome || !email || !senha) {
      return NextResponse.json({ error: 'Informe nome, e-mail e senha.' }, { status: 400 })
    }

    if (senha.length < 6) {
      return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await adminUsuariosExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json(
        { error: "Crie a tabela 'admin_usuarios' no Supabase usando o SQL atualizado." },
        { status: 400 }
      )
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })

    if (authError && !String(authError.message).toLowerCase().includes('already')) throw authError

    const authUserId = authData.user?.id ?? null
    const { data, error } = await supabase
      .from('admin_usuarios')
      .upsert(
        {
          auth_user_id: authUserId,
          nome,
          email,
          ativo,
          permissoes,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )
      .select('id, auth_user_id, nome, email, ativo, permissoes, criado_em, atualizado_em')
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao criar usuario admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao criar usuario.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const nome = String(body?.nome ?? '').trim()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const permissoes = normalizarPermissoes(body?.permissoes)
    const ativo = body?.ativo !== false

    if (!id || !nome || !email) {
      return NextResponse.json({ error: 'Informe usuario, nome e e-mail.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('admin_usuarios')
      .update({
        nome,
        email,
        ativo,
        permissoes,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, auth_user_id, nome, email, ativo, permissoes, criado_em, atualizado_em')
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao atualizar usuario admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao atualizar usuario.') },
      { status: 500 }
    )
  }
}

async function adminUsuariosExiste(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { error } = await supabase.from('admin_usuarios').select('id').limit(0)
  return !error
}

function normalizarPermissoes(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(String).filter((item) => permissoesValidas.has(item))
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code].filter(Boolean).map(String)
    if (possiveis.length > 0) return possiveis.join(' | ')
  }

  return fallback
}
