import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularBaixaRecebimento, moeda } from '../lib/calculos-financeiros.ts'

test('baixa parcial reduz somente o principal do saldo', () => {
  const resultado = calcularBaixaRecebimento({
    total: 1_000,
    recebidoAtual: 200,
    descontoAtual: 0,
    issRetidoAtual: 0,
    principal: 300,
    desconto: 0,
    juros: 0,
    multa: 0,
    issRetido: 0,
  })

  assert.deepEqual(resultado, {
    saldoAtual: 800,
    recebido: 500,
    desconto: 0,
    issRetido: 0,
    juros: 0,
    multa: 0,
    entradaCaixa: 300,
    saldoRestante: 500,
    status: 'PARCIAL',
  })
})

test('baixa final considera desconto e ISS no saldo, mas não na entrada de caixa', () => {
  const resultado = calcularBaixaRecebimento({
    total: 1_000,
    recebidoAtual: 200,
    descontoAtual: 50,
    issRetidoAtual: 0,
    principal: 650,
    desconto: 50,
    juros: 12.34,
    multa: 7.66,
    issRetido: 50,
  })

  assert.equal(resultado.status, 'RECEBIDO')
  assert.equal(resultado.saldoRestante, 0)
  assert.equal(resultado.recebido, 850)
  assert.equal(resultado.desconto, 100)
  assert.equal(resultado.issRetido, 50)
  assert.equal(resultado.entradaCaixa, 670)
})

test('baixa rejeita valor superior ao saldo da OS', () => {
  assert.throws(
    () => calcularBaixaRecebimento({
      total: 500,
      recebidoAtual: 400,
      descontoAtual: 0,
      issRetidoAtual: 0,
      principal: 100.01,
      desconto: 0,
      juros: 0,
      multa: 0,
      issRetido: 0,
    }),
    /ultrapassa o saldo/
  )
})

test('baixa rejeita valores negativos e lançamentos sem principal, desconto ou ISS', () => {
  const base = {
    total: 500,
    recebidoAtual: 0,
    descontoAtual: 0,
    issRetidoAtual: 0,
    principal: 0,
    desconto: 0,
    juros: 0,
    multa: 0,
    issRetido: 0,
  }

  assert.throws(() => calcularBaixaRecebimento({ ...base, juros: -1 }), /positivos/)
  assert.throws(() => calcularBaixaRecebimento(base), /principal, desconto ou ISS/)
})

test('arredondamento monetário mantém duas casas decimais', () => {
  assert.equal(moeda(0.1 + 0.2), 0.3)
  assert.equal(moeda(19.995), 20)
})
