import assert from 'node:assert/strict'
import test from 'node:test'
import { formatarDuracao, montarTempoReparo } from '../lib/tempo-reparo.ts'

const hora = 60 * 60 * 1000
const dia = 24 * hora

test('não conta o tempo antes de o técnico assumir', () => {
  const tempo = montarTempoReparo([
    marco('NOVA', 'EM_TRIAGEM', '2026-11-01T08:00:00'),
  ], 'EM_TRIAGEM', null, Date.parse('2026-11-03T08:00:00'))

  assert.equal(tempo.iniciado, false)
  assert.equal(tempo.reparoMs, 0)
  assert.equal(tempo.paradoMs, 0)
})

test('separa reparo e espera de peça', () => {
  const tempo = montarTempoReparo([
    marco('EM_TRIAGEM', 'EM_ATENDIMENTO', '2026-11-01T10:00:00'),
    marco('EM_ATENDIMENTO', 'AGUARDANDO_PECA', '2026-11-01T12:00:00'),
    marco('AGUARDANDO_PECA', 'EM_ATENDIMENTO', '2026-11-04T12:00:00'),
    marco('EM_ATENDIMENTO', 'FINALIZADA', '2026-11-04T12:40:00'),
  ], 'FINALIZADA', '2026-11-04T12:40:00', Date.parse('2026-11-10T12:00:00'))

  assert.equal(tempo.iniciado, true)
  assert.equal(tempo.reparoMs, 2 * hora + 40 * 60 * 1000)
  assert.equal(tempo.paradoMs, 3 * dia)
  assert.equal(tempo.trechos.length, 3)
})

test('pronto aguardando entrega não entra no reparo nem na espera', () => {
  const tempo = montarTempoReparo([
    marco('NOVA', 'EM_ATENDIMENTO', '2026-11-01T09:00:00'),
    marco('EM_ATENDIMENTO', 'PRONTO_AGUARDANDO_ENTREGA', '2026-11-01T11:00:00'),
  ], 'PRONTO_AGUARDANDO_ENTREGA', null, Date.parse('2026-11-03T11:00:00'))

  assert.equal(tempo.reparoMs, 2 * hora)
  assert.equal(tempo.paradoMs, 0)
  assert.equal(tempo.trechos.at(-1)?.tipo, 'concluido')
  assert.equal(tempo.trechos.at(-1)?.fim, Date.parse('2026-11-03T11:00:00'))
})

test('ordem em atendimento continua contando', () => {
  const agora = Date.parse('2026-11-01T13:30:00')
  const tempo = montarTempoReparo([
    marco('NOVA', 'EM_ATENDIMENTO', '2026-11-01T10:00:00'),
    marco('EM_ATENDIMENTO', 'EM_ATENDIMENTO', '2026-11-01T11:00:00'),
  ], 'EM_ATENDIMENTO', null, agora)

  assert.equal(tempo.reparoMs, agora - Date.parse('2026-11-01T10:00:00'))
  assert.equal(formatarDuracao(tempo.reparoMs), '3 h 30 min')
})

function marco(anterior: string, novo: string, quando: string) {
  return { statusAnterior: anterior, statusNovo: novo, criadoEm: quando }
}
