import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

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
    const auth = await requireAdminUnidade(request, 'os')
    if (!auth.ok) return auth.response

    const termo = String(request.nextUrl.searchParams.get('q') ?? '').trim()
    if (termo.length < 3) return NextResponse.json({ data: [] })

    const supabase = getSupabaseAdmin()
    const termoSeguro = termo.replace(/[%_,]/g, '')
    const digits = apenasNumeros(termoSeguro)
    const filtros = [
      `nome.ilike.%${termoSeguro}%`,
      `cpf_cnpj.ilike.%${termoSeguro}%`,
      `whatsapp.ilike.%${termoSeguro}%`,
    ]

    if (digits.length >= 3) {
      filtros.push(`cpf_cnpj.ilike.%${digits}%`, `whatsapp.ilike.%${digits}%`)
    }

    const { data: clientes, error } = await supabase
      .from('clientes')
      .select('id, nome, cpf_cnpj, whatsapp, email, cep, logradouro, numero, bairro, cidade, estado')
      .or(filtros.join(','))
      .order('nome', { ascending: true })
      .limit(8)

    if (error) throw error

    const ids = (clientes ?? []).map((cliente) => cliente.id).filter(Boolean)
    const resumoOs = new Map<number, { total: number; ultima_os: string | null; ultimo_atendimento: string | null }>()

    if (ids.length > 0) {
      let ordensQuery = supabase
        .from('ordens_servico')
        .select('cliente_id, numero_os, created_at')
        .in('cliente_id', ids)
        .order('created_at', { ascending: false })
      if (await colunaExiste(supabase, 'ordens_servico', 'unidade_id')) {
        ordensQuery = ordensQuery.eq('unidade_id', auth.unidadeId)
      }
      const { data: ordens, error: ordensError } = await ordensQuery

      if (ordensError) throw ordensError

      ;(ordens ?? []).forEach((ordem) => {
        const clienteId = Number(ordem.cliente_id)
        const atual = resumoOs.get(clienteId) ?? { total: 0, ultima_os: null, ultimo_atendimento: null }
        atual.total += 1
        if (!atual.ultima_os) {
          atual.ultima_os = ordem.numero_os ?? null
          atual.ultimo_atendimento = ordem.created_at ?? null
        }
        resumoOs.set(clienteId, atual)
      })
    }

    return NextResponse.json({
      data: (clientes ?? []).map((cliente) => ({
        ...cliente,
        total_os: resumoOs.get(cliente.id)?.total ?? 0,
        ultima_os: resumoOs.get(cliente.id)?.ultima_os ?? null,
        ultimo_atendimento: resumoOs.get(cliente.id)?.ultimo_atendimento ?? null,
      })),
    })
  } catch (error) {
    console.error('Erro ao buscar clientes para OS:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao buscar clientes.') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'os')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)

    const nomeCliente = String(body?.nomeCliente ?? '').trim()
    const cpfCnpj = String(body?.cpfCnpj ?? '').trim()
    const whatsapp = String(body?.whatsapp ?? '').trim()
    const categoriaId = Number(body?.categoriaId)
    const marcaId = Number(body?.marcaId)
    const modelo = String(body?.modelo ?? '').trim()
    const defeito = String(body?.defeito ?? '').trim()
    const garantia = body?.garantia === 'SIM'
    const clienteIdInformado = Number(body?.clienteId)

    if (!nomeCliente || !cpfCnpj || !whatsapp || !categoriaId || !marcaId || !modelo || !defeito) {
      return NextResponse.json(
        { error: 'Preencha os campos obrigatorios da OS.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const email = String(body?.email ?? '').trim()
    const clientePayload = {
      nome: nomeCliente,
      cpf_cnpj: cpfCnpj,
      whatsapp,
      email: email || null,
      cep: String(body?.cep ?? '').trim() || null,
      logradouro: String(body?.rua ?? '').trim() || null,
      numero: String(body?.numero ?? '').trim() || null,
      bairro: String(body?.bairro ?? '').trim() || null,
      cidade: String(body?.cidade ?? '').trim() || null,
      estado: String(body?.estado ?? '').trim() || null,
    }

    let clienteId: number | null = Number.isFinite(clienteIdInformado) && clienteIdInformado > 0 ? clienteIdInformado : null

    if (clienteId) {
      const { data: clienteExistente, error: clienteExistenteError } = await supabase
        .from('clientes')
        .select('id')
        .eq('id', clienteId)
        .maybeSingle()

      if (clienteExistenteError) throw clienteExistenteError
      if (!clienteExistente?.id) {
        return NextResponse.json({ error: 'Cliente selecionado nao foi encontrado.' }, { status: 404 })
      }
    }

    if (!clienteId) {
      const { data: clientePorDocumento, error: clientePorDocumentoError } = await supabase
        .from('clientes')
        .select('id')
        .eq('cpf_cnpj', cpfCnpj)
        .maybeSingle()

      if (clientePorDocumentoError) throw clientePorDocumentoError
      clienteId = clientePorDocumento?.id ?? null
    }

    if (!clienteId) {
      const { data: clientePorWhatsapp, error: clientePorWhatsappError } = await supabase
        .from('clientes')
        .select('id')
        .eq('whatsapp', whatsapp)
        .maybeSingle()

      if (clientePorWhatsappError) throw clientePorWhatsappError
      clienteId = clientePorWhatsapp?.id ?? null
    }

    if (clienteId) {
      const { error: atualizarClienteError } = await supabase
        .from('clientes')
        .update(clientePayload)
        .eq('id', clienteId)

      if (atualizarClienteError) throw atualizarClienteError
    } else {
      const { data: novoCliente, error: novoClienteError } = await supabase
        .from('clientes')
        .insert(clientePayload)
        .select('id')
        .single()

      if (novoClienteError) throw novoClienteError
      clienteId = novoCliente.id
    }

    const numeroOS = gerarNumeroOS()
    const origemOs = garantia ? 'GARANTIA_SEGURADORA' : 'ABERTURA_INTERNA'
    const osPayload: Record<string, unknown> = {
      numero_os: numeroOS,
      cliente_id: Number(clienteId),
      categoria_id: categoriaId,
      marca_id: marcaId,
      modelo,
      numero_serie: String(body?.numeroSerie ?? '').trim() || null,
      garantia,
      data_compra: garantia ? String(body?.dataCompra ?? '').trim() || null : null,
      numero_nf: garantia ? String(body?.numeroNf ?? '').trim() || null : null,
      local_compra: garantia ? String(body?.localCompra ?? '').trim() || null : null,
      defeito,
      status: 'NOVA',
      prioridade: body?.prioridade === 'URGENTE' ? 'URGENTE' : 'NORMAL',
      parceiro_id: null,
      sla_status: 'NORMAL',
    }

    if (await colunaExiste(supabase, 'ordens_servico', 'origem_os')) {
      osPayload.origem_os = origemOs
    }
    if (await colunaExiste(supabase, 'ordens_servico', 'unidade_id')) {
      osPayload.unidade_id = auth.unidadeId
    }

    const { data: osCriada, error: osError } = await supabase
      .from('ordens_servico')
      .insert(osPayload)
      .select('id')
      .single()

    if (osError) throw osError
    if (!osCriada?.id) throw new Error('A OS foi criada, mas o ID nao retornou.')

    return NextResponse.json({ ok: true, id: osCriada.id, numeroOS })
  } catch (error) {
    console.error('Erro ao criar OS:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao criar a OS.') },
      { status: 500 }
    )
  }
}

function apenasNumeros(value: string) {
  return value.replace(/\D/g, '')
}

function gerarNumeroOS() {
  const agora = new Date()
  const ano = String(agora.getFullYear()).slice(-2)
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  const sequencia = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')

  return `CT${ano}${mes}${dia}${sequencia}`
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
