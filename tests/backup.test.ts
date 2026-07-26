import assert from 'node:assert/strict'
import test from 'node:test'
import { PRAZO_BACKUP_DIAS, situacaoBackup } from '../lib/backup.ts'

const agora = new Date('2026-07-25T12:00:00Z').getTime()

test('indica quando ainda nao existe backup', () => {
  assert.equal(situacaoBackup(null, agora), 'SEM_BACKUP')
})

test('considera backup recente em dia', () => {
  assert.equal(situacaoBackup('2026-07-20T12:00:00Z', agora), 'EM_DIA')
})

test(`indica atraso depois de ${PRAZO_BACKUP_DIAS} dias`, () => {
  assert.equal(situacaoBackup('2026-07-17T11:59:59Z', agora), 'ATRASADO')
})
