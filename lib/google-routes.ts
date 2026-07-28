export type ParadaRota = {
  vinculoId: number
  osId: number
  numeroOs: string
  endereco: string
}

export type ResultadoRotaGoogle = {
  distanciaKm: number
  duracaoMinutos: number
  ordemOtimizada: ParadaRota[]
  distanciasPorVinculo: Map<number, number>
}

type RoutesResponse = {
  routes?: Array<{
    distanceMeters?: number
    duration?: string
    optimizedIntermediateWaypointIndex?: number[]
  }>
  error?: { message?: string }
}

type MatrixElement = {
  destinationIndex?: number
  distanceMeters?: number
  condition?: string
  status?: { code?: number; message?: string }
}

export async function calcularRotaGoogle(input: {
  apiKey: string
  origem: string
  destino: string
  paradas: ParadaRota[]
}) {
  const { apiKey, origem, destino, paradas } = input
  if (!apiKey) throw new Error('Chave da Google Maps Platform nao configurada.')
  if (!origem || !destino) throw new Error('Origem e destino da rota sao obrigatorios.')
  if (!paradas.length) throw new Error('Vincule pelo menos uma OS para calcular a rota.')
  if (paradas.length > 25) throw new Error('O calculo automatico aceita ate 25 OS por rota.')

  const [rotaResponse, matrizResponse] = await Promise.all([
    fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex',
      },
      body: JSON.stringify({
        origin: { address: origem },
        destination: { address: destino },
        intermediates: paradas.map((parada) => ({ address: parada.endereco })),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        optimizeWaypointOrder: paradas.length > 1,
        languageCode: 'pt-BR',
        units: 'METRIC',
      }),
      signal: AbortSignal.timeout(30_000),
    }),
    fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'destinationIndex,distanceMeters,status,condition',
      },
      body: JSON.stringify({
        origins: [{ waypoint: { address: origem } }],
        destinations: paradas.map((parada) => ({ waypoint: { address: parada.endereco } })),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
      signal: AbortSignal.timeout(30_000),
    }),
  ])

  const rotaPayload = await rotaResponse.json().catch(() => null) as RoutesResponse | null
  if (!rotaResponse.ok) throw new Error(mensagemGoogle(rotaPayload, 'Nao foi possivel calcular a rota completa.'))
  const rota = rotaPayload?.routes?.[0]
  if (!rota?.distanceMeters) throw new Error('O Google Maps nao encontrou uma rota rodoviaria para os enderecos informados.')

  const matrizPayload = await matrizResponse.json().catch(() => null) as MatrixElement[] | { error?: { message?: string } } | null
  if (!matrizResponse.ok) throw new Error(mensagemGoogle(matrizPayload, 'Nao foi possivel calcular as distancias das OS.'))
  if (!Array.isArray(matrizPayload)) throw new Error('Resposta inesperada ao calcular as distancias das OS.')

  const distanciasPorVinculo = new Map<number, number>()
  for (const elemento of matrizPayload) {
    const index = Number(elemento.destinationIndex)
    const parada = paradas[index]
    if (!parada || elemento.condition !== 'ROUTE_EXISTS' || !Number.isFinite(Number(elemento.distanceMeters))) {
      throw new Error(`Nao foi encontrada rota rodoviaria para ${parada?.numeroOs ?? `a parada ${index + 1}`}.`)
    }
    distanciasPorVinculo.set(parada.vinculoId, arredondarKm(Number(elemento.distanceMeters)))
  }

  const indices = Array.isArray(rota.optimizedIntermediateWaypointIndex)
    ? rota.optimizedIntermediateWaypointIndex
    : paradas.map((_, index) => index)
  const ordemOtimizada = indices.map((index) => paradas[index]).filter(Boolean)

  return {
    distanciaKm: arredondarKm(rota.distanceMeters),
    duracaoMinutos: duracaoEmMinutos(rota.duration),
    ordemOtimizada,
    distanciasPorVinculo,
  } satisfies ResultadoRotaGoogle
}

export function montarEnderecoRota(value: unknown) {
  const endereco = String(value ?? '').trim()
  if (!endereco) return ''
  if (/brasil/i.test(endereco)) return endereco
  if (/(?:^|[\s,-])[A-Z]{2}(?:$|[\s,-])/i.test(endereco)) return `${endereco}, Brasil`
  return `${endereco}, MS, Brasil`
}

export function montarEnderecoCliente(cliente: {
  logradouro?: unknown
  numero?: unknown
  bairro?: unknown
  cidade?: unknown
  estado?: unknown
  cep?: unknown
}) {
  return [
    [cliente.logradouro, cliente.numero].filter(Boolean).join(', '),
    cliente.bairro,
    [cliente.cidade, cliente.estado].filter(Boolean).join(' - '),
    cliente.cep,
    'Brasil',
  ].map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
}

function arredondarKm(metros: number) {
  return Math.round((Math.max(metros, 0) / 1000) * 100) / 100
}

function duracaoEmMinutos(value: unknown) {
  const segundos = Number(String(value ?? '').replace(/s$/i, ''))
  return Number.isFinite(segundos) ? Math.ceil(segundos / 60) : 0
}

function mensagemGoogle(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { message?: string } }).error
    if (error?.message) return `Google Maps: ${error.message}`
  }
  return fallback
}
