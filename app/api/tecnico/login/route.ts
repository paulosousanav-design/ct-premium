import {
  criarSessaoTecnico,
  hashTecnicoPin,
  lerSessaoTecnico,
  normalizarTelefone,
  telefonesCorrespondem,
  tecnicoSessionCookie,
} from '@/lib/tecnico-auth'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { limitarRotaPublica } from '@/lib/rate-limit'
import { codigoTecnicoValido } from '@/lib/tecnico-otp'

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
    const bloqueio = await limitarRotaPublica(request, 'login-tecnico', 8, 900)
    if (bloqueio) return bloqueio
    const body = await request.json().catch(() => null)
    const whatsapp = normalizarTelefone(body?.whatsapp)
    const pin = String(body?.pin ?? '').replace(/\D/g, '')
    const codigo = String(body?.codigo ?? '').replace(/\D/g, '')
    const modoCodigo = body?.modo === 'CODIGO'

    if (whatsapp.length < 10 || (modoCodigo ? codigo.length !== 6 : pin.length < 4)) {
      return NextResponse.json(
        { error: modoCodigo ? 'Informe o WhatsApp e o código de seis dígitos.' : 'Informe o WhatsApp e o PIN de acesso.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('parceiros')
      .select('id, responsavel, nome_fantasia, razao_social, whatsapp, status, portal_pin_hash')
      .eq('status', 'ATIVO')

    if (error) throw error

    const tecnico = (data ?? []).find((item) => telefonesCorrespondem(item.whatsapp, whatsapp))
    if (!tecnico?.id) {
      return NextResponse.json(
        { error: modoCodigo ? 'WhatsApp ou código inválido.' : 'Técnico não encontrado ou PIN ainda não configurado.' },
        { status: 401 }
      )
    }

    if (modoCodigo) {
      const { data: acesso, error: erroAcesso } = await supabase
        .from('tecnico_login_codigos')
        .select('id, codigo_hash, tentativas, expira_em')
        .eq('parceiro_id', tecnico.id)
        .is('usado_em', null)
        .gt('expira_em', new Date().toISOString())
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (erroAcesso) {
        if (/tecnico_login_codigos|PGRST205/i.test(formatarErro(erroAcesso, ''))) {
          return NextResponse.json(
            { error: 'Execute o arquivo supabase-add-login-whatsapp-tecnico.sql antes de testar o código.' },
            { status: 503 }
          )
        }
        throw erroAcesso
      }

      if (!acesso?.id || Number(acesso.tentativas) >= 5) {
        return NextResponse.json({ error: 'Código inválido ou expirado. Solicite um novo.' }, { status: 401 })
      }

      const valido = codigoTecnicoValido(codigo, Number(tecnico.id), String(acesso.codigo_hash))
      if (!valido) {
        const tentativas = Number(acesso.tentativas) + 1
        await supabase
          .from('tecnico_login_codigos')
          .update({
            tentativas,
            ...(tentativas >= 5 ? { usado_em: new Date().toISOString() } : {}),
          })
          .eq('id', acesso.id)
        return NextResponse.json({ error: 'Código inválido ou expirado. Confira e tente novamente.' }, { status: 401 })
      }

      const { data: consumido, error: erroUso } = await supabase
        .from('tecnico_login_codigos')
        .update({ usado_em: new Date().toISOString() })
        .eq('id', acesso.id)
        .is('usado_em', null)
        .select('id')
        .maybeSingle()

      if (erroUso) throw erroUso
      if (!consumido?.id) {
        return NextResponse.json({ error: 'Este código já foi utilizado. Solicite um novo.' }, { status: 401 })
      }
    } else {
      if (!tecnico.portal_pin_hash) {
        return NextResponse.json(
          { error: 'Técnico não encontrado ou PIN ainda não configurado.' },
          { status: 401 }
        )
      }
      if (tecnico.portal_pin_hash !== hashTecnicoPin(pin)) {
        return NextResponse.json({ error: 'WhatsApp ou PIN inválido.' }, { status: 401 })
      }
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
      { error: formatarErro(error, 'Erro ao entrar no portal do técnico.') },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const tecnicoId = lerSessaoTecnico(request.cookies.get(tecnicoSessionCookie)?.value)

    if (!tecnicoId) {
      return NextResponse.json({ error: 'Técnico não autenticado.' }, { status: 401 })
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
      return NextResponse.json({ error: 'Técnico não localizado ou inativo.' }, { status: 401 })
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
      { error: formatarErro(error, 'Erro ao consultar a sessão do técnico.') },
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
