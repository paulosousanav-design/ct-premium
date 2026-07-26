import assert from 'node:assert/strict'
import test from 'node:test'
import {
  criarEstadoOAuth,
  criptografarSegredo,
  descriptografarSegredo,
  validarEstadoOAuth,
} from '../lib/google-drive.ts'

process.env.BACKUP_ENCRYPTION_KEY = 'chave-de-teste-com-mais-de-trinta-e-dois-caracteres'

test('protege e recupera credencial do Google Drive', () => {
  const original = 'refresh-token-ultrassecreto'
  const protegido = criptografarSegredo(original)
  assert.notEqual(protegido, original)
  assert.equal(descriptografarSegredo(protegido), original)
})

test('valida estado OAuth assinado e dentro do prazo', () => {
  const state = criarEstadoOAuth({ exp: Date.now() + 60_000, usuario: 'master' })
  const payload = validarEstadoOAuth<{ exp: number; usuario: string }>(state)
  assert.equal(payload.usuario, 'master')
})

test('rejeita estado OAuth adulterado ou expirado', () => {
  const state = criarEstadoOAuth({ exp: Date.now() - 1, usuario: 'master' })
  assert.throws(() => validarEstadoOAuth(state), /expirada/)
  assert.throws(() => validarEstadoOAuth(`${state}x`), /Assinatura/)
})
