import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { limitarRotaPublica } from '@/lib/rate-limit'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

async function safeList<T>(
  promise: PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const { data, error } = await promise
  if (error) return []
  return data ?? []
}

export async function POST(request: NextRequest) {
  try {
    const bloqueio = await limitarRotaPublica(request, 'consulta-os', 20, 300)
    if (bloqueio) return bloqueio
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Configuração do Supabase ausente no servidor.' },
        { status: 500 }
      )
    }

    const body = await request.json().catch(() => null)
    const numeroOs = String(body?.numeroOs ?? '').trim().toUpperCase()
    const whatsapp = normalizeDigits(String(body?.whatsapp ?? ''))

    if (!numeroOs || whatsapp.length < 8) {
      return NextResponse.json(
        { error: 'Informe o número da OS e o WhatsApp.' },
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
      .select(`
        id,
        numero_os,
        created_at,
        status,
        modelo,
        numero_serie,
        defeito,
        garantia,
        garantia_asc,
        origem_os,
        referencia_garantidor,
        diagnostico_tecnico,
        servico_executado,
        pecas_utilizadas,
        data_compra,
        numero_nf,
        local_compra,
        valor_pecas,
        valor_mao_obra,
        desconto,
        total,
        orcamento_status,
        orcamento_resposta_em,
        cliente_id,
        categoria_id,
        marca_id,
        garantidores:garantidor_id ( nome )
      `)
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
      .select(`
        id,
        nome,
        cpf_cnpj,
        whatsapp,
        email,
        cep,
        logradouro,
        numero,
        bairro,
        cidade,
        estado
      `)
      .eq('id', os.cliente_id)
      .maybeSingle()

    if (clienteError || !cliente || normalizeDigits(cliente.whatsapp ?? '') !== whatsapp) {
      return NextResponse.json(
        { error: 'Não foi possível localizar o chamado.' },
        { status: 404 }
      )
    }

    const { data: categoria } = await supabase
      .from('categorias')
      .select('id, nome')
      .eq('id', os.categoria_id ?? 0)
      .maybeSingle()

    const { data: marca } = await supabase
      .from('marcas')
      .select('id, nome')
      .eq('id', os.marca_id ?? 0)
      .maybeSingle()

    const semValores = osSemValores(os)
    const pecas = semValores
      ? []
      : await safeList(
          supabase
            .from('os_pecas')
            .select('id, descricao, quantidade, valor_unitario, total_item, criado_em')
            .eq('os_id', os.id)
            .order('criado_em', { ascending: true })
        )
    const garantidor = Array.isArray(os.garantidores) ? os.garantidores[0] : os.garantidores

    return NextResponse.json({
      os: {
        ...osPublica(os, semValores),
        sem_valores: semValores,
        cliente,
        categoria: categoria ?? null,
        marca: marca ?? null,
        garantidor: semValores && garantidor?.nome ? { nome: garantidor.nome } : null,
      },
      pecas,
    })
  } catch (error) {
    console.error('Erro na consulta da OS:', error)
    return NextResponse.json(
      { error: 'Erro ao consultar a OS.' },
      { status: 500 }
    )
  }
}

function osSemValores(os: {
  garantia?: boolean | null
  garantia_asc?: boolean | null
  origem_os?: string | null
}) {
  if (os.garantia === true || os.garantia_asc === true) return true
  const origem = String(os.origem_os ?? '').toUpperCase()
  return origem === 'GARANTIA_SEGURADORA' || origem === 'GARANTIA_ASC'
}

function osPublica(os: Record<string, unknown>, semValores: boolean) {
  const {
    valor_pecas: _valorPecas,
    valor_mao_obra: _valorMaoObra,
    desconto: _desconto,
    total: _total,
    orcamento_status: _orcamentoStatus,
    orcamento_resposta_em: _orcamentoRespostaEm,
    cliente_id: _clienteId,
    categoria_id: _categoriaId,
    marca_id: _marcaId,
    garantidores: _garantidores,
    garantia: _garantia,
    garantia_asc: _garantiaAsc,
    origem_os: _origemOs,
    referencia_garantidor: _referenciaGarantidor,
    diagnostico_tecnico: _diagnosticoTecnico,
    servico_executado: _servicoExecutado,
    pecas_utilizadas: _pecasUtilizadas,
    data_compra: _dataCompra,
    numero_nf: _numeroNf,
    local_compra: _localCompra,
    ...publico
  } = os

  if (!semValores) {
    return {
      ...publico,
      valor_pecas: os.valor_pecas ?? null,
      valor_mao_obra: os.valor_mao_obra ?? null,
      desconto: os.desconto ?? null,
      total: os.total ?? null,
      orcamento_status: os.orcamento_status ?? null,
      orcamento_resposta_em: os.orcamento_resposta_em ?? null,
    }
  }

  return {
    ...publico,
    referencia_garantidor: os.referencia_garantidor ?? null,
    diagnostico_tecnico: os.diagnostico_tecnico ?? null,
    servico_executado: os.servico_executado ?? null,
    pecas_utilizadas: removerValoresDoTexto(os.pecas_utilizadas),
    data_compra: os.data_compra ?? null,
    numero_nf: os.numero_nf ?? null,
    local_compra: os.local_compra ?? null,
  }
}

function removerValoresDoTexto(value: unknown) {
  return String(value ?? '')
    .replace(/\(\s*(\d+(?:[.,]\d+)?)\s*x\s*R\$\s*[\d.]+(?:,\d{1,2})?\s*\)/gi, '($1x)')
    .replace(/\s*(?:[-–—]\s*)?R\$\s*[\d.]+(?:,\d{1,2})?/gi, '')
    .replace(/\(\s*(\d+(?:[.,]\d+)?)\s*x\s*\)/gi, '($1x)')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
