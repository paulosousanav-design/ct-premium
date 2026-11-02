export type MarcoReparo = {
  statusAnterior?: string | null
  statusNovo?: string | null
  criadoEm?: string | null
}

export type TrechoReparo = {
  status: string
  inicio: number
  fim: number
  tipo: 'reparo' | 'parado' | 'concluido'
}

export type TempoReparo = {
  iniciado: boolean
  reparoMs: number
  paradoMs: number
  trechos: TrechoReparo[]
}

const STATUS_REPARO = new Set(['EM_ATENDIMENTO'])
const STATUS_PARADO = new Set(['AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_REVISAO', 'CRITICA'])
const STATUS_FIM = new Set(['FINALIZADA', 'ENCERRADA_SEM_REPARO'])

const ROTULOS: Record<string, string> = {
  EM_ATENDIMENTO: 'Em atendimento',
  AGUARDANDO_PECA: 'Aguardando peça',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  AGUARDANDO_REVISAO: 'Aguardando revisão',
  CRITICA: 'Crítica',
  PRONTO_AGUARDANDO_ENTREGA: 'Pronto, aguardando entrega',
  FINALIZADA: 'Finalizada',
  ENCERRADA_SEM_REPARO: 'Encerrada sem reparo',
}

export function rotuloStatusReparo(status: string) {
  return ROTULOS[status] ?? status.replaceAll('_', ' ').toLowerCase()
}

export function formatarDuracao(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  if (totalMin < 1) return 'menos de 1 min'
  const dias = Math.floor(totalMin / 1440)
  const horas = Math.floor((totalMin % 1440) / 60)
  const minutos = totalMin % 60
  if (dias > 0) {
    const dia = dias === 1 ? 'dia' : 'dias'
    return horas > 0 ? `${dias} ${dia} ${horas} h` : `${dias} ${dia}`
  }
  if (horas > 0) return minutos > 0 ? `${horas} h ${minutos} min` : `${horas} h`
  return `${minutos} min`
}

export function montarTempoReparo(
  historico: MarcoReparo[],
  statusAtual?: string | null,
  finalizadaEm?: string | null,
  agora = Date.now()
): TempoReparo {
  const mudancas = historico
    .map((item) => ({
      status: String(item.statusNovo ?? '').trim().toUpperCase(),
      anterior: String(item.statusAnterior ?? '').trim().toUpperCase(),
      em: item.criadoEm ? new Date(item.criadoEm).getTime() : Number.NaN,
    }))
    .filter((item) => item.status && item.status !== item.anterior && Number.isFinite(item.em))
    .sort((a, b) => a.em - b.em)

  const inicio = mudancas.findIndex((item) => item.status === 'EM_ATENDIMENTO')
  if (inicio < 0) return { iniciado: false, reparoMs: 0, paradoMs: 0, trechos: [] }

  const eventos: { status: string; em: number }[] = []
  for (const item of mudancas.slice(inicio)) {
    if (eventos.at(-1)?.status === item.status) continue
    eventos.push({ status: item.status, em: item.em })
  }

  const statusAgora = String(statusAtual ?? '').trim().toUpperCase()
  const fimRegistrado = finalizadaEm ? new Date(finalizadaEm).getTime() : Number.NaN
  const fimAberto = STATUS_FIM.has(statusAgora)
  const trechos: TrechoReparo[] = []

  for (let indice = 0; indice < eventos.length; indice += 1) {
    const evento = eventos[indice]
    if (STATUS_FIM.has(evento.status)) break
    const proximo = eventos[indice + 1]
    const fim = proximo
      ? proximo.em
      : fimAberto && Number.isFinite(fimRegistrado)
        ? fimRegistrado
        : agora
    if (fim <= evento.em) continue
    trechos.push({
      status: evento.status,
      inicio: evento.em,
      fim,
      tipo: tipoDoStatus(evento.status),
    })
  }

  return {
    iniciado: true,
    reparoMs: somar(trechos, 'reparo'),
    paradoMs: somar(trechos, 'parado'),
    trechos,
  }
}

function tipoDoStatus(status: string): TrechoReparo['tipo'] {
  if (STATUS_REPARO.has(status)) return 'reparo'
  if (STATUS_PARADO.has(status)) return 'parado'
  return 'concluido'
}

function somar(trechos: TrechoReparo[], tipo: TrechoReparo['tipo']) {
  return trechos.filter((trecho) => trecho.tipo === tipo).reduce((total, trecho) => total + (trecho.fim - trecho.inicio), 0)
}
