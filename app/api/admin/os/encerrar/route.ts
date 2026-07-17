import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const MOTIVOS = new Set([
  'ORCAMENTO_NAO_APROVADO',
  'CLIENTE_DESISTIU',
  'SEM_POSSIBILIDADE_REPARO',
  'CLIENTE_NAO_RESPONDEU',
  'EQUIPAMENTO_NAO_ENTREGUE',
  'OUTRO',
])

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'os')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const osId = Number(body?.osId)
    const motivo = String(body?.motivo ?? '').trim().toUpperCase()
    const observacao = String(body?.observacao ?? '').trim()
    const taxaDiagnostico = Math.round(Number(body?.taxaDiagnostico ?? 0) * 100) / 100

    if (!osId || !MOTIVOS.has(motivo)) {
      return NextResponse.json({ error: 'Selecione um motivo valido para o encerramento.' }, { status: 400 })
    }
    if (!Number.isFinite(taxaDiagnostico) || taxaDiagnostico < 0) {
      return NextResponse.json({ error: 'Informe uma taxa de diagnostico valida.' }, { status: 400 })
    }
    if (motivo === 'OUTRO' && !observacao) {
      return NextResponse.json({ error: 'Descreva o motivo do encerramento.' }, { status: 400 })
    }

    const supabase = db()
    const { data: ordem, error: ordemError } = await supabase
      .from('ordens_servico')
      .select('id, numero_os, status, prioridade, unidade_id, bloqueada, valor_recebido_cliente')
      .eq('id', osId)
      .maybeSingle()

    if (ordemError) throw ordemError
    if (!ordem?.id || Number(ordem.unidade_id) !== auth.unidadeId) {
      return NextResponse.json({ error: 'OS nao encontrada nesta unidade.' }, { status: 404 })
    }
    if (ordem.status === 'FINALIZADA') {
      return NextResponse.json({ error: 'Uma OS finalizada precisa ser reaberta antes deste encerramento.' }, { status: 400 })
    }
    if (ordem.status === 'ENCERRADA_SEM_REPARO') {
      return NextResponse.json({ error: 'Esta OS ja esta encerrada sem reparo.' }, { status: 400 })
    }
    if (Number(ordem.valor_recebido_cliente ?? 0) > 0) {
      return NextResponse.json({
        error: 'A OS possui recebimento antecipado. Regularize ou estorne o valor no Financeiro antes de encerrar sem reparo.',
      }, { status: 400 })
    }

    const agora = new Date().toISOString()
    const responsavel = `${auth.nome} (${auth.email})`
    const { error: updateError } = await supabase
      .from('ordens_servico')
      .update({
        status: 'ENCERRADA_SEM_REPARO',
        bloqueada: true,
        finalizada_em: agora,
        encerrada_sem_reparo_em: agora,
        encerramento_motivo: motivo,
        encerramento_observacao: observacao || null,
        encerramento_taxa_diagnostico: taxaDiagnostico,
        encerrada_sem_reparo_por: responsavel,
        status_financeiro: taxaDiagnostico > 0 ? 'PENDENTE' : 'SEM_COBRANCA',
      })
      .eq('id', osId)

    if (updateError) throw updateError

    const descricao = [
      `OS encerrada sem reparo. Motivo: ${rotuloMotivo(motivo)}.`,
      taxaDiagnostico > 0 ? `Taxa de diagnostico: ${formatarMoeda(taxaDiagnostico)}.` : 'Sem cobranca de diagnostico.',
      observacao ? `Observacao: ${observacao}` : '',
      'Orcamento preservado somente para historico; pecas e servicos nao foram contabilizados.',
    ].filter(Boolean).join(' ')

    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: osId,
      acao: 'OS_ENCERRADA_SEM_REPARO',
      status_anterior: ordem.status ?? 'NOVA',
      status_novo: 'ENCERRADA_SEM_REPARO',
      prioridade_anterior: ordem.prioridade ?? 'NORMAL',
      prioridade_nova: ordem.prioridade ?? 'NORMAL',
      descricao,
      responsavel,
    })
    if (historicoError) throw historicoError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao encerrar OS sem reparo:', error)
    const message = error instanceof Error ? error.message : String(error)
    const estruturaPendente = /encerramento_|encerrada_sem_reparo_/i.test(message) || /column/i.test(message)
    return NextResponse.json({
      error: estruturaPendente
        ? 'Rode o arquivo supabase-add-encerramento-sem-reparo.sql no Supabase antes de usar esta opcao.'
        : 'Erro ao encerrar a OS sem reparo.',
    }, { status: 500 })
  }
}

function rotuloMotivo(motivo: string) {
  return ({
    ORCAMENTO_NAO_APROVADO: 'Orcamento nao aprovado pelo cliente',
    CLIENTE_DESISTIU: 'Cliente desistiu do reparo',
    SEM_POSSIBILIDADE_REPARO: 'Equipamento sem possibilidade de reparo',
    CLIENTE_NAO_RESPONDEU: 'Cliente nao respondeu',
    EQUIPAMENTO_NAO_ENTREGUE: 'Equipamento nao entregue ou nao localizado',
    OUTRO: 'Outro motivo',
  } as Record<string, string>)[motivo] ?? motivo
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
