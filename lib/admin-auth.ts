import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type AdminAuthResult =
  | { ok: true; email: string; permissoes: string[] }
  | { ok: false; response: NextResponse }

function getSupabaseAdminAuth() {
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

export async function requireAdminPermission(
  request: NextRequest,
  permissao: string
): Promise<AdminAuthResult> {
  const auth = await requireAdminUser(request)
  if (!auth.ok) return auth

  if (!auth.permissoes.includes(permissao)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Permissao administrativa insuficiente.' }, { status: 403 }),
    }
  }

  return auth
}

export async function requireAdminUser(request: NextRequest): Promise<AdminAuthResult> {
  try {
    const token = getBearerToken(request)
    if (!token) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Acesso administrativo nao autenticado.' }, { status: 401 }),
      }
    }

    const supabase = getSupabaseAdminAuth()
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    const email = userData.user?.email?.toLowerCase()

    if (userError || !email) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Sessao administrativa invalida.' }, { status: 401 }),
      }
    }

    const { data, error } = await supabase
      .from('admin_usuarios')
      .select('ativo, permissoes')
      .eq('email', email)
      .maybeSingle()

    if (error || !data || data.ativo === false) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Usuario administrativo sem permissao ativa.' }, { status: 403 }),
      }
    }

    const permissoes = Array.isArray(data.permissoes) ? data.permissoes.map(String) : []
    return { ok: true, email, permissoes }
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : 'Erro ao validar acesso administrativo.' },
        { status: 500 }
      ),
    }
  }
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? ''
  const [type, token] = authorization.split(' ')

  if (type?.toLowerCase() !== 'bearer' || !token) return ''
  return token
}
