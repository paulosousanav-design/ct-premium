import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const STATUS_EXIGEM_TECNICO = new Set([
  'EM_ATENDIMENTO', 'AGUARDANDO_REVISAO', 'AGUARDANDO_APROVACAO',
  'AGUARDANDO_PECA', 'PRONTO_AGUARDANDO_ENTREGA', 'FINALIZADA',
])

type PecaInput = {
  origem?: string | null
  peca_id?: number | string | null
  descricao?: string | null
  quantidade?: number | string | null
  valor_custo?: number | string | null
  valor_unitario?: number | string | null
  total_item?: number | string | null
}

type OrdemServico = {
  id: number
  unidade_id?: number | null
  cliente_id: number | null
  categoria_id: number | null
  marca_id: number | null
  parceiro_id?: number | null
  garantidor_id?: number | null
  referencia_garantidor?: string | null
}

type Cliente = {
  id: number
  cep: string | null
  cidade: string | null
  estado: string | null
  latitude?: number | null
  longitude?: number | null
}

type Parceiro = {
  id: number
  created_at: string | null
  responsavel: string | null
  nome_fantasia: string | null
  razao_social: string | null
  whatsapp: string | null
  cep: string | null
  cidade: string | null
  estado: string | null
  latitude: number | null
  longitude: number | null
  raio_atendimento: number | null
  score: number | null
  status: string | null
  especialidades?: string[] | string | null
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

async function tabelaExiste(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tabela: string
) {
  const { error } = await supabase.from(tabela).select('id').limit(0)
  return !error
}

async function baixarEstoquePecas(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  osId: number,
  rows: Record<string, unknown>[],
  unidadeId: number
) {
  const pecasEstoque = rows.filter(
    (row) => String(row.origem ?? '').toUpperCase() === 'ESTOQUE' && row.peca_id
  )

  if (pecasEstoque.length === 0) return

  const quantidadePorPeca = new Map<number, number>()
  for (const row of pecasEstoque) {
    const pecaId = Number(row.peca_id)
    const quantidade = toNumber(row.quantidade)
    quantidadePorPeca.set(pecaId, (quantidadePorPeca.get(pecaId) ?? 0) + quantidade)
  }

  const movimentacoesExistem = await tabelaExiste(supabase, 'pecas_movimentacoes')

  for (const [pecaId, quantidade] of quantidadePorPeca.entries()) {
    if (quantidade <= 0) continue

    let pecaQuery = supabase
      .from('pecas')
      .select('id, estoque')
      .eq('id', pecaId)
    if (await colunaExiste(supabase, 'pecas', 'unidade_id')) {
      pecaQuery = pecaQuery.eq('unidade_id', unidadeId)
    }
    const { data: peca, error: pecaError } = await pecaQuery.maybeSingle()

    if (pecaError) throw pecaError
    if (!peca?.id) continue

    const estoqueAnterior = toNumber(peca.estoque)
    const estoquePosterior = estoqueAnterior - quantidade

    const updateEstoquePayload: Record<string, unknown> = { estoque: estoquePosterior }
    if (await colunaExiste(supabase, 'pecas', 'atualizado_em')) {
      updateEstoquePayload.atualizado_em = new Date().toISOString()
    }

    const { error: updateEstoqueError } = await supabase
      .from('pecas')
      .update(updateEstoquePayload)
      .eq('id', pecaId)

    if (updateEstoqueError) throw updateEstoqueError

    if (movimentacoesExistem) {
      const movimentoPayload: Record<string, unknown> = {
        peca_id: pecaId,
        os_id: osId,
        tipo: 'SAIDA_OS',
        quantidade,
        estoque_anterior: estoqueAnterior,
        estoque_posterior: estoquePosterior,
        observacao: `Baixa automatica ao finalizar OS ${osId}.`,
      }
      if (await colunaExiste(supabase, 'pecas_movimentacoes', 'unidade_id')) movimentoPayload.unidade_id = unidadeId
      const { error: movimentacaoError } = await supabase.from('pecas_movimentacoes').insert(movimentoPayload)

      if (movimentacaoError) throw movimentacaoError
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'os')
    if (!auth.ok) return auth.response

    const osId = Number(request.nextUrl.searchParams.get('osId'))

    if (!osId) {
      return NextResponse.json({ error: 'Informe a OS.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const temUnidade = await colunaExiste(supabase, 'ordens_servico', 'unidade_id')
    const colunasOrcamentoSeparadoExistem = await colunaExiste(supabase, 'ordens_servico', 'tecnico_total')
    const colunaReferenciaGarantidorExiste = await colunaExiste(supabase, 'ordens_servico', 'referencia_garantidor')
    const colunaValorRecebidoClienteExiste = await colunaExiste(supabase, 'ordens_servico', 'valor_recebido_cliente')
    const colunaDataUltimoRecebimentoExiste = await colunaExiste(supabase, 'ordens_servico', 'data_ultimo_recebimento')
    const colunaFormaRecebimentoExiste = await colunaExiste(supabase, 'ordens_servico', 'forma_recebimento')
    const colunaEncerramentoExiste = await colunaExiste(supabase, 'ordens_servico', 'encerramento_motivo')
    const colunaEntregaExiste = await colunaExiste(supabase, 'ordens_servico', 'equipamento_entrega_status')

    const selectBase = `
        id,
        numero_os,
        created_at,
        status,
        prioridade,
        garantia,
        ${colunaReferenciaGarantidorExiste ? 'referencia_garantidor,' : ''}
        bloqueada,
        finalizada_em,
        ${colunaEncerramentoExiste ? `
        encerrada_sem_reparo_em,
        encerramento_motivo,
        encerramento_observacao,
        encerramento_taxa_diagnostico,
        encerrada_sem_reparo_por,` : ''}
        ${colunaEntregaExiste ? `
        equipamento_entrega_status,
        aguardando_retirada_em,
        cliente_avisado_em,
        cliente_aviso_meio,
        equipamento_entregue_em,
        entregue_para_nome,
        entregue_para_documento,
        entrega_observacao,
        entrega_registrada_por,` : ''}
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
        status_financeiro,
        data_pagamento,
        ${colunaDataUltimoRecebimentoExiste ? 'data_ultimo_recebimento,' : ''}
        ${colunaFormaRecebimentoExiste ? 'forma_recebimento,' : ''}
        ${colunaValorRecebidoClienteExiste ? 'valor_recebido_cliente,' : ''}
        ${
          colunasOrcamentoSeparadoExistem
            ? `
        tecnico_valor_pecas,
        tecnico_valor_mao_obra,
        tecnico_desconto,
        tecnico_total,
        cliente_valor_pecas,
        cliente_valor_mao_obra,
        cliente_desconto,
        cliente_total,`
            : ''
        }
        observacao_tecnica,
        cliente_id,
        categoria_id,
        marca_id,
        parceiro_id${temUnidade ? ', unidade_id' : ''}
      `
    const selectAvulso = `,
        garantidor_id,
        tecnico_avulso_nome,
        tecnico_avulso_whatsapp,
        tecnico_avulso_cidade,
        tecnico_avulso_estado,
        tecnico_avulso_observacao
      `

    let { data, error } = await supabase
      .from('ordens_servico')
      .select(`${selectBase}${selectAvulso}`)
      .eq('id', osId)
      .maybeSingle()

    if (error && String(error.code) === '42703') {
      const fallback = await supabase
        .from('ordens_servico')
        .select(selectBase)
        .eq('id', osId)
        .maybeSingle()

      data = fallback.data as unknown as typeof data
      error = fallback.error as unknown as typeof error
    }

    if (error) throw error

    if (!data) {
      return NextResponse.json({ error: 'OS nao encontrada.' }, { status: 404 })
    }

    const ordem = data as unknown as OrdemServico
    if (temUnidade && Number(ordem.unidade_id) !== auth.unidadeId) {
      return NextResponse.json({ error: 'OS nao encontrada nesta unidade.' }, { status: 404 })
    }
    let cliente = null
    let categoria: { id: number; nome: string | null } | null = null
    let marca = null

    if (ordem.cliente_id) {
      const { data: clienteData, error: clienteError } = await supabase
        .from('clientes')
        .select('id, nome, cpf_cnpj, whatsapp, email, cep, logradouro, numero, bairro, cidade, estado, latitude, longitude')
        .eq('id', ordem.cliente_id)
        .maybeSingle()

      if (clienteError) throw clienteError
      cliente = clienteData ?? null
    }

    if (ordem.categoria_id) {
      const { data: categoriaData, error: categoriaError } = await supabase
        .from('categorias')
        .select('id, nome')
        .eq('id', ordem.categoria_id)
        .maybeSingle()

      if (categoriaError) throw categoriaError
      categoria = categoriaData ?? null
    }

    if (ordem.marca_id) {
      const { data: marcaData, error: marcaError } = await supabase
        .from('marcas')
        .select('id, nome, categoria_id')
        .eq('id', ordem.marca_id)
        .maybeSingle()

      if (marcaError) throw marcaError
      marca = marcaData ?? null
    }

    const { data: fotos, error: fotosError } = await supabase
      .from('os_fotos')
      .select('id, nome_arquivo, url, criado_em')
      .eq('os_id', osId)
      .order('criado_em', { ascending: false })

    if (fotosError) throw fotosError

    const { data: historico, error: historicoError } = await supabase
      .from('os_historico')
      .select(`
        id,
        os_id,
        acao,
        status_anterior,
        status_novo,
        prioridade_anterior,
        prioridade_nova,
        descricao,
        responsavel,
        criado_em
      `)
      .eq('os_id', osId)
      .order('criado_em', { ascending: false })

    if (historicoError) throw historicoError

    const osPecasTemEstoque = await colunaExiste(supabase, 'os_pecas', 'peca_id')
    const osPecasTemCusto = await colunaExiste(supabase, 'os_pecas', 'valor_custo')
    const osPecasSelect = [
      'id',
      osPecasTemEstoque ? 'origem' : '',
      osPecasTemEstoque ? 'peca_id' : '',
      'descricao',
      'quantidade',
      osPecasTemCusto ? 'valor_custo' : '',
      'valor_unitario',
      'total_item',
      'criado_em',
    ]
      .filter(Boolean)
      .join(', ')

    const { data: pecas, error: pecasError } = await supabase
      .from('os_pecas')
      .select(osPecasSelect)
      .eq('os_id', osId)
      .order('criado_em', { ascending: true })

    if (pecasError) throw pecasError

    const pecasEstoqueExiste = await tabelaExiste(supabase, 'pecas')
    let estoquePecas: unknown[] = []
    if (pecasEstoqueExiste) {
      let estoqueQuery = supabase
        .from('pecas')
        .select('id, codigo, descricao, categoria, marca, valor_custo, valor_venda, estoque, ativo')
        .eq('ativo', true)
        .order('descricao', { ascending: true })
      if (await colunaExiste(supabase, 'pecas', 'unidade_id')) {
        estoqueQuery = estoqueQuery.eq('unidade_id', auth.unidadeId)
      }
      const { data: estoqueData, error: estoqueError } = await estoqueQuery

      if (estoqueError) throw estoqueError
      estoquePecas = estoqueData ?? []
    }

    const { data: categorias, error: categoriasError } = await supabase
      .from('categorias')
      .select('id, nome')
      .order('nome', { ascending: true })

    if (categoriasError) throw categoriasError

    const { data: marcas, error: marcasError } = await supabase
      .from('marcas')
      .select('id, nome, categoria_id')
      .order('nome', { ascending: true })

    if (marcasError) throw marcasError

    const { data: garantidores, error: garantidoresError } = await supabase
      .from('garantidores')
      .select('id, nome, ativo')
      .order('nome', { ascending: true })

    if (garantidoresError) throw garantidoresError

    const { data: parceirosData, error: parceirosError } = await supabase
      .from('parceiros')
      .select(`
        id,
        created_at,
        responsavel,
        nome_fantasia,
        razao_social,
        whatsapp,
        cep,
        cidade,
        estado,
        latitude,
        longitude,
        raio_atendimento,
        score,
        status,
        especialidades
      `)
      .order('created_at', { ascending: true })

    if (parceirosError) throw parceirosError

    const parceirosAtivos = ((parceirosData ?? []) as Parceiro[]).filter(
      (parceiro) => (parceiro.status ?? 'ATIVO').toUpperCase() === 'ATIVO'
    )

    const tecnicosOrdenados = await sugerirTecnicos(
      cliente as Cliente | null,
      parceirosAtivos,
      categoria?.nome ?? null,
      null
    )
    const tecnicosSugeridos = tecnicosOrdenados.slice(0, 3)

    return NextResponse.json({
      os: {
        ...ordem,
        cliente,
        categoria,
        marca,
      },
      fotos: fotos ?? [],
      historico: historico ?? [],
      pecas: pecas ?? [],
      estoquePecas,
      categorias: categorias ?? [],
      marcas: marcas ?? [],
      garantidores: garantidores ?? [],
      tecnicosSugeridos,
      tecnicosDisponiveis: tecnicosOrdenados,
    })
  } catch (error) {
    console.error('Erro ao carregar atendimento da OS:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar atendimento tecnico.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'os')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const osId = Number(body?.osId)
    const statusFinal = String(body?.status ?? '').trim().toUpperCase()
    const prioridade = String(body?.prioridade ?? 'NORMAL').trim()
    const supabase = getSupabaseAdmin()

    if (body?.acao === 'TECNICO_AVULSO') {
      return salvarTecnicoAvulso(supabase, body, `${auth.nome} (${auth.email})`, auth.unidadeId)
    }

    if (!osId || !statusFinal) {
      return NextResponse.json({ error: 'Dados invalidos para salvar a OS.' }, { status: 400 })
    }
    if (statusFinal === 'ENCERRADA_SEM_REPARO') {
      return NextResponse.json({ error: 'Use a opcao Encerrar sem reparo para registrar motivo e cobranca.' }, { status: 400 })
    }

    const temUnidade = await colunaExiste(supabase, 'ordens_servico', 'unidade_id')
    const osAtualSelect: string = temUnidade
      ? 'id, status, prioridade, bloqueada, valor_recebido_cliente, parceiro_id, tecnico_avulso_nome, unidade_id'
      : 'id, status, prioridade, bloqueada, valor_recebido_cliente, parceiro_id, tecnico_avulso_nome'
    const { data: osAtualData, error: osAtualError } = await supabase
      .from('ordens_servico')
      .select(osAtualSelect)
      .eq('id', osId)
      .maybeSingle()
    const osAtual = osAtualData as unknown as { id: number; status: string | null; prioridade: string | null; bloqueada: boolean | null; valor_recebido_cliente?: number | string | null; parceiro_id?: number | null; tecnico_avulso_nome?: string | null; unidade_id?: number | null } | null

    if (osAtualError) throw osAtualError
    if (!osAtual?.id) {
      return NextResponse.json({ error: 'OS nao encontrada.' }, { status: 404 })
    }
    if (temUnidade && Number(osAtual.unidade_id) !== auth.unidadeId) {
      return NextResponse.json({ error: 'OS nao encontrada nesta unidade.' }, { status: 404 })
    }
    if (
      STATUS_EXIGEM_TECNICO.has(statusFinal) &&
      !osAtual.parceiro_id && !String(osAtual.tecnico_avulso_nome ?? '').trim()
    ) {
      return NextResponse.json(
        { error: 'Selecione um tecnico antes de iniciar o tratamento da OS.' },
        { status: 400 }
      )
    }
    if (osAtual.status === 'ENCERRADA_SEM_REPARO' && toNumber(osAtual.valor_recebido_cliente) > 0) {
      return NextResponse.json({ error: 'Regularize a taxa de diagnostico recebida no Financeiro antes de reabrir esta OS.' }, { status: 400 })
    }

    const pecas = Array.isArray(body?.pecas) ? (body.pecas as PecaInput[]) : []
    const valorPecas = toNumber(body?.valorPecas)
    const valorMaoObra = toNumber(body?.valorMaoObra)
    const desconto = toNumber(body?.desconto)
    const total = toNumber(body?.total)
    const tecnicoValorPecas = toNumber(body?.tecnicoValorPecas)
    const tecnicoValorMaoObra = toNumber(body?.tecnicoValorMaoObra)
    const tecnicoDesconto = toNumber(body?.tecnicoDesconto)
    const tecnicoTotal = Math.max(0, tecnicoValorPecas + tecnicoValorMaoObra - tecnicoDesconto)
    const bloqueada = statusFinal === 'FINALIZADA'

    const pecasResumo = pecas
      .map((p) => {
        const descricao = String(p.descricao ?? '').trim()
        if (!descricao) return ''
        return `${descricao} (${toNumber(p.quantidade)}x R$ ${formatMoney(toNumber(p.valor_unitario))})`
      })
      .filter(Boolean)
      .join(' | ')

    const updatePayload: Record<string, unknown> = {
      status: statusFinal,
      prioridade,
      garantia: body?.garantia === 'SIM',
      categoria_id: body?.categoriaId ? Number(body.categoriaId) : null,
      marca_id: body?.marcaId ? Number(body.marcaId) : null,
      modelo: String(body?.modelo ?? '').trim() || null,
      numero_serie: String(body?.numeroSerie ?? '').trim() || null,
      bloqueada,
      finalizada_em: bloqueada ? new Date().toISOString() : null,
      diagnostico_tecnico: String(body?.diagnosticoTecnico ?? '').trim() || null,
      servico_executado: String(body?.servicoExecutado ?? '').trim() || null,
      pecas_utilizadas: pecasResumo || null,
      valor_pecas: valorPecas,
      valor_mao_obra: valorMaoObra,
      desconto,
      total,
      observacao_tecnica: String(body?.observacaoTecnica ?? '').trim() || null,
    }
    if (statusFinal === 'PRONTO_AGUARDANDO_ENTREGA') {
      updatePayload.orcamento_status = 'APROVADO'
      updatePayload.orcamento_resposta_em = new Date().toISOString()
    }

    const colunaEntregaExiste = await colunaExiste(supabase, 'ordens_servico', 'equipamento_entrega_status')
    if (colunaEntregaExiste && statusFinal === 'FINALIZADA' && osAtual.status !== 'FINALIZADA') {
      updatePayload.equipamento_entrega_status = 'PENDENTE_DEFINICAO'
      updatePayload.aguardando_retirada_em = null
      updatePayload.cliente_avisado_em = null
      updatePayload.cliente_aviso_meio = null
      updatePayload.equipamento_entregue_em = null
      updatePayload.entregue_para_nome = null
      updatePayload.entregue_para_documento = null
      updatePayload.entrega_observacao = null
      updatePayload.entrega_registrada_por = null
    } else if (colunaEntregaExiste && ['FINALIZADA', 'ENCERRADA_SEM_REPARO'].includes(String(osAtual.status)) && statusFinal !== 'FINALIZADA') {
      updatePayload.equipamento_entrega_status = 'NAO_APLICAVEL'
    }

    const colunaEncerramentoExiste = await colunaExiste(supabase, 'ordens_servico', 'encerramento_motivo')
    if (colunaEncerramentoExiste && osAtual.status === 'ENCERRADA_SEM_REPARO') {
      updatePayload.encerramento_motivo = null
      updatePayload.encerramento_observacao = null
      updatePayload.encerramento_taxa_diagnostico = 0
      updatePayload.encerrada_sem_reparo_em = null
      updatePayload.encerrada_sem_reparo_por = null
      updatePayload.status_financeiro = 'PENDENTE'
    }

    const colunasOrcamentoSeparadoExistem = await colunaExiste(supabase, 'ordens_servico', 'cliente_total')
    if (colunasOrcamentoSeparadoExistem) {
      updatePayload.tecnico_valor_pecas = tecnicoValorPecas
      updatePayload.tecnico_valor_mao_obra = tecnicoValorMaoObra
      updatePayload.tecnico_desconto = tecnicoDesconto
      updatePayload.tecnico_total = tecnicoTotal
      updatePayload.cliente_valor_pecas = valorPecas
      updatePayload.cliente_valor_mao_obra = valorMaoObra
      updatePayload.cliente_desconto = desconto
      updatePayload.cliente_total = total
    }

    const colunaGarantidorExiste = await colunaExiste(supabase, 'ordens_servico', 'garantidor_id')
    if (colunaGarantidorExiste) {
      updatePayload.garantidor_id =
        body?.garantia === 'SIM' && body?.garantidorId ? Number(body.garantidorId) : null
    }

    const colunaReferenciaGarantidorExiste = await colunaExiste(supabase, 'ordens_servico', 'referencia_garantidor')
    if (colunaReferenciaGarantidorExiste) {
      updatePayload.referencia_garantidor =
        body?.garantia === 'SIM' ? String(body?.referenciaGarantidor ?? '').trim() || null : null
    }

    const { error: updateError } = await supabase
      .from('ordens_servico')
      .update(updatePayload)
      .eq('id', osId)

    if (updateError) throw updateError

    const { error: deletePecasError } = await supabase.from('os_pecas').delete().eq('os_id', osId)
    if (deletePecasError) throw deletePecasError

    const osPecasTemOrigem = await colunaExiste(supabase, 'os_pecas', 'origem')
    const osPecasTemPecaId = await colunaExiste(supabase, 'os_pecas', 'peca_id')
    const osPecasTemCusto = await colunaExiste(supabase, 'os_pecas', 'valor_custo')
    const rows = pecas
      .map((p) => {
        const row: Record<string, unknown> = {
          os_id: osId,
          descricao: String(p.descricao ?? '').trim(),
          quantidade: toNumber(p.quantidade),
          ...(osPecasTemCusto ? { valor_custo: toNumber(p.valor_custo) } : {}),
          valor_unitario: toNumber(p.valor_unitario),
          total_item: toNumber(p.total_item),
        }

        if (osPecasTemOrigem) {
          const origem = String(p.origem ?? 'AVULSA').toUpperCase()
          row.origem = origem === 'ESTOQUE' ? 'ESTOQUE' : origem === 'SERVICO' ? 'SERVICO' : 'AVULSA'
        }
        if (osPecasTemPecaId) row.peca_id = p.peca_id ? Number(p.peca_id) : null

        return row
      })
      .filter((p) => p.descricao)

    if (rows.length > 0) {
      const { error: insertPecasError } = await supabase.from('os_pecas').insert(rows)
      if (insertPecasError) throw insertPecasError
    }

    if (bloqueada && osAtual.status !== 'FINALIZADA' && osPecasTemPecaId) {
      await baixarEstoquePecas(supabase, osId, rows, auth.unidadeId)
    }

    const resumo = [
      `Status: ${osAtual.status ?? 'NOVA'} -> ${statusFinal}`,
      statusFinal === 'PRONTO_AGUARDANDO_ENTREGA' ? 'Orcamento aprovado automaticamente.' : '',
      `Prioridade: ${osAtual.prioridade ?? 'NORMAL'} -> ${prioridade}`,
      `Garantia: ${body?.garantia === 'SIM' ? 'SIM' : 'NAO'}`,
      body?.garantia === 'SIM' && String(body?.referenciaGarantidor ?? '').trim()
        ? `OS/Sinistro garantidor: ${String(body.referenciaGarantidor).trim()}`
        : '',
      String(body?.numeroSerie ?? '').trim() ? `Serie: ${String(body.numeroSerie).trim()}` : '',
      String(body?.diagnosticoTecnico ?? '').trim() ? `Diagnostico: ${String(body.diagnosticoTecnico).trim()}` : '',
      String(body?.servicoExecutado ?? '').trim() ? `Servico: ${String(body.servicoExecutado).trim()}` : '',
      pecasResumo ? `Pecas: ${pecasResumo}` : '',
      `Mao de obra tecnico: ${formatCurrency(tecnicoValorMaoObra)}`,
      `Total tecnico: ${formatCurrency(tecnicoTotal)}`,
      `Pecas total: ${formatCurrency(valorPecas)}`,
      `Mao de obra: ${formatCurrency(valorMaoObra)}`,
      `Desconto: ${formatCurrency(desconto)}`,
      `Total: ${formatCurrency(total)}`,
      bloqueada ? 'OS finalizada e bloqueada.' : '',
      Number(body?.fotosCount ?? 0) > 0 ? `Fotos adicionadas: ${Number(body.fotosCount)}` : '',
    ]
      .filter(Boolean)
      .join(' | ')

    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: osId,
      acao: statusFinal === 'FINALIZADA' ? 'OS_FINALIZADA' : 'ATENDIMENTO_TECNICO',
      status_anterior: osAtual.status ?? 'NOVA',
      status_novo: statusFinal,
      prioridade_anterior: osAtual.prioridade ?? 'NORMAL',
      prioridade_nova: prioridade,
      descricao: resumo,
      responsavel: `${auth.nome} (${auth.email})`,
    })

    if (historicoError) throw historicoError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao salvar atendimento da OS:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao salvar atendimento tecnico.') },
      { status: 500 }
    )
  }
}

async function salvarTecnicoAvulso(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  body: Record<string, unknown> | null,
  responsavel: string,
  unidadeId: number
) {
  const osId = Number(body?.osId)
  const nome = String(body?.nome ?? '').trim()
  const whatsapp = String(body?.whatsapp ?? '').trim()
  const cidade = String(body?.cidade ?? '').trim()
  const estado = String(body?.estado ?? '').trim().toUpperCase().slice(0, 2)
  const observacao = String(body?.observacao ?? '').trim()

  if (!osId || !nome || !whatsapp) {
    return NextResponse.json(
      { error: 'Informe nome e WhatsApp do tecnico avulso.' },
      { status: 400 }
    )
  }

  const temUnidade = await colunaExiste(supabase, 'ordens_servico', 'unidade_id')
  const osAtualSelect: string = temUnidade ? 'id, status, unidade_id' : 'id, status'
  const { data: osAtualData, error: osAtualError } = await supabase
    .from('ordens_servico')
    .select(osAtualSelect)
    .eq('id', osId)
    .maybeSingle()
  const osAtual = osAtualData as unknown as { id: number; status: string | null; unidade_id?: number | null } | null

  if (osAtualError) throw osAtualError
  if (!osAtual?.id) {
    return NextResponse.json({ error: 'OS nao encontrada.' }, { status: 404 })
  }
  if (temUnidade && Number(osAtual.unidade_id) !== unidadeId) {
    return NextResponse.json({ error: 'OS nao encontrada nesta unidade.' }, { status: 404 })
  }

  const { error: updateError } = await supabase
    .from('ordens_servico')
    .update({
      parceiro_id: null,
      tecnico_avulso_nome: nome,
      tecnico_avulso_whatsapp: whatsapp,
      tecnico_avulso_cidade: cidade || null,
      tecnico_avulso_estado: estado || null,
      tecnico_avulso_observacao: observacao || null,
      status: osAtual.status === 'NOVA' ? 'EM_TRIAGEM' : osAtual.status,
    })
    .eq('id', osId)

  if (updateError) throw updateError

  const { error: historicoError } = await supabase.from('os_historico').insert({
    os_id: osId,
    acao: 'ATRIBUICAO_TECNICO_AVULSO',
    status_anterior: osAtual.status ?? 'NOVA',
    status_novo: osAtual.status === 'NOVA' ? 'EM_TRIAGEM' : osAtual.status,
    descricao: [
      `Tecnico avulso atribuido: ${nome}`,
      `WhatsApp: ${whatsapp}`,
      cidade || estado ? `Local: ${[cidade, estado].filter(Boolean).join(' / ')}` : '',
      observacao ? `Obs.: ${observacao}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
    responsavel,
  })

  if (historicoError) throw historicoError

  return NextResponse.json({ ok: true })
}

function toNumber(value: unknown) {
  return Number(value ?? 0)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

async function sugerirTecnicos(
  cliente: Cliente | null,
  parceiros: Parceiro[],
  categoriaNome: string | null,
  limite: number | null = 3
) {
  const grupoEquipamento = getGrupoEquipamento(categoriaNome)
  const clienteCoords = await resolverCoordenadas(cliente)
  const sugestoes = await Promise.all(
    parceiros.map(async (parceiro) => {
      const parceiroCoords = await resolverCoordenadas(parceiro)
      const distanciaKm =
        calcularDistanciaCidades(cliente, parceiro) ??
        calcularDistanciaKm(
          clienteCoords?.latitude,
          clienteCoords?.longitude,
          parceiroCoords?.latitude,
          parceiroCoords?.longitude
        )

      const mesmaCidade =
        normalizar(cliente?.cidade) &&
        normalizar(cliente?.cidade) === normalizar(parceiro.cidade)

      const mesmoEstado =
        normalizar(cliente?.estado) &&
        normalizar(cliente?.estado) === normalizar(parceiro.estado)

      const ranking =
        (tecnicoAtendeGrupo(parceiro, grupoEquipamento) ? 0 : 500) +
        (distanciaKm !== null ? 0 : mesmaCidade ? 1000 : mesmoEstado ? 2000 : 3000) +
        (distanciaKm ?? 0) -
        Number(parceiro.score ?? 0)
      const atendeEspecialidade = tecnicoAtendeGrupo(parceiro, grupoEquipamento)

      return {
        id: parceiro.id,
        nome: parceiro.responsavel ?? parceiro.nome_fantasia ?? parceiro.razao_social ?? `Tecnico #${parceiro.id}`,
        whatsapp: parceiro.whatsapp,
        cidade: parceiro.cidade,
        estado: parceiro.estado,
        distancia_km: distanciaKm,
        criterio: distanciaKm !== null ? 'distancia' : mesmaCidade ? 'mesma cidade' : mesmoEstado ? 'mesmo estado' : 'cadastro ativo',
        grupo_equipamento: grupoEquipamento,
        atende_especialidade: atendeEspecialidade,
        ranking,
        cadastrado_em: parceiro.created_at,
      }
    })
  )

  const ordenados = sugestoes
    .sort((a, b) => {
      if (a.ranking !== b.ranking) return a.ranking - b.ranking
      return String(a.cadastrado_em ?? '').localeCompare(String(b.cadastrado_em ?? ''))
    })

  return limite === null ? ordenados : ordenados.slice(0, limite)
}

type EntidadeComCoordenadas = {
  cep?: string | null
  cidade?: string | null
  estado?: string | null
  latitude?: number | null
  longitude?: number | null
}

const cepCoordsCache = new Map<string, { latitude: number; longitude: number } | null>()
const cidadeCoordsCache = new Map<string, { latitude: number; longitude: number } | null>()

async function resolverCoordenadas(entidade?: EntidadeComCoordenadas | null) {
  if (
    typeof entidade?.latitude === 'number' &&
    typeof entidade.longitude === 'number'
  ) {
    return { latitude: entidade.latitude, longitude: entidade.longitude }
  }

  const cep = String(entidade?.cep ?? '').replace(/\D/g, '')
  if (cep.length === 8) {
    if (cepCoordsCache.has(cep)) return cepCoordsCache.get(cep) ?? null

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
        next: { revalidate: 60 * 60 * 24 * 30 },
      })

      if (!response.ok) {
        cepCoordsCache.set(cep, null)
      } else {
        const data = await response.json()
        const latitude = Number(data?.location?.coordinates?.latitude)
        const longitude = Number(data?.location?.coordinates?.longitude)

        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          const coords = { latitude, longitude }
          cepCoordsCache.set(cep, coords)
          return coords
        }

        cepCoordsCache.set(cep, null)
      }
    } catch {
      cepCoordsCache.set(cep, null)
    }
  }

  return resolverCoordenadasCidade(entidade)
}

