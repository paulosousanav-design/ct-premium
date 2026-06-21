import {
  criarSessaoTecnico,
  hashTecnicoPin,
  lerSessaoTecnico,
  normalizarTelefone,
  tecnicoSessionCookie,
} from '@/lib/tecnico-auth'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const whatsapp = normalizarTelefone(body?.whatsapp)
    const pin = String(body?.pin ?? '').replace(/\D/g, '')

    if (!whatsapp || pin.length < 4) {
      return NextResponse.json(
        { error: 'Informe o WhatsApp e o PIN de acesso.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('parceiros')
      .select('id, responsavel, nome_fantasia, razao_social, whatsapp, status, portal_pin_hash')
      .eq('status', 'ATIVO')

    if (error) throw error

    const tecnico = (data ?? []).find((item) => normalizarTelefone(item.whatsapp).endsWith(whatsapp))
    if (!tecnico?.id || !tecnico.portal_pin_hash) {
      return NextResponse.json(
        { error: 'Tecnico nao encontrado ou PIN ainda nao configurado.' },
        { status: 401 }
      )
    }

    if (tecnico.portal_pin_hash !== hashTecnicoPin(pin)) {
      return NextResponse.json({ error: 'WhatsApp ou PIN invalido.' }, { status: 401 })
    }

    const response = NextResponse.json({
      ok: true,
      tecnico: {
        id: tecnico.id,
        nome: tecnico.responsavel ?? tecnico.nome_fantasia ?? tecnico.razao_social ?? 'Tecnico',
      },
    })

    response.cookies.set(tecnicoSessionCookie, criarSessaoTecnico(Number(tecnico.id)), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 15,
    })

    return response
  } catch (error) {
    console.error('Erro no login do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao entrar no portal do tecnico.') },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const tecnicoId = lerSessaoTecnico(request.cookies.get(tecnicoSessionCookie)?.value)

    if (!tecnicoId) {
      return NextResponse.json({ error: 'Tecnico nao autenticado.' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data: tecnico, error } = await supabase
      .from('parceiros')
      .select('id, responsavel, nome_fantasia, razao_social, whatsapp, status')
      .eq('id', tecnicoId)
      .eq('status', 'ATIVO')
      .maybeSingle()

    if (error) throw error
    if (!tecnico) {
      return NextResponse.json({ error: 'Tecnico nao localizado ou inativo.' }, { status: 401 })
    }

    return NextResponse.json({
      ok: true,
      tecnico: {
        id: tecnico.id,
        nome: tecnico.responsavel ?? tecnico.nome_fantasia ?? tecnico.razao_social ?? 'Tecnico',
        whatsapp: tecnico.whatsapp,
      },
    })
  } catch (error) {
    console.error('Erro ao consultar sessao do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao consultar sessao do tecnico.') },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(tecnicoSessionCookie, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
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
