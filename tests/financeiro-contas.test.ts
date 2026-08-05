import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularValorLiquidoCartao } from '../lib/financeiro-contas.ts'

test('cartao separa valor bruto, taxa percentual e liquido', () => {
  assert.deepEqual(calcularValorLiquidoCartao(1000, 3), { valorBruto: 1000, taxaValor: 30, valorLiquido: 970 })
})

test('cartao combina taxa percentual e taxa fixa com arredondamento', () => {
  assert.deepEqual(calcularValorLiquidoCartao(199.90, 2.5, 0.49), { valorBruto: 199.9, taxaValor: 5.49, valorLiquido: 194.41 })
})

test('cartao rejeita taxa negativa ou superior a cem por cento', () => {
  assert.throws(() => calcularValorLiquidoCartao(100, -1), /inválidos/)
  assert.throws(() => calcularValorLiquidoCartao(100, 101), /inválidos/)
})
