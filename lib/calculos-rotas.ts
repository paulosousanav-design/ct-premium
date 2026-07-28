import { moeda } from './calculos-financeiros.ts'

export type ParcelaRateio = {
  percentual: number
  valor: number
}

export function calcularRateioDespesas(total: number, pesosInformados: number[]): ParcelaRateio[] {
  if (!pesosInformados.length) return []
  const totalCentavos = Math.round(Math.max(Number(total) || 0, 0) * 100)
  const pesos = pesosInformados.map((item) => Math.max(Number(item) || 0, 0))
  const somaPesos = pesos.reduce((acc, item) => acc + item, 0)
  const pesosValidos = somaPesos > 0 ? pesos : pesos.map(() => 1)
  const divisor = pesosValidos.reduce((acc, item) => acc + item, 0)
  let distribuido = 0

  return pesosValidos.map((peso, index) => {
    const ultimo = index === pesosValidos.length - 1
    const centavos = ultimo ? totalCentavos - distribuido : Math.round(totalCentavos * peso / divisor)
    distribuido += centavos
    return {
      percentual: divisor > 0 ? Math.round((peso / divisor * 100) * 1_000_000) / 1_000_000 : 0,
      valor: moeda(centavos / 100),
    }
  })
}

export function somarCustosRateadosPorOs(
  itens: Array<{ os_id: unknown; custo_rateado: unknown }>
) {
  const mapa = new Map<number, number>()
  for (const item of itens) {
    const osId = Number(item.os_id)
    const custo = Number(item.custo_rateado)
    if (!Number.isFinite(osId) || osId <= 0) continue
    mapa.set(osId, moeda((mapa.get(osId) ?? 0) + (Number.isFinite(custo) ? custo : 0)))
  }
  return mapa
}
