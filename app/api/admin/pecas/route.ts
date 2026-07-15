import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type MovimentoPeca = {
  id: number
  peca_id?: number | null
  os_id?: number | null
  tipo?: string | null
  quantidade?: number | string | null
  estoque_anterior?: number | string | null
  estoque_posterior?: number | string | null
  observacao?: string | null
  criado_em?: string | null
  pecas?: { descricao?: string | null; codigo?: string | null } | { descricao?: string | null; codigo?: string | null }[] | null
  ordens_servico?: { numero_os?: string | null } | { numero_os?: string | null }[] | null
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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'pecas')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await pecasExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json({ data: [], tabelaPendente: true })
    }

    let pecasQuery = supabase
      .from('pecas')
      .select('*')
      .order('descricao', { ascending: true })
    const temUnidade = await colunaExiste(supabase, 'pecas', 'unidade_id')
    if (temUnidade) pecasQuery = pecasQuery.eq('unidade_id', auth.unidadeId)
    const { data, error } = await pecasQuery

    if (error) throw error

    const movimentacoes = await carregarMovimentacoes(supabase, temUnidade ? auth.unidadeId : null)

    return NextResponse.json({
      data: data ?? [],
      movimentacoes: movimentacoes.data,
      movimentacoesPendente: movimentacoes.tabelaPendente,
      tabelaPendente: false,
    })
  } catch (error) {
    console.error('Erro ao listar pecas:', error)
    return NextResponse.json({ error: formatarErro(error, 'Erro ao listar pecas.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'pecas')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const descricao = texto(body?.descricao)

    if (!descricao) {
      return NextResponse.json({ error: 'Informe a descricao da peca.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await pecasExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json(
        { error: "Crie a tabela 'pecas' no Supabase usando o SQL atualizado." },
        { status: 400 }
      )
    }

    const payload: Record<string, unknown> = {
      codigo: texto(body?.codigo) || null,
      descricao,
      categoria: texto(body?.categoria) || null,
      marca: texto(body?.marca) || null,
      valor_custo: numero(body?.valor_custo),
      valor_venda: numero(body?.valor_venda),
      estoque: numero(body?.estoque),
      estoque_minimo: numero(body?.estoque_minimo),
      localizacao: texto(body?.localizacao) || null,
      ativo: body?.ativo !== false,
    }
    if (await colunaExiste(supabase, 'pecas', 'unidade_id')) payload.unidade_id = auth.unidadeId

    const { data, error } = await supabase.from('pecas').insert(payload).select('*').single()
    if (error) throw error

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao salvar peca:', error)
    return NextResponse.json({ error: formatarErro(error, 'Erro ao salvar peca.') }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'pecas')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const tipo = texto(body?.tipo).toUpperCase()
    const id = Number(body?.id)
    const descricao = texto(body?.descricao)
    const supabase = getSupabaseAdmin()

    if (tipo === 'MOVIMENTACAO') {
      const resultado = await movimentarEstoque(supabase, body, auth.unidadeId)
      return NextResponse.json({ ok: true, data: resultado })
    }

    if (!id || !descricao) {
      return NextResponse.json({ error: 'Informe a peca e a descricao para atualizar.' }, { status: 400 })
    }

    const tabelaExiste = await pecasExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json(
        { error: "Crie a tabela 'pecas' no Supabase usando o SQL atualizado." },
        { status: 400 }
      )
    }

    const payload: Record<string, unknown> = {
      codigo: texto(body?.codigo) || null,
      descricao,
      categoria: texto(body?.categoria) || null,
      marca: texto(body?.marca) || null,
      valor_custo: numero(body?.valor_custo),
      valor_venda: numero(body?.valor_venda),
      estoque: numero(body?.estoque),
      estoque_minimo: numero(body?.estoque_minimo),
      localizacao: texto(body?.localizacao) || null,
      ativo: body?.ativo !== false,
    }

    let atualizarQuery = supabase
      .from('pecas')
      .update(payload)
      .eq('id', id)
    if (await colunaExiste(supabase, 'pecas', 'unidade_id')) {
      atualizarQuery = atualizarQuery.eq('unidade_id', auth.unidadeId)
    }
    const { data, error } = await atualizarQuery.select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao atualizar peca:', error)
    return NextResponse.json({ error: formatarErro(error, 'Erro ao atualizar peca.') }, { status: 500 })
  }
}

async function pecasExiste(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { error } = await supabase.from('pecas').select('id').limit(0)
  return !error
}

async function carregarMovimentacoes(supabase: ReturnType<typeof getSupabaseAdmin>, unidadeId: number | null) {
  const existe = await tabelaExiste(supabase, 'pecas_movimentacoes')
  if (!existe) return { data: [] as MovimentoPeca[], tabelaPendente: true }

  let query = supabase
    .from('pecas_movimentacoes')
    .select('id, peca_id, os_id, tipo, quantidade, estoque_anterior, estoque_posterior, observacao, criado_em, pecas:peca_id ( descricao, codigo ), ordens_servico:os_id ( numero_os )')
    .order('criado_em', { ascending: false })
    .limit(30)
  if (unidadeId && await colunaExiste(supabase, 'pecas_movimentacoes', 'unidade_id')) {
    query = query.eq('unidade_id', unidadeId)
  }
  const { data, error } = await query

  if (error) {
    if (String(error.code) === '42P01' || String(error.code) === 'PGRST205') {
      return { data: [] as MovimentoPeca[], tabelaPendente: true }
    }
    throw error
  }

  return { data: (data ?? []) as unknown as MovimentoPeca[], tabelaPendente: false }
}

async function movimentarEstoque(supabase: ReturnType<typeof getSupabaseAdmin>, body: Record<string, unknown> | null, unidadeId: number) {
  const pecaId = Number(body?.pecaId ?? body?.peca_id)
  const tipo = texto(body?.movimentoTipo ?? body?.movimento_tipo).toUpperCase()
  const quantidade = numero(body?.quantidade)
  const observacao = texto(body?.observacao) || null

  if (!pecaId || !['ENTRADA', 'SAIDA', 'AJUSTE'].includes(tipo) || quantidade < 0) {
    throw new Error('Informe peca, tipo e quantidade valida para movimentar o estoque.')
  }

  let pecaQuery = supabase
    .from('pecas')
    .select('id, estoque')
    .eq('id', pecaId)
  const temUnidade = await colunaExiste(supabase, 'pecas', 'unidade_id')
  if (temUnidade) pecaQuery = pecaQuery.eq('unidade_id', unidadeId)
  const { data: peca, error: pecaError } = await pecaQuery.maybeSingle()

  if (pecaError) throw pecaError
  if (!peca?.id) throw new Error('Peca nao encontrada.')

  const estoqueAnterior = numero(peca.estoque)
  const estoquePosterior =
    tipo === 'ENTRADA'
      ? estoqueAnterior + quantidade
      : tipo === 'SAIDA'
        ? estoqueAnterior - quantidade
        : quantidade

  if (estoquePosterior < 0) {
    throw new Error('Estoque nao pode ficar negativo.')
  }

  const { error: updateError } = await supabase
    .from('pecas')
    .update({ estoque: estoquePosterior })
    .eq('id', pecaId)

  if (updateError) throw updateError

  const movimentacoesExistem = await tabelaExiste(supabase, 'pecas_movimentacoes')
  if (movimentacoesExistem) {
    const movimentoPayload: Record<string, unknown> = {
      peca_id: pecaId,
      tipo: tipo === 'AJUSTE' ? 'AJUSTE_MANUAL' : `${tipo}_MANUAL`,
      quantidade: tipo === 'AJUSTE' ? Math.abs(estoquePosterior - estoqueAnterior) : quantidade,
      estoque_anterior: estoqueAnterior,
      estoque_posterior: estoquePosterior,
      observacao,
    }
    if (await colunaExiste(supabase, 'pecas_movimentacoes', 'unidade_id')) movimentoPayload.unidade_id = unidadeId
    const { error: movimentoError } = await supabase.from('pecas_movimentacoes').insert(movimentoPayload)

    if (movimentoError) throw movimentoError
  }

  return { pecaId, estoqueAnterior, estoquePosterior }
}

async function tabelaExiste(supabase: ReturnType<typeof getSupabaseAdmin>, tabela: string) {
  const { error } = await supabase.from(tabela).select('id').limit(0)
  return !error
}

async function colunaExiste(supabase: ReturnType<typeof getSupabaseAdmin>, tabela: string, coluna: string) {
  const { error } = await supabase.from(tabela).select(coluna).limit(0)
  return !error
}

function texto(value: unknown) {
  return String(value ?? '').trim()
}

function numero(value: unknown) {
  const parsed = Number(String(value ?? '0').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
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
