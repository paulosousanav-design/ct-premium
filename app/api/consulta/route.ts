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
        valor_pecas,
        valor_mao_obra,
        desconto,
        total,
        orcamento_status,
        orcamento_resposta_em,
        cliente_id,
        categoria_id,
        marca_id
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

    const pecas = await safeList(
      supabase
        .from('os_pecas')
        .select('id, descricao, quantidade, valor_unitario, total_item, criado_em')
        .eq('os_id', os.id)
        .order('criado_em', { ascending: true })
    )

    return NextResponse.json({
      os: {
        ...os,
        cliente,
        categoria: categoria ?? null,
        marca: marca ?? null,
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
