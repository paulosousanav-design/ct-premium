import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function requireAdminUnidade(request: NextRequest, permissao: string) {
  const resultado = await resolverEscopo(request, permissao, false)
  if (resultado.ok && resultado.unidadeId === null) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Selecione uma unidade operacional.' }, { status: 400 }),
    }
  }
  return resultado
}

export async function requireAdminEscopoGerencial(request: NextRequest, permissao: string) {
  return resolverEscopo(request, permissao, true)
}

async function resolverEscopo(request: NextRequest, permissao: string, permiteConsolidado: boolean) {
  const auth = await requireAdminPermission(request, permissao)
  if (!auth.ok) return auth

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Configuracao do Supabase ausente.' }, { status: 500 }),
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: usuario, error: usuarioError } = await supabase
    .from('admin_usuarios')
    .select('unidade_padrao_id')
    .eq('id', auth.usuarioId)
    .maybeSingle()

  if (usuarioError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Estrutura de unidades ainda nao foi configurada.' }, { status: 400 }),
    }
  }

  const { data: vinculos, error: vinculosError } = await supabase
    .from('admin_usuario_unidades')
    .select('unidade_id')
    .eq('admin_usuario_id', auth.usuarioId)

  if (vinculosError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Nao foi possivel validar as unidades do usuario.' }, { status: 500 }),
    }
  }

  const permitidas = (vinculos ?? []).map((item) => Number(item.unidade_id)).filter(Boolean)
  const cabecalho = String(request.headers.get('x-unidade-id') ?? '').trim().toUpperCase()
  if (permiteConsolidado && cabecalho === 'CONSOLIDADO') {
    return { ...auth, unidadeId: null, unidadesPermitidas: permitidas, consolidado: true as const }
  }
  const solicitada = Number(cabecalho)
  const padrao = Number(usuario?.unidade_padrao_id)
  const unidadeId = permitidas.includes(solicitada)
    ? solicitada
    : permitidas.includes(padrao)
      ? padrao
      : permitidas[0]

  if (!unidadeId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Usuario sem unidade autorizada.' }, { status: 403 }),
    }
  }

  return { ...auth, unidadeId, unidadesPermitidas: permitidas, consolidado: false as const }
}