async function resolverCoordenadasCidade(entidade?: EntidadeComCoordenadas | null) {
  const cidade = String(entidade?.cidade ?? '').trim()
  const estado = String(entidade?.estado ?? '').trim().toUpperCase()
  if (!cidade || !estado) return null

  const chave = `${normalizar(cidade)}-${estado}`
  const conhecida = cidadesConhecidas[chave]
  if (conhecida) return conhecida

  if (cidadeCoordsCache.has(chave)) return cidadeCoordsCache.get(chave) ?? null

  try {
    const params = new URLSearchParams({
      q: `${cidade}, ${estado}, Brasil`,
      format: 'json',
      limit: '1',
    })
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        'User-Agent': 'ct-premium/1.0',
      },
      next: { revalidate: 60 * 60 * 24 * 30 },
    })

    if (!response.ok) {
      cidadeCoordsCache.set(chave, null)
      return null
    }

    const data = await response.json()
    const latitude = Number(data?.[0]?.lat)
    const longitude = Number(data?.[0]?.lon)

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      cidadeCoordsCache.set(chave, null)
      return null
    }

    const coords = { latitude, longitude }
    cidadeCoordsCache.set(chave, coords)
    return coords
  } catch {
    cidadeCoordsCache.set(chave, null)
    return null
  }
}

