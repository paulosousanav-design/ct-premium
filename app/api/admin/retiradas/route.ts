import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const MEIOS_AVISO = new Set(['WHATSAPP', 'TELEFONE', 'PRESENCIAL', 'EMAIL'])

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function estruturaExiste(supabase: ReturnType<typeof db>) {
  const { error } = await supabase.from('ordens_servico').select('equipamento_entrega_status').limit(0)
  return !error
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'os')
    if (!auth.ok) return auth.response
    const supabase = db()
    if (!(await estruturaExiste(supabase))) {
      return NextResponse.json({ estruturaPendente: true, ordens: [] })
    }

    const { data, error } = await supabase.from('ordens_servico').select(`
      id, numero_os, status, finalizada_em, modelo, numero_serie, defeito,
      equipamento_entrega_status, aguardando_retirada_em, cliente_avisado_em, cliente_aviso_meio,
      equipamento_entregue_em, entregue_para_nome, entregue_para_documento, entrega_observacao,
      entrega_registrada_por,
      clientes:cliente_id ( nome, cpf_cnpj, whatsapp ),
      categorias:categoria_id ( nome ),
      marcas:marca_id ( nome )
    `)
      .eq('unidade_id', auth.unidadeId)
      .in('status', ['FINALIZADA', 'ENCERRADA_SEM_REPARO'])
      .in('equipamento_entrega_status', ['PENDENTE_DEFINICAO', 'AGUARDANDO_RETIRADA'])
      .order('finalizada_em', { ascending: false })

    if (error) throw error
    return NextResponse.json({ estruturaPendente: false, ordens: data ?? [] })
  } catch (error) {
    console.error('Erro ao carregar retiradas:', error)
    return NextResponse.json({ error: 'Erro ao carregar equipamentos aguardando retirada.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'os')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const acao = String(body?.acao ?? '').trim().toUpperCase()
    const meio = String(body?.meio ?? '').trim().toUpperCase()
    const nome = String(body?.nome ?? '').trim()
    const documento = String(body?.documento ?? '').trim()
    const observacao = String(body?.observacao ?? '').trim()

    if (!id || !['AGUARDAR_RETIRADA', 'REGISTRAR_AVISO', 'REGISTRAR_ENTREGA', 'ATENDIMENTO_LOCAL'].includes(acao)) {
      return NextResponse.json({ error: 'Acao ou OS invalida.' }, { status: 400 })
    }
    if (acao === 'REGISTRAR_AVISO' && !MEIOS_AVISO.has(meio)) {
      return NextResponse.json({ error: 'Selecione como o cliente foi avisado.' }, { status: 400 })
    }
    if (acao === 'REGISTRAR_ENTREGA' && !nome) {
      return NextResponse.json({ error: 'Informe o nome de quem recebeu o equipamento.' }, { status: 400 })
    }

    const supabase = db()
    if (!(await estruturaExiste(supabase))) {
      return NextResponse.json({ error: 'Rode o arquivo supabase-add-controle-retirada.sql antes de continuar.' }, { status: 400 })
    }
    const { data: ordem, error: ordemError } = await supabase.from('ordens_servico')
      .select('id, numero_os, status, prioridade, unidade_id, equipamento_entrega_status')
      .eq('id', id)
      .eq('unidade_id', auth.unidadeId)
      .maybeSingle()
    if (ordemError) throw ordemError
    if (!ordem?.id) return NextResponse.json({ error: 'OS nao encontrada nesta unidade.' }, { status: 404 })
    if (!['FINALIZADA', 'ENCERRADA_SEM_REPARO'].includes(String(ordem.status))) {
      return NextResponse.json({ error: 'A entrega so pode ser controlada depois do encerramento da OS.' }, { status: 400 })
    }

    const agora = new Date().toISOString()
    const responsavel = `${auth.nome} (${auth.email})`
    const update: Record<string, unknown> = {}
    let descricao = ''
    let historicoAcao = ''

    if (acao === 'AGUARDAR_RETIRADA') {
      update.equipamento_entrega_status = 'AGUARDANDO_RETIRADA'
      update.aguardando_retirada_em = agora
      update.equipamento_entregue_em = null
      update.entregue_para_nome = null
      update.entregue_para_documento = null
      if (MEIOS_AVISO.has(meio)) {
        update.cliente_avisado_em = agora
        update.cliente_aviso_meio = meio
      }
      descricao = `Equipamento registrado na empresa e aguardando retirada.${MEIOS_AVISO.has(meio) ? ` Cliente avisado por ${rotuloMeio(meio)}.` : ''}`
      historicoAcao = 'EQUIPAMENTO_AGUARDANDO_RETIRADA'
    } else if (acao === 'REGISTRAR_AVISO') {
      if (ordem.equipamento_entrega_status !== 'AGUARDANDO_RETIRADA') {
        return NextResponse.json({ error: 'Primeiro registre que o equipamento esta aguardando retirada.' }, { status: 400 })
      }
      update.cliente_avisado_em = agora
      update.cliente_aviso_meio = meio
      descricao = `Cliente avisado por ${rotuloMeio(meio)} de que o equipamento esta disponivel para retirada.`
      historicoAcao = 'CLIENTE_AVISADO_RETIRADA'
    } else if (acao === 'REGISTRAR_ENTREGA') {
      update.equipamento_entrega_status = 'ENTREGUE'
      update.equipamento_entregue_em = agora
      update.entregue_para_nome = nome
      update.entregue_para_documento = documento || null
      update.entrega_observacao = observacao || null
      update.entrega_registrada_por = responsavel
      descricao = `Equipamento entregue para ${nome}${documento ? `, documento ${documento}` : ''}.${observacao ? ` Observacao: ${observacao}` : ''}`
      historicoAcao = 'EQUIPAMENTO_ENTREGUE'
    } else {
      update.equipamento_entrega_status = 'ATENDIMENTO_LOCAL'
      update.equipamento_entregue_em = agora
      update.entrega_observacao = observacao || 'Atendimento realizado no local ou equipamento ja estava com o cliente.'
      update.entrega_registrada_por = responsavel
      descricao = String(update.entrega_observacao)
      historicoAcao = 'EQUIPAMENTO_SEM_RETIRADA'
    }

    const { error: updateError } = await supabase.from('ordens_servico').update(update).eq('id', id).eq('unidade_id', auth.unidadeId)
    if (updateError) throw updateError
    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: id,
      acao: historicoAcao,
      status_anterior: ordem.status,
      status_novo: ordem.status,
      prioridade_anterior: ordem.prioridade,
      prioridade_nova: ordem.prioridade,
      descricao,
      responsavel,
    })
    if (historicoError) throw historicoError

    return NextResponse.json({ ok: true, registradoEm: agora, responsavel })
  } catch (error) {
    console.error('Erro ao atualizar retirada:', error)
    return NextResponse.json({ error: 'Erro ao atualizar a entrega do equipamento.' }, { status: 500 })
  }
}

function rotuloMeio(meio: string) {
  return ({ WHATSAPP: 'WhatsApp', TELEFONE: 'telefone', PRESENCIAL: 'atendimento presencial', EMAIL: 'e-mail' } as Record<string, string>)[meio] ?? meio
}
