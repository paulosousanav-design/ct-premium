export type IntervaloCompetencia = { inicio: Date; fim: Date }

export function competenciaAtualCuiaba(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cuiaba',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(agora)
  const ano = partes.find((parte) => parte.type === 'year')?.value
  const mes = partes.find((parte) => parte.type === 'month')?.value
  return `${ano}-${mes}`
}

export function normalizarCompetencia(valor: string | null, agora = new Date()) {
  if (!valor || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return competenciaAtualCuiaba(agora)
  return valor
}

export function intervaloCompetencia(competencia: string): IntervaloCompetencia {
  const [ano, mes] = competencia.split('-').map(Number)
  const proximoAno = mes === 12 ? ano + 1 : ano
  const proximoMes = mes === 12 ? 1 : mes + 1
  return {
    inicio: new Date(`${ano}-${String(mes).padStart(2, '0')}-01T00:00:00-04:00`),
    fim: new Date(`${proximoAno}-${String(proximoMes).padStart(2, '0')}-01T00:00:00-04:00`),
  }
}

export function dataNoPeriodo(valor: unknown, periodo: IntervaloCompetencia) {
  if (!valor) return false
  const data = new Date(String(valor))
  return !Number.isNaN(data.getTime()) && data >= periodo.inicio && data < periodo.fim
}
