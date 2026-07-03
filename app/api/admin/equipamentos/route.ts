import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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
    const auth = await requireAdminPermission(request, 'configuracoes')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const [{ data: categorias, error: categoriasError }, { data: marcas, error: marcasError }] =
      await Promise.all([
        supabase.from('categorias').select('id, nome').order('nome', { ascending: true }),
        supabase.from('marcas').select('id, nome, categoria_id').order('nome', { ascending: true }),
      ])

    if (categoriasError) throw categoriasError
    if (marcasError) throw marcasError

    return NextResponse.json({
      categorias: categorias ?? [],
      marcas: marcas ?? [],
    })
  } catch (error) {
    console.error('Erro ao carregar equipamentos:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar tipos e marcas.') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'configuracoes')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const tipo = String(body?.tipo ?? '').trim().toUpperCase()
    const nome = String(body?.nome ?? '').trim()
    const supabase = getSupabaseAdmin()

    if (!nome || !['CATEGORIA', 'MARCA'].includes(tipo)) {
      return NextResponse.json({ error: 'Informe tipo e nome.' }, { status: 400 })
    }

    if (tipo === 'CATEGORIA') {
      const { data, error } = await supabase
        .from('categorias')
        .insert({ nome })
        .select('id, nome')
        .single()

      if (error) throw error
      return NextResponse.json({ ok: true, data })
    }

    const categoriaId = Number(body?.categoriaId)
    if (!categoriaId) {
      return NextResponse.json({ error: 'Selecione o tipo do equipamento para cadastrar a marca.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('marcas')
      .insert({ nome, categoria_id: categoriaId })
      .select('id, nome, categoria_id')
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao salvar equipamento:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao salvar tipo ou marca.') },
      { status: 500 }
    )
  }
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code]
      .filter(Boolean)
      .map(String)

    if (possiveis.length > 0) return possiveis.join(' | ')
  }

  return fallback
}
