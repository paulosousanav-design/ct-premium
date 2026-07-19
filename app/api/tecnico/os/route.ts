import { lerSessaoTecnico, tecnicoSessionCookie } from '@/lib/tecnico-auth'
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
  tabela: string,
  coluna: string
) {
  const { error } = await supabase.from(tabela).select(coluna).limit(0)
  return !error
}

export async function GET(request: NextRequest) {
  try {
    const tecnicoId = getTecnicoId(request)
    const osId = Number(request.nextUrl.searchParams.get('osId'))

    if (!tecnicoId) {
      return NextResponse.json({ error: 'Acesso do tecnico nao autenticado.' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const colunasOrcamentoTecnicoExistem = await colunaExiste(supabase, 'ordens_servico', 'tecnico_total')
    const colunaPagamentoTecnicoExiste = await colunaExiste(supabase, 'ordens_servico', 'tecnico_status_pagamento')
    const colunaAgendamentoTecnicoExiste = await colunaExiste(supabase, 'ordens_servico', 'tecnico_agendado_para')
    const selectOrcamentoTecnico = colunasOrcamentoTecnicoExistem
      ? `
        tecnico_valor_pecas,
        tecnico_valor_mao_obra,
        tecnico_desconto,
        tecnico_total,`
      : ''
    const selectPagamentoTecnico = colunaPagamentoTecnicoExiste
      ? `
        tecnico_status_pagamento,
        tecnico_pago_em,`
      : ''
    const selectAgendamentoTecnico = colunaAgendamentoTecnicoExiste ? 'tecnico_agendado_para,' : ''

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseLoose = supabase as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabaseLoose
      .from('ordens_servico')
      .select(`
        id,
        numero_os,
        created_at,
        status,
        prioridade,
        garantia,
        modelo,
        numero_serie,
        defeito,
        diagnostico_tecnico,
        servico_executado,
        pecas_utilizadas,
        valor_pecas,
        valor_mao_obra,
        desconto,
        total,
        ${selectAgendamentoTecnico}
        ${selectOrcamentoTecnico}
        ${selectPagamentoTecnico}
        status_financeiro,
        observacao_tecnica,
        orcamento_status,
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
          responsavel,
          nome_fantasia,
          razao_social
        ),
        categorias:categoria_id ( nome ),
        marcas:marca_id ( nome )
      `)
      .eq('parceiro_id', tecnicoId)
      .order('created_at', { ascending: false })

    if (osId) query = query.eq('id', osId)

    const { data, error } = await query
    if (error) throw error

    const osPagasPorDocumento = await carregarOsPagasPorDocumento(supabase, tecnicoId)
    const ordensData = (data ?? []) as unknown as Record<string, unknown>[]
    const ordensNormalizadas = ordensData
      .map(normalizarOrcamentoTecnico)
      .map((ordem) => normalizarPagamentoTecnico(ordem, osPagasPorDocumento))

    if (osId) {
      const item = ordensNormalizadas[0] ?? null
      if (!item) return NextResponse.json({ error: 'OS nao localizada para este tecnico.' }, { status: 404 })

      const { data: fotos, error: fotosError } = await supabase
        .from('os_fotos')
        .select('id, nome_arquivo, url, criado_em')
        .eq('os_id', osId)
        .order('criado_em', { ascending: false })

      if (fotosError) throw fotosError

      return NextResponse.json({
        data: {
          ...item,
          fotos: fotos ?? [],
          fotos_count: fotos?.length ?? 0,
        },
      })
    }

    const selectResumoTecnico = [
      colunasOrcamentoTecnicoExistem ? 'tecnico_total' : '',
      colunaPagamentoTecnicoExiste ? 'tecnico_status_pagamento' : '',
    ].filter(Boolean).join(', ')
    const { data: resumoData, error: resumoError } = await supabase
      .from('ordens_servico')
      .select(`id, status, total, status_financeiro${selectResumoTecnico ? `, ${selectResumoTecnico}` : ''}`)
      .eq('parceiro_id', tecnicoId)

    if (resumoError) throw resumoError

    const resumoRows = (resumoData ?? []) as unknown as Record<string, unknown>[]
    const resumoItens = resumoRows
      .map(normalizarOrcamentoTecnico)
      .map((ordem) => normalizarPagamentoTecnico(ordem, osPagasPorDocumento)) as Parameters<typeof calcularResumo>[0]
    const resumo = calcularResumo(resumoItens)

    return NextResponse.json({ data: ordensNormalizadas, resumo })
  } catch (error) {
    console.error('Erro no painel do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar OS do tecnico.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const tecnicoId = Number(body?.tecnicoId) || getTecnicoId(request)
    const osId = Number(body?.osId)
    const tipo = String(body?.tipo ?? 'ATENDIMENTO').trim().toUpperCase()
    const status = String(body?.status ?? 'EM_ATENDIMENTO').trim().toUpperCase()

    if (!tecnicoId || !osId) {
      return NextResponse.json({ error: 'Informe OS e tecnico autenticado.' }, { status: 400 })
    }

    if (!['EM_ATENDIMENTO', 'AGUARDANDO_REVISAO', 'AGUARDANDO_PECA', 'PRONTO_AGUARDANDO_ENTREGA', 'CRITICA'].includes(status)) {
      return NextResponse.json({ error: 'Status invalido para atendimento tecnico.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    if (tipo === 'AGENDAMENTO') {
      const colunaAgendamentoTecnicoExiste = await colunaExiste(supabase, 'ordens_servico', 'tecnico_agendado_para')
      if (!colunaAgendamentoTecnicoExiste) {
        return NextResponse.json({ error: 'Rode o SQL de agendamento tecnico antes de salvar no sistema.' }, { status: 400 })
      }

      const dataAgenda = new Date(String(body?.dataHora ?? ''))
      if (!Number.isFinite(dataAgenda.getTime())) {
        return NextResponse.json({ error: 'Informe uma data e hora validas para o agendamento.' }, { status: 400 })
      }

      const { data: osAtual, error: osAtualError } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, status, prioridade, parceiro_id')
        .eq('id', osId)
        .eq('parceiro_id', tecnicoId)
        .maybeSingle()

      if (osAtualError) throw osAtualError
      if (!osAtual) {
        return NextResponse.json({ error: 'OS nao localizada para este tecnico.' }, { status: 404 })
      }

      const { error: updateError } = await supabase
        .from('ordens_servico')
        .update({ tecnico_agendado_para: dataAgenda.toISOString() })
        .eq('id', osId)
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
        os_id: osId,
        acao: 'AGENDAMENTO_TECNICO',
        status_anterior: osAtual.status,
        status_novo: osAtual.status,
        prioridade_anterior: osAtual.prioridade,
        prioridade_nova: osAtual.prioridade,
        descricao: `${osAtual.numero_os ?? `OS #${osId}`} agendada para ${dataAgenda.toLocaleString('pt-BR')}.`,
        responsavel: nomeTecnico,
      })

      if (historicoError) throw historicoError

      return NextResponse.json({ ok: true, tecnico_agendado_para: dataAgenda.toISOString() })
    }

    const { data: osAtual, error: osAtualError } = await supabase
      .from('ordens_servico')
      .select('id, status, prioridade, parceiro_id')
      .eq('id', osId)
      .eq('parceiro_id', tecnicoId)
      .maybeSingle()

    if (osAtualError) throw osAtualError
    if (!osAtual) {
      return NextResponse.json({ error: 'OS nao localizada para este tecnico.' }, { status: 404 })
    }

    if (status === 'AGUARDANDO_REVISAO') {
      const { count: fotosCount, error: fotosCountError } = await supabase
        .from('os_fotos')
        .select('id', { count: 'exact', head: true })
        .eq('os_id', osId)

      if (fotosCountError) throw fotosCountError

      if ((fotosCount ?? 0) < 3) {
        return NextResponse.json(
          { error: 'Para enviar o orçamento ao admin, anexe no mínimo 3 fotos da OS.' },
          { status: 400 }
        )
      }
    }

    const valorPecas = toNumber(body?.valorPecas)
    const valorMaoObra = toNumber(body?.valorMaoObra)
    const desconto = toNumber(body?.desconto)
    const total = Math.max(0, valorPecas + valorMaoObra - desconto)

    const updatePayload: Record<string, unknown> = {
      status,
      diagnostico_tecnico: String(body?.diagnosticoTecnico ?? '').trim() || null,
      servico_executado: String(body?.servicoExecutado ?? '').trim() || null,
      pecas_utilizadas: String(body?.pecasUtilizadas ?? '').trim() || null,
      observacao_tecnica: String(body?.observacaoTecnica ?? '').trim() || null,
    }

    const colunasOrcamentoTecnicoExistem = await colunaExiste(supabase, 'ordens_servico', 'tecnico_total')
    if (colunasOrcamentoTecnicoExistem) {
      updatePayload.tecnico_valor_pecas = valorPecas
      updatePayload.tecnico_valor_mao_obra = valorMaoObra
      updatePayload.tecnico_desconto = desconto
      updatePayload.tecnico_total = total
    } else {
      updatePayload.valor_pecas = valorPecas
      updatePayload.valor_mao_obra = valorMaoObra
      updatePayload.desconto = desconto
      updatePayload.total = total
    }

    if (status === 'AGUARDANDO_REVISAO') updatePayload.orcamento_status = 'PENDENTE'
    if (status === 'PRONTO_AGUARDANDO_ENTREGA') {
      updatePayload.orcamento_status = 'APROVADO'
      updatePayload.orcamento_resposta_em = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('ordens_servico')
      .update(updatePayload)
      .eq('id', osId)
      .eq('parceiro_id', tecnicoId)

    if (updateError) throw updateError

    const { data: tecnico } = await supabase
      .from('parceiros')
      .select('responsavel, nome_fantasia, razao_social')
      .eq('id', tecnicoId)
      .maybeSingle()

    const nomeTecnico =
      tecnico?.responsavel ?? tecnico?.nome_fantasia ?? tecnico?.razao_social ?? `Tecnico #${tecnicoId}`

    const resumo = [
      `Status: ${osAtual.status ?? '-'} -> ${status}`,
      status === 'PRONTO_AGUARDANDO_ENTREGA' ? 'Orcamento aprovado automaticamente.' : '',
      status === 'AGUARDANDO_REVISAO' ? 'Orcamento enviado para revisao administrativa.' : '',
      String(body?.diagnosticoTecnico ?? '').trim() ? `Diagnostico: ${String(body.diagnosticoTecnico).trim()}` : '',
      String(body?.servicoExecutado ?? '').trim() ? `Servico: ${String(body.servicoExecutado).trim()}` : '',
      String(body?.pecasUtilizadas ?? '').trim() ? `Pecas: ${String(body.pecasUtilizadas).trim()}` : '',
      `Pecas total: ${formatCurrency(valorPecas)}`,
      `Mao de obra: ${formatCurrency(valorMaoObra)}`,
      `Desconto: ${formatCurrency(desconto)}`,
      `Total: ${formatCurrency(total)}`,
    ]
      .filter(Boolean)
      .join(' | ')

    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: osId,
      acao: status === 'AGUARDANDO_REVISAO' ? 'ORCAMENTO_ENVIADO_ADMIN' : 'ATENDIMENTO_TECNICO',
      status_anterior: osAtual.status,
      status_novo: status,
      prioridade_anterior: osAtual.prioridade,
      prioridade_nova: osAtual.prioridade,
      descricao: resumo,
      responsavel: nomeTecnico,
    })

    if (historicoError) throw historicoError

    return NextResponse.json({ ok: true, total })
  } catch (error) {
    console.error('Erro ao salvar atendimento do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao salvar atendimento do tecnico.') },
      { status: 500 }
    )
  }
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0)
}

