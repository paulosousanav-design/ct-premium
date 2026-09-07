import assert from 'node:assert/strict'
import test from 'node:test'
import { autorizacaoGoogleInvalida, mensagemErroOAuth } from '../lib/google-oauth-error.ts'

test('traduz invalid_grant como autorizacao expirada', () => {
  const mensagem = mensagemErroOAuth(400, {
    error: 'invalid_grant',
    error_description: 'Token has been expired or revoked.',
  }, '')

  assert.match(mensagem, /expirou ou foi revogada/i)
  assert.equal(autorizacaoGoogleInvalida(mensagem), true)
})

test('trata resposta 400 sem JSON como necessidade de reconexao', () => {
  const mensagem = mensagemErroOAuth(400, null, 'Bad Request')

  assert.match(mensagem, /Reconecte a conta/i)
  assert.equal(autorizacaoGoogleInvalida('Google OAuth: Bad Request'), true)
})

test('diferencia credenciais invalidas da autorizacao da conta', () => {
  const mensagem = mensagemErroOAuth(401, { error: 'invalid_client' }, '')

  assert.match(mensagem, /Client ID e o Client Secret/i)
  assert.equal(autorizacaoGoogleInvalida(mensagem), false)
})
