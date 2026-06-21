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
    const auth = await requireAdminPermission(request, 'pecas')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await pecasExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json({ data: [], tabelaPendente: true })
    }

    const { data, error } = await supabase
      .from('pecas')
      .select('*')
      .order('descricao', { ascending: true })

    if (error) throw error

    return NextResponse.json({ data: data ?? [], tabelaPendente: false })
  } catch (error) {
    console.error('Erro ao listar pecas:', error)
    return NextResponse.json({ error: formatarErro(error, 'Erro ao listar pecas.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'pecas')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const descricao = texto(body?.descricao)

    if (!descricao) {
      return NextResponse.json({ error: 'Informe a descricao da peca.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await pecasExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json(
        { error: "Crie a tabela 'pecas' no Supabase usando o SQL atualizado." },
        { status: 400 }
      )
    }

    const payload = {
      codigo: texto(body?.codigo) || null,
      descricao,
      categoria: texto(body?.categoria) || null,
      marca: texto(body?.marca) || null,
      valor_custo: numero(body?.valor_custo),
      valor_venda: numero(body?.valor_venda),
      estoque: numero(body?.estoque),
      estoque_minimo: numero(body?.estoque_minimo),
      localizacao: texto(body?.localizacao) || null,
      ativo: body?.ativo !== false,
      atualizado_em: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('pecas').insert(payload).select('*').single()
    if (error) throw error

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao salvar peca:', error)
    return NextResponse.json({ error: formatarErro(error, 'Erro ao salvar peca.') }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'pecas')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const descricao = texto(body?.descricao)

    if (!id || !descricao) {
      return NextResponse.json({ error: 'Informe a peca e a descricao para atualizar.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await pecasExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json(
        { error: "Crie a tabela 'pecas' no Supabase usando o SQL atualizado." },
        { status: 400 }
      )
    }

    const payload = {
      codigo: texto(body?.codigo) || null,
      descricao,
      categoria: texto(body?.categoria) || null,
      marca: texto(body?.marca) || null,
      valor_custo: numero(body?.valor_custo),
      valor_venda: numero(body?.valor_venda),
      estoque: numero(body?.estoque),
      estoque_minimo: numero(body?.estoque_minimo),
      localizacao: texto(body?.localizacao) || null,
      ativo: body?.ativo !== false,
      atualizado_em: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('pecas')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao atualizar peca:', error)
    return NextResponse.json({ error: formatarErro(error, 'Erro ao atualizar peca.') }, { status: 500 })
  }
}

async function pecasExiste(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { error } = await supabase.from('pecas').select('id').limit(0)
  return !error
}

function texto(value: unknown) {
  return String(value ?? '').trim()
}

function numero(value: unknown) {
  const parsed = Number(String(value ?? '0').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
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
