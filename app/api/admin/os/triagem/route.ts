import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type Cliente = {
  id: number
  nome: string | null
  whatsapp: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
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

type OrdemServico = {
  id: number
  numero_os: string | null
  origem_os?: string | null
  created_at: string
  status: string | null
  prioridade: string | null
  modelo: string | null
  defeito: string | null
  cliente_id: number | null
  parceiro_id: number | null
  clientes?: Cliente | null
  parceiros?: Parceiro | null
  categorias?: { nome: string | null } | null
  marcas?: { nome: string | null } | null
}

type HistoricoTecnico = {
  os_id: number | null
  acao: string | null
  descricao: string | null
  criado_em: string | null
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
    const auth = await requireAdminPermission(request, 'os')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const temOrigemOs = await colunaExiste(supabase, 'ordens_servico', 'origem_os')
    const origemOsSelect = temOrigemOs ? 'origem_os,' : ''

    const ordensSelect = `
        id,
        numero_os,
        ${origemOsSelect}
        created_at,
        status,
        prioridade,
        modelo,
        defeito,
        cliente_id,
        parceiro_id,
        clientes:cliente_id (
          id,
          nome,
          whatsapp,
          cep,
          logradouro,
          numero,
          bairro,
          cidade,
          estado,
          latitude,
          longitude
        ),
        parceiros:parceiro_id (
          id,
          responsavel,
          nome_fantasia,
          razao_social,
          whatsapp
        ),
        categorias:categoria_id ( nome ),
        marcas:marca_id ( nome )
      `

    const { data: ordensData, error: ordensError } = await supabase
      .from('ordens_servico')
      .select(ordensSelect)
      .neq('status', 'FINALIZADA')
      .order('created_at', { ascending: false })

    if (ordensError) throw ordensError

    const ordensBase = (ordensData ?? []) as unknown as OrdemServico[]
    const ordemIds = ordensBase.map((ordem) => ordem.id)
    let historicoTecnicoMap = new Map<number, HistoricoTecnico>()

    if (ordemIds.length > 0) {
      const { data: historicoTecnico, error: historicoTecnicoError } = await supabase
        .from('os_historico')
        .select('os_id, acao, descricao, criado_em')
        .in('os_id', ordemIds)
        .in('acao', ['ACEITE_TECNICO', 'RECUSA_TECNICO'])
        .order('criado_em', { ascending: false })

      if (historicoTecnicoError) throw historicoTecnicoError

      historicoTecnicoMap = new Map()
      ;((historicoTecnico ?? []) as HistoricoTecnico[]).forEach((item) => {
        if (item.os_id && !historicoTecnicoMap.has(item.os_id)) {
          historicoTecnicoMap.set(item.os_id, item)
        }
      })
    }

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
      .order('responsavel', { ascending: true })

    if (parceirosError) throw parceirosError

    const parceirosAtivos = ((parceirosData ?? []) as Parceiro[]).filter(
      (parceiro) => (parceiro.status ?? 'ATIVO').toUpperCase() === 'ATIVO'
    )

    const ordens = await Promise.all(
      ordensBase.map(async (ordem) => ({
        ...ordem,
        tecnico_resposta: historicoTecnicoMap.get(ordem.id) ?? null,
        tecnico_sugeridos: await sugerirTecnicos(
          ordem.clientes ?? null,
          parceirosAtivos,
          ordem.categorias?.nome ?? null
        ),
      }))
    )

    return NextResponse.json({ data: ordens })
  } catch (error) {
    console.error('Erro ao listar OS para triagem:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao listar OS para triagem.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'os')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const osId = Number(body?.osId)
    const parceiroId = body?.parceiroId ? Number(body.parceiroId) : null
    const statusSolicitado = body?.status ? String(body.status).trim().toUpperCase() : null

    if (!osId || (!parceiroId && !statusSolicitado)) {
      return NextResponse.json(
        { error: 'Informe a OS e a acao desejada.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: osAtual, error: osAtualError } = await supabase
      .from('ordens_servico')
      .select('id, status, prioridade, parceiro_id')
      .eq('id', osId)
      .maybeSingle()

    if (osAtualError) throw osAtualError
    if (!osAtual) {
      return NextResponse.json({ error: 'OS nao encontrada.' }, { status: 404 })
    }

    let parceiro:
      | { id: number; responsavel: string | null; nome_fantasia: string | null; razao_social: string | null }
      | null = null

    if (parceiroId) {
      const { data: parceiroData, error: parceiroError } = await supabase
        .from('parceiros')
        .select('id, responsavel, nome_fantasia, razao_social')
        .eq('id', parceiroId)
        .maybeSingle()

      if (parceiroError) throw parceiroError
      if (!parceiroData) {
        return NextResponse.json({ error: 'Tecnico nao encontrado.' }, { status: 404 })
      }

      parceiro = parceiroData
    }

    const novoStatus =
      statusSolicitado ??
      (parceiroId && osAtual.status === 'NOVA' ? 'EM_TRIAGEM' : osAtual.status)

    const updatePayload: { status: string | null; parceiro_id?: number } = {
      status: novoStatus,
    }

    if (parceiroId) updatePayload.parceiro_id = parceiroId

    const { error: updateError } = await supabase
      .from('ordens_servico')
      .update(updatePayload)
      .eq('id', osId)

    if (updateError) throw updateError

    const nomeTecnico = parceiro
      ? parceiro.responsavel ?? parceiro.nome_fantasia ?? parceiro.razao_social ?? `Tecnico #${parceiroId}`
      : null

    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: osId,
      acao: parceiroId ? 'ATRIBUICAO_TECNICO' : 'ALTERACAO_STATUS',
      status_anterior: osAtual.status,
      status_novo: novoStatus,
      prioridade_anterior: osAtual.prioridade,
      prioridade_nova: osAtual.prioridade,
      descricao: parceiroId
        ? `Tecnico externo atribuido: ${nomeTecnico}`
        : `Status alterado para ${novoStatus}`,
      responsavel: 'Admin',
    })

    if (historicoError) throw historicoError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao atribuir tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao atribuir tecnico.') },
      { status: 500 }
    )
  }
}

async function sugerirTecnicos(
  cliente: Cliente | null,
  parceiros: Parceiro[],
  categoriaNome: string | null
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

  return sugestoes
    .sort((a, b) => {
      if (a.ranking !== b.ranking) return a.ranking - b.ranking
      return String(a.cadastrado_em ?? '').localeCompare(String(b.cadastrado_em ?? ''))
    })
    .slice(0, 3)
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

      if (response.ok) {
        const data = await response.json()
        const latitude = Number(data?.location?.coordinates?.latitude)
        const longitude = Number(data?.location?.coordinates?.longitude)

        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          const coords = { latitude, longitude }
          cepCoordsCache.set(cep, coords)
          return coords
        }
      }

      cepCoordsCache.set(cep, null)
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
