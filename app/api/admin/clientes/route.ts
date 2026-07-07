import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type ClienteRow = {
  id: number
  nome?: string | null
  cpf_cnpj?: string | null
  whatsapp?: string | null
  email?: string | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  created_at?: string | null
}

type OrdemRow = {
  id: number
  numero_os?: string | null
  cliente_id?: number | null
  created_at?: string | null
  finalizada_em?: string | null
  status?: string | null
  garantia?: boolean | null
  total?: number | string | null
  cliente_total?: number | string | null
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
    const auth = await requireAdminPermission(request, 'relatorios')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const inicio = request.nextUrl.searchParams.get('inicio')
    const fim = request.nextUrl.searchParams.get('fim')
    const busca = normalizarTexto(request.nextUrl.searchParams.get('busca') ?? '')
    const estadoFiltro = normalizarTexto(request.nextUrl.searchParams.get('estado') ?? '')
    const cidadeFiltro = normalizarTexto(request.nextUrl.searchParams.get('cidade') ?? '')
    const temClienteTotal = await colunaExiste(supabase, 'ordens_servico', 'cliente_total')

    const { data: clientesData, error: clientesError } = await supabase
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true })

    if (clientesError) throw clientesError

    const clientes = (clientesData ?? []) as ClienteRow[]
    const clienteIds = clientes.map((cliente) => cliente.id).filter(Boolean)
    const ordens = await carregarOrdens(supabase, clienteIds, temClienteTotal)
    const ordensPorClienteId = agruparOrdensPorCliente(ordens)
    const agrupados = agruparClientes(clientes, ordensPorClienteId)
    const inicioTime = inicio ? new Date(`${inicio}T00:00:00.000Z`).getTime() : null
    const fimTime = fim ? new Date(`${fim}T23:59:59.999Z`).getTime() : null

    const lista = agrupados
      .filter((cliente) => {
        if (estadoFiltro && normalizarTexto(cliente.estado ?? '') !== estadoFiltro) return false
        if (cidadeFiltro && normalizarTexto(cliente.cidade ?? '') !== cidadeFiltro) return false
        if (busca && !normalizarTexto([
          cliente.nome,
          cliente.cpf_cnpj,
          cliente.whatsapp,
          cliente.email,
          cliente.cidade,
          cliente.estado,
          ...cliente.ordens.map((ordem) => ordem.numero_os),
        ].filter(Boolean).join(' ')).includes(busca)) return false

        if (inicioTime || fimTime) {
          return cliente.ordens.some((ordem) => {
            const dataOs = ordem.created_at ? new Date(ordem.created_at).getTime() : 0
            if (inicioTime && dataOs < inicioTime) return false
            if (fimTime && dataOs > fimTime) return false
            return true
          })
        }

        return true
      })
      .map((cliente) => resumirCliente(cliente))
      .sort((a, b) => {
        const dataA = a.ultimo_atendimento ? new Date(a.ultimo_atendimento).getTime() : 0
        const dataB = b.ultimo_atendimento ? new Date(b.ultimo_atendimento).getTime() : 0
        return dataB - dataA
      })

    const estados = Array.from(new Set(agrupados.map((item) => item.estado).filter(Boolean))).sort()
    const cidades = Array.from(new Set(
      agrupados
        .filter((item) => !estadoFiltro || normalizarTexto(item.estado ?? '') === estadoFiltro)
        .map((item) => item.cidade)
        .filter(Boolean)
    )).sort()

    const resumo = {
      total: lista.length,
      comOs: lista.filter((item) => item.total_os > 0).length,
      garantia: lista.filter((item) => item.os_garantia > 0).length,
      particulares: lista.filter((item) => item.os_particular > 0).length,
      faturamento: lista.reduce((acc, item) => acc + item.valor_total, 0),
    }

    return NextResponse.json({
      filtros: {
        inicio,
        fim,
        busca,
        estado: estadoFiltro,
        cidade: cidadeFiltro,
        opcoes: { estados, cidades },
      },
      resumo,
      clientes: lista,
    })
  } catch (error) {
    console.error('Erro ao listar clientes:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar clientes.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'relatorios')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const ids = Array.isArray(body?.ids)
      ? body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0)
      : [Number(body?.id)].filter((id) => Number.isInteger(id) && id > 0)

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Informe o cliente para editar.' }, { status: 400 })
    }

    const nome = limparTexto(body?.nome)
    if (!nome) {
      return NextResponse.json({ error: 'Informe o nome do cliente.' }, { status: 400 })
    }

    const payload = {
      nome,
      cpf_cnpj: limparTexto(body?.cpf_cnpj) || null,
      whatsapp: limparTexto(body?.whatsapp) || null,
      email: limparTexto(body?.email) || null,
      cep: limparTexto(body?.cep) || null,
      logradouro: limparTexto(body?.logradouro) || null,
      numero: limparTexto(body?.numero) || null,
      bairro: limparTexto(body?.bairro) || null,
      cidade: limparTexto(body?.cidade) || null,
      estado: limparTexto(body?.estado)?.toUpperCase() || null,
    }

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('clientes')
      .update(payload)
      .in('id', Array.from(new Set(ids)))

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao editar cliente:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao editar cliente.') },
      { status: 500 }
    )
  }
}