const cidadesConhecidas: Record<string, { latitude: number; longitude: number }> = {
  'navirai-MS': { latitude: -23.065, longitude: -54.1906 },
  'dourados-MS': { latitude: -22.2231, longitude: -54.812 },
  'caarapo-MS': { latitude: -22.6368, longitude: -54.8209 },
  'ponta pora-MS': { latitude: -22.5361, longitude: -55.7253 },
  'campo grande-MS': { latitude: -20.4697, longitude: -54.6201 },
  'ivinhema-MS': { latitude: -22.3042, longitude: -53.8184 },
  'nova andradina-MS': { latitude: -22.238, longitude: -53.3437 },
  'mundo novo-MS': { latitude: -23.9355, longitude: -54.281 },
  'eldorado-MS': { latitude: -23.7868, longitude: -54.2838 },
  'amambai-MS': { latitude: -23.1047, longitude: -55.2253 },
  'anaurilandia-MS': { latitude: -22.1852, longitude: -52.7191 },
  'antonio joao-MS': { latitude: -22.1927, longitude: -55.9517 },
  'aparecida do taboado-MS': { latitude: -20.0873, longitude: -51.0961 },
  'aquidauana-MS': { latitude: -20.4711, longitude: -55.7872 },
  'aral moreira-MS': { latitude: -22.9385, longitude: -55.6334 },
  'bandeirantes-MS': { latitude: -19.9275, longitude: -54.3585 },
  'bataguassu-MS': { latitude: -21.7159, longitude: -52.4221 },
  'bataypora-MS': { latitude: -22.2953, longitude: -53.2711 },
  'bela vista-MS': { latitude: -22.1082, longitude: -56.5219 },
  'bodoquena-MS': { latitude: -20.5373, longitude: -56.7127 },
  'bonito-MS': { latitude: -21.1261, longitude: -56.4836 },
  'brasilandia-MS': { latitude: -21.2544, longitude: -52.0365 },
  'cassilandia-MS': { latitude: -19.1133, longitude: -51.7341 },
  'chapadao do sul-MS': { latitude: -18.7972, longitude: -52.6228 },
  'coronel sapucaia-MS': { latitude: -23.2724, longitude: -55.5278 },
  'corumba-MS': { latitude: -19.0092, longitude: -57.6533 },
  'costa rica-MS': { latitude: -18.5432, longitude: -53.1287 },
  'coxim-MS': { latitude: -18.5069, longitude: -54.7511 },
  'deodapolis-MS': { latitude: -22.2763, longitude: -54.1682 },
  'dois irmaos do buriti-MS': { latitude: -20.6847, longitude: -55.2919 },
  'fatima do sul-MS': { latitude: -22.3789, longitude: -54.5131 },
  'figueirao-MS': { latitude: -18.6782, longitude: -53.638 },
  'gloria de dourados-MS': { latitude: -22.4136, longitude: -54.2335 },
  'guia lopes da laguna-MS': { latitude: -21.4576, longitude: -56.1111 },
  'iguatemi-MS': { latitude: -23.6806, longitude: -54.5619 },
  'inocencia-MS': { latitude: -19.7277, longitude: -51.9281 },
  'itapora-MS': { latitude: -22.0804, longitude: -54.7939 },
  'itaquirai-MS': { latitude: -23.4779, longitude: -54.187 },
  'jaraguari-MS': { latitude: -20.1386, longitude: -54.3996 },
  'jardim-MS': { latitude: -21.4805, longitude: -56.1381 },
  'jatei-MS': { latitude: -22.4806, longitude: -54.3079 },
  'juti-MS': { latitude: -22.8596, longitude: -54.6068 },
  'ladario-MS': { latitude: -19.0089, longitude: -57.6018 },
  'laguna carapa-MS': { latitude: -22.5485, longitude: -55.1503 },
  'maracaju-MS': { latitude: -21.6146, longitude: -55.168 },
  'miranda-MS': { latitude: -20.2406, longitude: -56.378 },
  'nhecolandia-MS': { latitude: -19.158, longitude: -56.739 },
  'nioaque-MS': { latitude: -21.1351, longitude: -55.8293 },
  'nova alvorada do sul-MS': { latitude: -21.4657, longitude: -54.3825 },
  'novo horizonte do sul-MS': { latitude: -22.6693, longitude: -53.8601 },
  'paranaiba-MS': { latitude: -19.6773, longitude: -51.1908 },
  'paranhos-MS': { latitude: -23.8928, longitude: -55.429 },
  'pedro gomes-MS': { latitude: -18.1007, longitude: -54.5519 },
  'porto murtinho-MS': { latitude: -21.6981, longitude: -57.8825 },
  'ribas do rio pardo-MS': { latitude: -20.4431, longitude: -53.7592 },
  'rio brilhante-MS': { latitude: -21.8019, longitude: -54.5464 },
  'rio negro-MS': { latitude: -19.447, longitude: -54.9859 },
  'rio verde de mato grosso-MS': { latitude: -18.9181, longitude: -54.8442 },
  'rochedo-MS': { latitude: -19.9565, longitude: -54.8848 },
  'santa rita do pardo-MS': { latitude: -21.3016, longitude: -52.8333 },
  'sao gabriel do oeste-MS': { latitude: -19.3946, longitude: -54.563 },
  'selviria-MS': { latitude: -20.3637, longitude: -51.4192 },
  'sete quedas-MS': { latitude: -23.9705, longitude: -55.0399 },
  'sidrolandia-MS': { latitude: -20.9302, longitude: -54.9617 },
  'sonora-MS': { latitude: -17.5698, longitude: -54.7551 },
  'tacuru-MS': { latitude: -23.636, longitude: -55.0141 },
  'taquarussu-MS': { latitude: -22.4898, longitude: -53.3519 },
  'terenos-MS': { latitude: -20.4421, longitude: -54.8647 },
  'tres lagoas-MS': { latitude: -20.7849, longitude: -51.7007 },
  'vicentina-MS': { latitude: -22.4098, longitude: -54.4415 },
}

