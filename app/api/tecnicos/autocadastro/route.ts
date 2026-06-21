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

async function colunaExiste(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  coluna: string
) {
  const { error } = await supabase.from('parceiros').select(coluna).limit(0)
  return !error
}

export async function POST(request: NextRequest) {
  try {
    const dados = await lerDadosAutocadastro(request)
    const body = dados.body
    const nome = String(body?.nome ?? '').trim()
    const whatsapp = String(body?.whatsapp ?? '').trim()
    const empresa = String(body?.empresa ?? '').trim()
    const chavePix = String(body?.chavePix ?? '').trim()
    const numero = String(body?.numero ?? '').trim()
    const referencia = String(body?.referencia ?? '').trim()
    const especialidades = dados.especialidades
    const experiencia = String(body?.experiencia ?? '').trim()

    if (!nome || !whatsapp) {
      return NextResponse.json(
        { error: 'Informe seu nome e WhatsApp.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const avisos: string[] = []
    const payload: Record<string, unknown> = {
      responsavel: nome,
      razao_social: empresa || nome,
      nome_fantasia: empresa || nome,
      cnpj: String(body?.cpfCnpj ?? '').trim() || null,
      whatsapp,
      email: String(body?.email ?? '').trim() || null,
      cep: String(body?.cep ?? '').trim() || null,
      logradouro: String(body?.logradouro ?? '').trim() || null,
      numero: referencia ? `${numero} - Ref: ${referencia}` : numero || null,
      bairro: String(body?.bairro ?? '').trim() || null,
      cidade: String(body?.cidade ?? '').trim() || null,
      estado: String(body?.estado ?? '').trim() || null,
      status: 'PENDENTE',
    }

    if (chavePix) {
      const colunaPixExiste = await colunaExiste(supabase, 'chave_pix')
      if (colunaPixExiste) payload.chave_pix = chavePix
      else avisos.push("Chave PIX nao salva: falta a coluna 'chave_pix' no Supabase.")
    }

    if (experiencia) {
      const colunaObservacoesExiste = await colunaExiste(supabase, 'observacoes')
      if (colunaObservacoesExiste) payload.observacoes = experiencia
      else avisos.push("Experiencia nao salva: falta a coluna 'observacoes' no Supabase.")
    }

    if (especialidades.length > 0) {
      const colunaEspecialidadesExiste = await colunaExiste(supabase, 'especialidades')
      if (colunaEspecialidadesExiste) payload.especialidades = especialidades
      else avisos.push("Especialidades nao salvas: falta a coluna 'especialidades' no Supabase.")
    }

    const colunaTipoVinculoExiste = await colunaExiste(supabase, 'tipo_vinculo')
    if (colunaTipoVinculoExiste) payload.tipo_vinculo = 'TERCEIRIZADO'
    else avisos.push("Tipo de vinculo nao salvo: falta a coluna 'tipo_vinculo' no Supabase.")

    const { error } = await supabase.from('parceiros').insert(payload)
    if (error) throw error

    if (dados.redirectHtml) {
      return NextResponse.redirect(new URL('/cadastro-tecnico?sucesso=1', request.url), { status: 303 })
    }

    return NextResponse.json({ ok: true, avisos })
  } catch (error) {
    console.error('Erro no auto cadastro do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao enviar cadastro.') },
      { status: 500 }
    )
  }
}

async function lerDadosAutocadastro(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  const accept = request.headers.get('accept') ?? ''

  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const especialidades = Array.isArray(body.especialidades)
      ? body.especialidades.map(String).filter(Boolean)
      : []

    return { body, especialidades, redirectHtml: false }
  }

  const formData = await request.formData()
  const body = Object.fromEntries(formData.entries())
  const especialidades = formData.getAll('especialidades').map(String).filter(Boolean)

  return {
    body,
    especialidades,
    redirectHtml: accept.includes('text/html'),
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
