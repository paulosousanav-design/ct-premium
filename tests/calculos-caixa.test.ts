import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularDiferencaCaixa, calcularResumoCaixa, normalizarFormaCaixa } from '../lib/calculos-caixa.ts'

test('caixa calcula entradas, saidas e dinheiro esperado separadamente', () => {
  const resumo = calcularResumoCaixa(200, [
    { natureza: 'ENTRADA', forma: 'DINHEIRO', valor: 300 },
    { natureza: 'ENTRADA', forma: 'PIX', valor: 800 },
    { natureza: 'ENTRADA', forma: 'CARTAO', valor: 1_200 },
    { natureza: 'SAIDA', forma: 'DINHEIRO', valor: 50 },
    { natureza: 'SAIDA', forma: 'PIX', valor: 250 },
  ])

  assert.equal(resumo.totalEntradas, 2_300)
  assert.equal(resumo.totalSaidas, 300)
  assert.equal(resumo.resultadoLiquido, 2_000)
  assert.equal(resumo.dinheiroEsperado, 450)
  assert.equal(resumo.liquido.PIX, 550)
})

test('diferenca negativa indica falta de dinheiro na conferencia', () => {
  assert.equal(calcularDiferencaCaixa(440, 450), -10)
})

test('formas financeiras sao normalizadas para o fechamento', () => {
  assert.equal(normalizarFormaCaixa('Cartao de credito'), 'CARTAO')
  assert.equal(normalizarFormaCaixa('transferencia'), 'DEPOSITO')
  assert.equal(normalizarFormaCaixa('vale'), 'OUTROS')
})

test('caixa rejeita saldo e movimentos invalidos', () => {
  assert.throws(() => calcularResumoCaixa(-1, []), /saldo inicial/)
  assert.throws(() => calcularResumoCaixa(0, [{ natureza: 'ENTRADA', forma: 'PIX', valor: 0 }]), /maior que zero/)
})