function calcularDistanciaCidades(cliente: Cliente | null, parceiro: Parceiro) {
  const clienteCoords = resolverCidadeConhecida(cliente)
  const parceiroCoords = resolverCidadeConhecida(parceiro)

  return calcularDistanciaKm(
    clienteCoords?.latitude,
    clienteCoords?.longitude,
    parceiroCoords?.latitude,
    parceiroCoords?.longitude
  )
}

function resolverCidadeConhecida(entidade?: EntidadeComCoordenadas | null) {
  const cidade = String(entidade?.cidade ?? '').trim()
  const estado = String(entidade?.estado ?? '').trim().toUpperCase()
  if (!cidade || !estado) return null

  return cidadesConhecidas[`${normalizar(cidade)}-${estado}`] ?? null
}

function getGrupoEquipamento(categoriaNome?: string | null) {
  const categoria = normalizar(categoriaNome)

  if (['televisor', 'tv', 'som', 'audio', 'video', 'home theater'].some((item) => categoria.includes(item))) {
    return 'LINHA_MARROM'
  }

  if (
    [
      'lavadora',
      'lava e seca',
      'refrigerador',
      'geladeira',
      'freezer',
      'ar-condicionado',
      'ar condicionado',
      'micro-ondas',
      'microondas',
      'cooktop',
      'forno',
      'adega',
    ].some((item) => categoria.includes(normalizar(item)))
  ) {
    return 'LINHA_BRANCA'
  }

  if (['informatica', 'computador', 'notebook', 'desktop', 'impressora', 'rede'].some((item) => categoria.includes(item))) {
    return 'INFORMATICA'
  }

  return 'GERAIS'
}

