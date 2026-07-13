import { createClient } from '@supabase/supabase-js'
import { hashTecnicoPin } from '@/lib/tecnico-auth'
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

async function colunaExiste(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  coluna: string
) {
  const { error } = await supabase.from('parceiros').select(coluna).limit(0)
  return !error
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'tecnicos')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('parceiros')
      .select('*')
      .order('responsavel', { ascending: true })

    if (error) throw error

    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error('Erro ao listar parceiros:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao listar os tecnicos.') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'tecnicos')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const nome = String(body?.nome ?? '').trim()
    const whatsapp = String(body?.whatsapp ?? '').trim()

    if (!nome || !whatsapp) {
      return NextResponse.json(
        { error: 'Informe o nome e o WhatsApp do tecnico.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const empresa = String(body?.empresa ?? '').trim()
    const chavePix = String(body?.chavePix ?? '').trim()
    const portalPin = String(body?.portalPin ?? '').trim()
    const tipoVinculo = body?.tipoVinculo === 'PROPRIO' ? 'PROPRIO' : 'TERCEIRIZADO'
    const comissaoPecasPercentual = percentual(body?.comissaoPecasPercentual)
    const comissaoMaoObraPercentual = percentual(body?.comissaoMaoObraPercentual)
    const periodicidadeComissao = normalizarPeriodicidade(body?.periodicidadeComissao)
    const especialidades = Array.isArray(body?.especialidades)
      ? body.especialidades.map(String).filter(Boolean)
      : []
    const observacoes = String(body?.observacoes ?? '').trim()
    const avisos: string[] = []
    const payload: Record<string, unknown> = {
      razao_social: empresa || nome,
      nome_fantasia: empresa || nome,
      responsavel: nome,
      cnpj: String(body?.cpfCnpj ?? '').trim() || null,
      whatsapp,
      email: String(body?.email ?? '').trim() || null,
      cep: String(body?.cep ?? '').trim() || null,
      logradouro: String(body?.logradouro ?? '').trim() || null,
      numero: String(body?.numero ?? '').trim() || null,
      bairro: String(body?.bairro ?? '').trim() || null,
      cidade: String(body?.cidade ?? '').trim() || null,
      estado: String(body?.estado ?? '').trim() || null,
      status: body?.ativo === false ? 'INATIVO' : 'ATIVO',
    }

    if (chavePix) {
      const colunaPixExiste = await colunaExiste(supabase, 'chave_pix')
      if (colunaPixExiste) payload.chave_pix = chavePix
      else avisos.push("Chave PIX nao salva: falta a coluna 'chave_pix' no Supabase.")
    }

    if (especialidades.length > 0) {
      const colunaEspecialidadesExiste = await colunaExiste(supabase, 'especialidades')
      if (colunaEspecialidadesExiste) payload.especialidades = especialidades
      else avisos.push("Especialidades nao salvas: falta a coluna 'especialidades' no Supabase.")
    }

    if (observacoes) {
      const colunaObservacoesExiste = await colunaExiste(supabase, 'observacoes')
      if (colunaObservacoesExiste) payload.observacoes = observacoes
      else avisos.push("Observacoes nao salvas: falta a coluna 'observacoes' no Supabase.")
    }

    if (portalPin) {
      const colunaPinExiste = await colunaExiste(supabase, 'portal_pin_hash')
      if (colunaPinExiste) payload.portal_pin_hash = hashTecnicoPin(portalPin)
      else avisos.push("PIN do portal nao salvo: falta a coluna 'portal_pin_hash' no Supabase.")
    }

    const colunaTipoVinculoExiste = await colunaExiste(supabase, 'tipo_vinculo')
    if (colunaTipoVinculoExiste) payload.tipo_vinculo = tipoVinculo
    else avisos.push("Tipo de vinculo nao salvo: falta a coluna 'tipo_vinculo' no Supabase.")

    if (await colunaExiste(supabase, 'comissao_pecas_percentual')) {
      payload.comissao_pecas_percentual = comissaoPecasPercentual
      payload.comissao_mao_obra_percentual = comissaoMaoObraPercentual
      payload.periodicidade_comissao = periodicidadeComissao
    } else if (tipoVinculo === 'PROPRIO') {
      avisos.push('Comissoes nao salvas: rode o SQL de comissoes dos tecnicos.')
    }

    const { error } = await supabase.from('parceiros').insert(payload)

    if (error) throw error

    return NextResponse.json({ ok: true, avisos })
  } catch (error) {
    console.error('Erro ao salvar parceiro:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao salvar o tecnico.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'tecnicos')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const status = String(body?.status ?? '').trim().toUpperCase()
    const portalPin = String(body?.portalPin ?? '').trim()
    const nomeInformado = body?.nome !== undefined
    const whatsappInformado = body?.whatsapp !== undefined
    const temDadosCadastro =
      nomeInformado ||
      whatsappInformado ||
      body?.empresa !== undefined ||
      body?.cpfCnpj !== undefined ||
      body?.chavePix !== undefined ||
      body?.email !== undefined ||
      body?.cep !== undefined ||
      body?.logradouro !== undefined ||
      body?.numero !== undefined ||
      body?.bairro !== undefined ||
      body?.cidade !== undefined ||
      body?.estado !== undefined ||
      body?.especialidades !== undefined ||
      body?.observacoes !== undefined ||
      body?.tipoVinculo !== undefined ||
      body?.comissaoPecasPercentual !== undefined ||
      body?.comissaoMaoObraPercentual !== undefined ||
      body?.periodicidadeComissao !== undefined ||
      body?.ativo !== undefined

    if (!id || (!['ATIVO', 'INATIVO', 'PENDENTE', 'REPROVADO'].includes(status) && !portalPin && !temDadosCadastro)) {
      return NextResponse.json(
        { error: 'Dados invalidos para alterar status.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const updatePayload: Record<string, unknown> = {}

    if (['ATIVO', 'INATIVO', 'PENDENTE', 'REPROVADO'].includes(status)) updatePayload.status = status

    if (temDadosCadastro) {
      const nome = String(body?.nome ?? '').trim()
      const whatsapp = String(body?.whatsapp ?? '').trim()
      const empresa = String(body?.empresa ?? '').trim()
      const chavePix = String(body?.chavePix ?? '').trim()
      const tipoVinculo = body?.tipoVinculo === 'PROPRIO' ? 'PROPRIO' : 'TERCEIRIZADO'
      const especialidades = Array.isArray(body?.especialidades)
        ? body.especialidades.map(String).filter(Boolean)
        : []
      const observacoes = String(body?.observacoes ?? '').trim()

      if (nomeInformado && !nome) {
        return NextResponse.json({ error: 'Informe o nome do tecnico.' }, { status: 400 })
      }

      if (whatsappInformado && !whatsapp) {
        return NextResponse.json({ error: 'Informe o WhatsApp do tecnico.' }, { status: 400 })
      }

      if (nomeInformado) {
        updatePayload.responsavel = nome
        updatePayload.razao_social = empresa || nome
        updatePayload.nome_fantasia = empresa || nome
      } else if (body?.empresa !== undefined) {
        updatePayload.razao_social = empresa || null
        updatePayload.nome_fantasia = empresa || null
      }

      if (body?.cpfCnpj !== undefined) updatePayload.cnpj = String(body?.cpfCnpj ?? '').trim() || null
      if (whatsappInformado) updatePayload.whatsapp = whatsapp
      if (body?.email !== undefined) updatePayload.email = String(body?.email ?? '').trim() || null
      if (body?.cep !== undefined) updatePayload.cep = String(body?.cep ?? '').trim() || null
      if (body?.logradouro !== undefined) updatePayload.logradouro = String(body?.logradouro ?? '').trim() || null
      if (body?.numero !== undefined) updatePayload.numero = String(body?.numero ?? '').trim() || null
      if (body?.bairro !== undefined) updatePayload.bairro = String(body?.bairro ?? '').trim() || null
      if (body?.cidade !== undefined) updatePayload.cidade = String(body?.cidade ?? '').trim() || null
      if (body?.estado !== undefined) updatePayload.estado = String(body?.estado ?? '').trim() || null
      if (body?.ativo !== undefined) updatePayload.status = body.ativo === false ? 'INATIVO' : 'ATIVO'

      if (body?.chavePix !== undefined && await colunaExiste(supabase, 'chave_pix')) {
        updatePayload.chave_pix = chavePix || null
      }

      if (body?.especialidades !== undefined && await colunaExiste(supabase, 'especialidades')) {
        updatePayload.especialidades = especialidades
      }

      if (body?.observacoes !== undefined && await colunaExiste(supabase, 'observacoes')) {
        updatePayload.observacoes = observacoes || null
      }

      if (body?.tipoVinculo !== undefined && await colunaExiste(supabase, 'tipo_vinculo')) {
        updatePayload.tipo_vinculo = tipoVinculo
      }

      if (body?.comissaoPecasPercentual !== undefined && await colunaExiste(supabase, 'comissao_pecas_percentual')) {
        updatePayload.comissao_pecas_percentual = percentual(body.comissaoPecasPercentual)
        updatePayload.comissao_mao_obra_percentual = percentual(body.comissaoMaoObraPercentual)
        updatePayload.periodicidade_comissao = normalizarPeriodicidade(body.periodicidadeComissao)
      }
    }

    if (portalPin) {
      const colunaPinExiste = await colunaExiste(supabase, 'portal_pin_hash')
      if (!colunaPinExiste) {
        return NextResponse.json(
          {
            error:
              "Para salvar o PIN do portal, crie a coluna 'portal_pin_hash' na tabela parceiros usando o arquivo supabase-add-chave-pix.sql.",
          },
          { status: 400 }
        )
      }

      updatePayload.portal_pin_hash = hashTecnicoPin(portalPin)
    }

    const { error } = await supabase
      .from('parceiros')
      .update(updatePayload)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao alterar status do parceiro:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao alterar status do tecnico.') },
      { status: 500 }
    )
  }
}

function percentual(value: unknown) {
  return Math.min(100, Math.max(0, Number(value ?? 0) || 0))
}

function normalizarPeriodicidade(value: unknown) {
  const result = String(value ?? 'MENSAL').toUpperCase()
  return ['SEMANAL', 'QUINZENAL', 'MENSAL'].includes(result) ? result : 'MENSAL'
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
