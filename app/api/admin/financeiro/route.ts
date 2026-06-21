import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type OrdemFinanceiro = Record<string, unknown> & {
  id: number
  tecnico_status_pagamento?: string | null
}

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
    const auth = await requireAdminPermission(request, 'financeiro')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const temPagamentoTecnico = await colunaExiste(supabase, 'ordens_servico', 'tecnico_status_pagamento')
    const selectPagamentoTecnico = temPagamentoTecnico
      ? `
        tecnico_status_pagamento,
        tecnico_pago_em,`
      : ''

    const { data: ordens, error: ordensError } = await supabase
      .from('ordens_servico')
      .select(`
        id,
        numero_os,
        created_at,
        status,
        status_financeiro,
        data_pagamento,
        total,
        cliente_total,
        tecnico_total,
        ${selectPagamentoTecnico}
        parceiro_id,
        garantia,
        tipo_atendimento,
        numero_nota_fiscal,
        clientes:cliente_id ( nome ),
        parceiros:parceiro_id ( responsavel, nome_fantasia, razao_social )
      `)
      .order('created_at', { ascending: false })

    if (ordensError) throw ordensError

    const documentos = await carregarDocumentosTecnicos(supabase)
    const historico = await carregarHistoricoFinanceiro(supabase)
    const ordensData = (ordens ?? []) as unknown as OrdemFinanceiro[]
    const ordensComPagamentoTecnico = ordensData.map((ordem) => {
      const documentoPago = documentos.data.some(
        (doc: { os_id?: number | null; status?: string | null }) =>
          doc.os_id === ordem.id && doc.status === 'PAGO'
      )

      if (!documentoPago || ordem.tecnico_status_pagamento === 'RECEBIDO') return ordem

      return {
        ...ordem,
        tecnico_status_pagamento: 'RECEBIDO',
      }
    })

    return NextResponse.json({
      ordens: ordensComPagamentoTecnico,
      documentos: documentos.data,
      documentosPendentes: documentos.tabelaPendente,
      historico: historico.data,
      historicoPendente: historico.tabelaPendente,
    })
  } catch (error) {
    console.error('Erro ao carregar financeiro admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar financeiro.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'financeiro')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const tipo = String(body?.tipo ?? '').trim().toUpperCase()
    const id = Number(body?.id)
    const supabase = getSupabaseAdmin()

    if (!id || !['OS', 'DOCUMENTO', 'TECNICO'].includes(tipo)) {
      return NextResponse.json({ error: 'Dados invalidos para atualizar financeiro.' }, { status: 400 })
    }

    if (tipo === 'OS') {
      const status = String(body?.status ?? 'RECEBIDO').trim().toUpperCase()
      if (!['PENDENTE', 'FATURADO', 'RECEBIDO'].includes(status)) {
        return NextResponse.json({ error: 'Status financeiro invalido.' }, { status: 400 })
      }

      const { data: ordemAtual } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, status, status_financeiro, total, cliente_total')
        .eq('id', id)
        .maybeSingle()

      if (ordemAtual?.status !== 'FINALIZADA') {
        return NextResponse.json(
          { error: 'Somente OS finalizadas podem ser baixadas no recebimento.' },
          { status: 400 }
        )
      }

      const { error } = await supabase
        .from('ordens_servico')
        .update({
          status_financeiro: status,
          data_pagamento: status === 'RECEBIDO' ? new Date().toISOString() : null,
        })
        .eq('id', id)

      if (error) throw error
      await registrarHistoricoFinanceiro(supabase, {
        osId: id,
        tipo: 'RECEBIMENTO_OS',
        statusAnterior: ordemAtual?.status_financeiro ?? null,
        statusNovo: status,
        valor: valorPreferencial(ordemAtual?.cliente_total, ordemAtual?.total),
        descricao: `${ordemAtual?.numero_os ?? `OS #${id}`} marcada como ${status}.`,
      })
      return NextResponse.json({ ok: true })
    }

    if (tipo === 'TECNICO') {
      const temPagamentoTecnico = await colunaExiste(supabase, 'ordens_servico', 'tecnico_status_pagamento')
      const pagoEm = new Date().toISOString()
      const { data: ordemAtual } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, status_financeiro, tecnico_status_pagamento, tecnico_total, total')
        .eq('id', id)
        .maybeSingle()

      const documentos = await carregarDocumentosTecnicos(supabase)
      const documentoRecebido = documentos.data.some(
        (doc: { os_id?: number | null }) => doc.os_id === id
      )

      if (!documentoRecebido) {
        return NextResponse.json(
          { error: 'Anexe a NF/recibo do tecnico antes de marcar o pagamento.' },
          { status: 400 }
        )
      }

      if (temPagamentoTecnico) {
        const { error } = await supabase
          .from('ordens_servico')
          .update({
            tecnico_status_pagamento: 'RECEBIDO',
            tecnico_pago_em: pagoEm,
            status_financeiro: ordemAtual?.status_financeiro ?? null,
          })
          .eq('id', id)

        if (error) throw error
      }

      const { error: documentoError } = await supabase
        .from('tecnico_documentos')
        .update({ status: 'PAGO', pago_em: pagoEm })
        .eq('os_id', id)

      if (documentoError && String(documentoError.code) !== '42703' && String(documentoError.code) !== '42P01') {
        throw documentoError
      }

      await registrarHistoricoFinanceiro(supabase, {
        osId: id,
        tipo: 'PAGAMENTO_TECNICO',
        statusAnterior: ordemAtual?.tecnico_status_pagamento ?? null,
        statusNovo: 'RECEBIDO',
        valor: valorPreferencial(ordemAtual?.tecnico_total, 0),
        descricao: `${ordemAtual?.numero_os ?? `OS #${id}`} paga ao tecnico.`,
      })

      return NextResponse.json({ ok: true })
    }

    const { data: documento } = await supabase
      .from('tecnico_documentos')
      .select('id, os_id, status, valor, nome_arquivo')
      .eq('id', id)
      .maybeSingle()

    const pagoEm = new Date().toISOString()
    const { error } = await supabase
      .from('tecnico_documentos')
      .update({ status: 'PAGO', pago_em: pagoEm })
      .eq('id', id)

    if (error) throw error

    if (documento?.os_id && await colunaExiste(supabase, 'ordens_servico', 'tecnico_status_pagamento')) {
      const { error: osError } = await supabase
        .from('ordens_servico')
        .update({
          tecnico_status_pagamento: 'RECEBIDO',
          tecnico_pago_em: pagoEm,
        })
        .eq('id', documento.os_id)

      if (osError) throw osError
    }

    await registrarHistoricoFinanceiro(supabase, {
      osId: documento?.os_id ?? null,
      documentoId: id,
      tipo: 'DOCUMENTO_TECNICO',
      statusAnterior: documento?.status ?? null,
      statusNovo: 'PAGO',
      valor: toNumber(documento?.valor),
      descricao: `${documento?.nome_arquivo ?? `Documento #${id}`} marcado como pago.`,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao atualizar financeiro admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao atualizar financeiro.') },
      { status: 500 }
    )
  }
}

async function carregarHistoricoFinanceiro(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from('financeiro_historico')
    .select('id, os_id, documento_id, tipo, status_anterior, status_novo, valor, descricao, responsavel, criado_em')
    .order('criado_em', { ascending: false })
    .limit(12)

  if (error) {
    if (String(error.code) === '42P01' || String(error.code) === 'PGRST205') {
      return { data: [], tabelaPendente: true }
    }
    throw error
  }

  return { data: data ?? [], tabelaPendente: false }
}

async function registrarHistoricoFinanceiro(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  item: {
    osId?: number | null
    documentoId?: number | null
    tipo: string
    statusAnterior?: string | null
    statusNovo?: string | null
    valor: number
    descricao: string
  }
) {
  const { error } = await supabase.from('financeiro_historico').insert({
    os_id: item.osId ?? null,
    documento_id: item.documentoId ?? null,
    tipo: item.tipo,
    status_anterior: item.statusAnterior ?? null,
    status_novo: item.statusNovo ?? null,
    valor: item.valor,
    descricao: item.descricao,
    responsavel: 'Admin',
  })

  if (error && String(error.code) !== '42P01' && String(error.code) !== 'PGRST205') throw error
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0) || 0
}

function valorPreferencial(principal: unknown, fallback: unknown) {
  return principal === null || principal === undefined || principal === '' ? toNumber(fallback as never) : toNumber(principal as never)
}

async function carregarDocumentosTecnicos(supabase: ReturnType<typeof getSupabaseAdmin>) {
  let { data, error } = await supabase
    .from('tecnico_documentos')
    .select('id, os_id, parceiro_id, tipo, valor, nome_arquivo, url, observacao, status, criado_em, pago_em')
    .order('criado_em', { ascending: false })

  if (error && String(error.code) === '42703') {
    const fallback = await supabase
      .from('tecnico_documentos')
      .select('id, parceiro_id, tipo, valor, nome_arquivo, url, observacao, status, criado_em, pago_em')
      .order('criado_em', { ascending: false })

    data = (fallback.data ?? []).map((doc) => ({ ...doc, os_id: null })) as unknown as typeof data
    error = fallback.error
  }

  if (error) {
    if (String(error.code) === '42P01') return { data: [], tabelaPendente: true }
    throw error
  }

  return { data: data ?? [], tabelaPendente: false }
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