function tecnicoAtendeGrupo(parceiro: Parceiro, grupo: string) {
  const especialidades = normalizarEspecialidades(parceiro.especialidades)
  if (especialidades.length === 0) return true
  if (especialidades.some((item) => item.includes('outros') || item.includes('gerais'))) return true

  const aliases = especialidadesPorGrupo[grupo] ?? []
  return especialidades.some((especialidade) =>
    aliases.some((alias) => especialidade.includes(alias) || alias.includes(especialidade))
  )
}

function normalizarEspecialidades(valor?: string[] | string | null) {
  if (Array.isArray(valor)) return valor.map(normalizar).filter(Boolean)
  if (!valor) return []
  return String(valor)
    .split(/[;,|]/)
    .map(normalizar)
    .filter(Boolean)
}

const especialidadesPorGrupo: Record<string, string[]> = {
  LINHA_MARROM: ['linha marrom', 'televisor', 'tv', 'som', 'audio', 'video', 'home theater'],
  LINHA_BRANCA: [
    'linha branca',
    'lavadora',
    'lava e seca',
    'refrigerador',
    'geladeira',
    'freezer',
    'ar condicionado',
    'ar-condicionado',
    'micro ondas',
    'microondas',
    'cooktop',
    'forno',
    'adega',
  ].map(normalizar),
  INFORMATICA: ['informatica', 'computador', 'notebook', 'desktop', 'impressora', 'rede'],
  GERAIS: ['gerais', 'outros'],
}

function calcularDistanciaKm(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
) {
  if (
    typeof lat1 !== 'number' ||
    typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lon2 !== 'number'
  ) {
    return null
  }

  const raioTerraKm = 6371
  const dLat = grausParaRad(lat2 - lat1)
  const dLon = grausParaRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(grausParaRad(lat1)) *
      Math.cos(grausParaRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  return Math.round(raioTerraKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
}

function grausParaRad(valor: number) {
  return (valor * Math.PI) / 180
}

function normalizar(valor?: string | null) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
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