async function carregarOrdens(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clienteIds: number[],
  temClienteTotal: boolean
) {
  if (clienteIds.length === 0) return []

  const select = `
    id,
    numero_os,
    cliente_id,
    created_at,
    finalizada_em,
    status,
    garantia,
    total
    ${temClienteTotal ? ', cliente_total' : ''}
  `

  const { data, error } = await supabase
    .from('ordens_servico')
    .select(select)
    .in('cliente_id', clienteIds)

  if (error) throw error
  return (data ?? []) as unknown as OrdemRow[]
}

function agruparOrdensPorCliente(ordens: OrdemRow[]) {
  const mapa = new Map<number, OrdemRow[]>()

  for (const ordem of ordens) {
    if (!ordem.cliente_id) continue
    const lista = mapa.get(ordem.cliente_id) ?? []
    lista.push(ordem)
    mapa.set(ordem.cliente_id, lista)
  }

  return mapa
}

function agruparClientes(clientes: ClienteRow[], ordensPorClienteId: Map<number, OrdemRow[]>) {
  const mapa = new Map<string, ClienteRow & { ids: number[]; ordens: OrdemRow[] }>()

  for (const cliente of clientes) {
    const chave = criarChaveCliente(cliente)
    const atual = mapa.get(chave)
    const ordens = ordensPorClienteId.get(cliente.id) ?? []

    if (!atual) {
      mapa.set(chave, { ...cliente, ids: [cliente.id], ordens: [...ordens] })
      continue
    }

    atual.ids.push(cliente.id)
    atual.ordens.push(...ordens)
    atual.nome = escolherTexto(atual.nome, cliente.nome)
    atual.cpf_cnpj = escolherTexto(atual.cpf_cnpj, cliente.cpf_cnpj)
    atual.whatsapp = escolherTexto(atual.whatsapp, cliente.whatsapp)
    atual.email = escolherTexto(atual.email, cliente.email)
    atual.cep = escolherTexto(atual.cep, cliente.cep)
    atual.logradouro = escolherTexto(atual.logradouro, cliente.logradouro)
    atual.numero = escolherTexto(atual.numero, cliente.numero)
    atual.bairro = escolherTexto(atual.bairro, cliente.bairro)
    atual.cidade = escolherTexto(atual.cidade, cliente.cidade)
    atual.estado = escolherTexto(atual.estado, cliente.estado)
  }

  return Array.from(mapa.values())
}

function resumirCliente(cliente: ClienteRow & { ids: number[]; ordens: OrdemRow[] }) {
  const ordensOrdenadas = [...cliente.ordens].sort((a, b) => {
    const dataA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dataB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dataB - dataA
  })
  const ultima = ordensOrdenadas[0]
  const valorTotal = ordensOrdenadas.reduce(
    (acc, ordem) => acc + toNumber(ordem.cliente_total ?? ordem.total),
    0
  )

  return {
    id: cliente.ids[0],
    ids: cliente.ids,
    nome: cliente.nome ?? '-',
    cpf_cnpj: cliente.cpf_cnpj ?? null,
    whatsapp: cliente.whatsapp ?? null,
    email: cliente.email ?? null,
    cep: cliente.cep ?? null,
    logradouro: cliente.logradouro ?? null,
    numero: cliente.numero ?? null,
    bairro: cliente.bairro ?? null,
    endereco: formatarEndereco(cliente),
    cidade: cliente.cidade ?? null,
    estado: cliente.estado ?? null,
    total_os: ordensOrdenadas.length,
    os_garantia: ordensOrdenadas.filter((ordem) => ordem.garantia).length,
    os_particular: ordensOrdenadas.filter((ordem) => !ordem.garantia).length,
    valor_total: valorTotal,
    ticket_medio: ordensOrdenadas.length ? valorTotal / ordensOrdenadas.length : 0,
    ultimo_status: ultima?.status ?? null,
    ultima_os: ultima?.numero_os ?? null,
    ultimo_atendimento: ultima?.created_at ?? null,
  }
}

function criarChaveCliente(cliente: ClienteRow) {
  const documento = normalizarDigitos(cliente.cpf_cnpj ?? '')
  if (documento.length >= 8) return `doc:${documento}`

  const whatsapp = normalizarDigitos(cliente.whatsapp ?? '')
  if (whatsapp.length >= 8) return `whats:${whatsapp}`

  return `id:${cliente.id}`
}

function escolherTexto(atual?: string | null, novo?: string | null) {
  return atual?.trim() ? atual : novo ?? null
}

function formatarEndereco(cliente: ClienteRow) {
  const linha1 = [cliente.logradouro, cliente.numero].filter(Boolean).join(', ')
  const linha2 = [cliente.bairro, cliente.cidade, cliente.estado].filter(Boolean).join(' / ')
  return [linha1, linha2, cliente.cep].filter(Boolean).join(' - ') || null
}

function limparTexto(value: unknown) {
  return String(value ?? '').trim()
}

function normalizarDigitos(value: string) {
  return value.replace(/\D/g, '')
}

function normalizarTexto(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message ?? fallback)
  }
  return fallback
}
