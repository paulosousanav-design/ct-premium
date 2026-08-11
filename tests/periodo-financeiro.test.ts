import assert from 'node:assert/strict'
import test from 'node:test'
import { competenciaAtualCuiaba, dataNoPeriodo, intervaloCompetencia, normalizarCompetencia } from '../lib/periodo-financeiro.ts'

test('competência atual respeita o horário de Cuiabá', () => {
  assert.equal(competenciaAtualCuiaba(new Date('2026-08-01T03:30:00Z')), '2026-07')
  assert.equal(competenciaAtualCuiaba(new Date('2026-08-01T04:30:00Z')), '2026-08')
})

test('intervalo mensal inclui o primeiro instante e exclui o mês seguinte', () => {
  const periodo = intervaloCompetencia('2026-08')
  assert.equal(dataNoPeriodo('2026-08-01T03:59:59Z', periodo), false)
  assert.equal(dataNoPeriodo('2026-08-01T04:00:00Z', periodo), true)
  assert.equal(dataNoPeriodo('2026-09-01T03:59:59Z', periodo), true)
  assert.equal(dataNoPeriodo('2026-09-01T04:00:00Z', periodo), false)
})

test('competência inválida volta para o mês atual', () => {
  const agora = new Date('2026-08-15T12:00:00Z')
  assert.equal(normalizarCompetencia('2026-13', agora), '2026-08')
  assert.equal(normalizarCompetencia(null, agora), '2026-08')
})
