import assert from 'node:assert/strict'
import test from 'node:test'
import { criarFingerprint, normalizarMensagemFingerprint } from '../lib/monitoramento.ts'

test('agrupa a mesma falha mesmo quando IDs mudam', () => {
  const primeira = criarFingerprint({
    modulo: 'ORDEM_SERVICO',
    rota: '/api/admin/os/123456',
    codigo: 'PGRST116',
    mensagem: 'Falha ao salvar OS 123456 para 550e8400-e29b-41d4-a716-446655440000',
  })
  const segunda = criarFingerprint({
    modulo: 'ORDEM_SERVICO',
    rota: '/api/admin/os/987654',
    codigo: 'PGRST116',
    mensagem: 'Falha ao salvar OS 987654 para 6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })

  assert.equal(primeira, segunda)
})

test('mantem falhas de modulos distintos separadas', () => {
  const mensagem = 'Falha ao concluir operacao 123456'
  const os = criarFingerprint({ modulo: 'ORDEM_SERVICO', rota: '/api/admin/acao', mensagem })
  const financeiro = criarFingerprint({ modulo: 'FINANCEIRO', rota: '/api/admin/acao', mensagem })

  assert.notEqual(os, financeiro)
})

test('normaliza identificadores variaveis e espacos', () => {
  assert.equal(
    normalizarMensagemFingerprint('  ERRO   no item 123456 e 550e8400-e29b-41d4-a716-446655440000  '),
    'erro no item # e #'
  )
})