function normalizarOrcamentoTecnico<T extends Record<string, unknown>>(ordem: T) {
  const temOrcamentoTecnico =
    toNumber(ordem.tecnico_valor_pecas as number | string | null | undefined) > 0 ||
    toNumber(ordem.tecnico_valor_mao_obra as number | string | null | undefined) > 0 ||
    toNumber(ordem.tecnico_desconto as number | string | null | undefined) > 0 ||
    toNumber(ordem.tecnico_total as number | string | null | undefined) > 0

  if (temOrcamentoTecnico) return ordem

  return {
    ...ordem,
    tecnico_valor_pecas: ordem.valor_pecas,
    tecnico_valor_mao_obra: ordem.valor_mao_obra,
    tecnico_desconto: ordem.desconto,
    tecnico_total: ordem.total,
  }
}

function normalizarPagamentoTecnico<T extends Record<string, unknown>>(ordem: T, osPagasPorDocumento: Set<number>) {
  if (ordem.tecnico_status_pagamento === 'RECEBIDO') return ordem

  const osId = Number(ordem.id)
  if (!osPagasPorDocumento.has(osId)) return ordem

  return {
    ...ordem,
    tecnico_status_pagamento: 'RECEBIDO',
  }
}

async function carregarOsPagasPorDocumento(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tecnicoId: number
) {
  const ids = new Set<number>()
  const { data, error } = await supabase
    .from('tecnico_documentos')
    .select('os_id, status')
    .eq('parceiro_id', tecnicoId)
    .eq('status', 'PAGO')

  if (error) return ids

  for (const doc of data ?? []) {
    const osId = Number((doc as { os_id?: number | null }).os_id)
    if (osId) ids.add(osId)
  }

  return ids
}

