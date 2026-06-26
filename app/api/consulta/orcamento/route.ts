import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Configuração do Supabase ausente no servidor.' },
        { status: 500 }
      )
    }

    const body = await request.json().catch(() => null)
    const numeroOs = String(body?.numeroOs ?? '').trim().toUpperCase()
    const whatsapp = normalizeDigits(String(body?.whatsapp ?? ''))
    const acao = String(body?.acao ?? '').trim().toUpperCase()

    if (!numeroOs || whatsapp.length < 8 || !['APROVAR', 'REPROVAR'].includes(acao)) {
      return NextResponse.json(
        { error: 'Dados inválidos para responder o orçamento.' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: os, error: osError } = await supabase
      .from('ordens_servico')
      .select('id, cliente_id, status, prioridade, orcamento_status')
      .eq('numero_os', numeroOs)
      .maybeSingle()

    if (osError || !os || !os.cliente_id) {
      return NextResponse.json(
        { error: 'Não foi possível localizar o chamado.' },
        { status: 404 }
      )
    }

    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select('id, whatsapp')
      .eq('id', os.cliente_id)
      .maybeSingle()

    if (clienteError || !cliente || normalizeDigits(cliente.whatsapp ?? '') !== whatsapp) {
      return NextResponse.json(
        { error: 'Não foi possível localizar o chamado.' },
        { status: 404 }
      )
    }

    if (os.orcamento_status && os.orcamento_status !== 'PENDENTE') {
      return NextResponse.json(
        { error: 'Este orçamento já foi respondido.' },
        { status: 409 }
      )
    }

    const novoStatusOrcamento = acao === 'APROVAR' ? 'APROVADO' : 'REPROVADO'
    const statusAtualizado =
      acao === 'REPROVAR'
        ? 'AGUARDANDO_REVISAO'
        : ['NOVA', 'EM_TRIAGEM', 'AGUARDANDO_REVISAO', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_PECA'].includes(
              os.status ?? 'NOVA'
            )
          ? 'EM_ATENDIMENTO'
          : os.status ?? 'NOVA'

    const { error: updateError } = await supabase
      .from('ordens_servico')
      .update({
        orcamento_status: novoStatusOrcamento,
        orcamento_resposta_em: new Date().toISOString(),
        status: statusAtualizado,
      })
      .eq('id', os.id)

    if (updateError) throw updateError

    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: os.id,
      acao: acao === 'APROVAR' ? 'ORCAMENTO_APROVADO' : 'ORCAMENTO_REPROVADO',
      status_anterior: os.status ?? 'NOVA',
      status_novo: statusAtualizado,
      prioridade_anterior: os.prioridade ?? 'NORMAL',
      prioridade_nova: os.prioridade ?? 'NORMAL',
      descricao:
        acao === 'APROVAR'
          ? 'Cliente aprovou o orçamento.'
          : 'Cliente reprovou o orçamento.',
      responsavel: 'Cliente',
    })

    if (historicoError) throw historicoError

    return NextResponse.json({
      ok: true,
      orcamento_status: novoStatusOrcamento,
      status: statusAtualizado,
    })
  } catch (error) {
    console.error('Erro ao responder orçamento:', error)
    return NextResponse.json(
      { error: 'Erro ao responder o orçamento.' },
      { status: 500 }
    )
  }
}
