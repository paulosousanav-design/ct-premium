import { criarSessaoTecnico, tecnicoSessionCookie } from '@/lib/tecnico-auth'
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

export async function GET(request: NextRequest) {
  try {
    const numeroOs = String(request.nextUrl.searchParams.get('os') ?? '').trim().toUpperCase()
    const tecnicoId = Number(request.nextUrl.searchParams.get('tecnico'))

    if (!numeroOs || !tecnicoId) {
      return NextResponse.json(
        { error: 'Link incompleto para acessar o chamado.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const { data: chamado, error } = await supabase
      .from('ordens_servico')
      .select(`
        id,
        numero_os,
        created_at,
        status,
        prioridade,
        modelo,
        defeito,
        parceiro_id,
        clientes:cliente_id (
          nome,
          whatsapp,
          cep,
          logradouro,
          numero,
          bairro,
          cidade,
          estado
        ),
        parceiros:parceiro_id (
          id,
          responsavel,
          nome_fantasia,
          razao_social,
          whatsapp
        ),
        categorias:categoria_id ( nome ),
        marcas:marca_id ( nome )
      `)
      .eq('numero_os', numeroOs)
      .eq('parceiro_id', tecnicoId)
      .maybeSingle()

    if (error) throw error
    if (!chamado) {
      return NextResponse.json(
        { error: 'Chamado nao localizado para este tecnico.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: chamado })
  } catch (error) {
    console.error('Erro ao carregar chamado do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar chamado do tecnico.') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const numeroOs = String(body?.numeroOs ?? '').trim().toUpperCase()
    const tecnicoId = Number(body?.tecnicoId)
    const acao = String(body?.acao ?? '').trim().toUpperCase()

    if (!numeroOs || !tecnicoId || !['ACEITAR', 'RECUSAR'].includes(acao)) {
      return NextResponse.json(
        { error: 'Informe OS, tecnico e acao.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const { data: chamado, error: chamadoError } = await supabase
      .from('ordens_servico')
      .select('id, numero_os, status, prioridade, parceiro_id')
      .eq('numero_os', numeroOs)
      .eq('parceiro_id', tecnicoId)
      .maybeSingle()

    if (chamadoError) throw chamadoError
    if (!chamado) {
      return NextResponse.json(
        { error: 'Chamado nao localizado ou ja atribuido a outro tecnico.' },
        { status: 404 }
      )
    }

    if (chamado.status === 'FINALIZADA') {
      return NextResponse.json(
        { error: 'Esta OS ja foi finalizada.' },
        { status: 400 }
      )
    }

    const novoStatus = acao === 'ACEITAR' ? 'EM_ATENDIMENTO' : 'EM_TRIAGEM'
    const updatePayload: Record<string, unknown> = { status: novoStatus }
    if (acao === 'RECUSAR') updatePayload.parceiro_id = null

    const { error: updateError } = await supabase
      .from('ordens_servico')
      .update(updatePayload)
      .eq('id', chamado.id)
      .eq('parceiro_id', tecnicoId)

    if (updateError) throw updateError

    const { data: tecnico } = await supabase
      .from('parceiros')
      .select('responsavel, nome_fantasia, razao_social')
      .eq('id', tecnicoId)
      .maybeSingle()

    const nomeTecnico =
      tecnico?.responsavel ?? tecnico?.nome_fantasia ?? tecnico?.razao_social ?? `Tecnico #${tecnicoId}`

    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: chamado.id,
      acao: acao === 'ACEITAR' ? 'ACEITE_TECNICO' : 'RECUSA_TECNICO',
      status_anterior: chamado.status,
      status_novo: novoStatus,
      prioridade_anterior: chamado.prioridade,
      prioridade_nova: chamado.prioridade,
      descricao:
        acao === 'ACEITAR'
          ? `Tecnico aceitou o chamado: ${nomeTecnico}`
          : `Tecnico recusou o chamado: ${nomeTecnico}`,
      responsavel: nomeTecnico,
    })

    if (historicoError) throw historicoError

    const response = NextResponse.json({ ok: true, status: novoStatus })

    if (acao === 'ACEITAR') {
      response.cookies.set(tecnicoSessionCookie, criarSessaoTecnico(tecnicoId), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 15,
      })
    }

    return response
  } catch (error) {
    console.error('Erro ao responder chamado do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao responder chamado.') },
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