function getTecnicoId(request: NextRequest) {
  const tecnicoQuery = Number(request.nextUrl.searchParams.get('tecnico'))
  if (tecnicoQuery) return tecnicoQuery

  return lerSessaoTecnico(request.cookies.get(tecnicoSessionCookie)?.value) ?? 0
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function calcularResumo(
  ordens: Array<{
    id: number
    status: string | null
    total: number | string | null
    tecnico_total?: number | string | null
    tecnico_status_pagamento?: string | null
    status_financeiro?: string | null
  }>
) {
  const executados = ordens.filter((os) => os.status === 'FINALIZADA').length
  const abertas = ordens.filter((os) => !['FINALIZADA', 'ENCERRADA_SEM_REPARO'].includes(String(os.status))).length
  const emRevisao = ordens.filter((os) => os.status === 'AGUARDANDO_REVISAO').length
  const recebido = ordens
    .filter(tecnicoRecebido)
    .reduce((acc, os) => acc + valorTotalTecnico(os), 0)
  const aReceber = ordens
    .filter((os) => !tecnicoRecebido(os))
    .reduce((acc, os) => acc + valorTotalTecnico(os), 0)
  const total = recebido + aReceber

  return {
    executados,
    abertas,
    emRevisao,
    recebido,
    aReceber,
    total,
  }
}

function valorTotalTecnico(os: { tecnico_total?: number | string | null; total: number | string | null }) {
  return os.tecnico_total === null || os.tecnico_total === undefined || os.tecnico_total === ''
    ? toNumber(os.total)
    : toNumber(os.tecnico_total)
}

function tecnicoRecebido(os: { tecnico_status_pagamento?: string | null; status_financeiro?: string | null }) {
  if (typeof os.tecnico_status_pagamento === 'string') return os.tecnico_status_pagamento === 'RECEBIDO'
  return os.status_financeiro === 'RECEBIDO'
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
