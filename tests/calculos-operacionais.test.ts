import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularComissao } from '../lib/calculos-comissoes.ts'
import { calcularRentabilidade } from '../lib/calculos-rentabilidade.ts'
import { calcularRateioDespesas, somarCustosRateadosPorOs } from '../lib/calculos-rotas.ts'
import { montarEnderecoCliente, montarEnderecoRota } from '../lib/google-routes.ts'

test('rateio igual distribui todos os centavos sem perder valor', () => {
  const rateio = calcularRateioDespesas(100, [1, 1, 1])

  assert.deepEqual(rateio.map((item) => item.valor), [33.33, 33.33, 33.34])
  assert.equal(rateio.reduce((total, item) => total + item.valor, 0), 100)
})

test('rateio proporcional à receita respeita o peso de cada OS', () => {
  const rateio = calcularRateioDespesas(900, [200, 800])

  assert.deepEqual(rateio, [
    { percentual: 20, valor: 180 },
    { percentual: 80, valor: 720 },
  ])
})

test('rateio sem pesos válidos usa divisão igual', () => {
  const rateio = calcularRateioDespesas(90, [0, 0, 0])

  assert.deepEqual(rateio.map((item) => item.valor), [30, 30, 30])
})

test('custos de coleta e entrega em rotas diferentes são somados na mesma OS', () => {
  const custos = somarCustosRateadosPorOs([
    { os_id: 10, custo_rateado: 80.25 },
    { os_id: 10, custo_rateado: 44.75 },
    { os_id: 20, custo_rateado: 60 },
  ])

  assert.equal(custos.get(10), 125)
  assert.equal(custos.get(20), 60)
})

test('endereços da rota e do cliente são preparados para o cálculo rodoviário', () => {
  assert.equal(montarEnderecoRota('Naviraí'), 'Naviraí, MS, Brasil')
  assert.equal(montarEnderecoRota('Campo Grande, MS'), 'Campo Grande, MS, Brasil')
  assert.equal(montarEnderecoCliente({
    logradouro: 'Rua Exemplo',
    numero: '100',
    bairro: 'Centro',
    cidade: 'Naviraí',
    estado: 'MS',
    cep: '79950-000',
  }), 'Rua Exemplo, 100, Centro, Naviraí - MS, 79950-000, Brasil')
})

test('rentabilidade de técnico próprio soma peças, comissões e rota', () => {
  const resultado = calcularRentabilidade({
    receita: 1_000,
    receitaPecas: 600,
    receitaMaoObra: 400,
    custoPecas: 300,
    tecnicoTotal: 999,
    tecnicoProprio: true,
    comissaoPecasPercentual: 5,
    comissaoMaoObraPercentual: 10,
    custoRota: 100,
  })

  assert.equal(resultado.custoTecnico, 70)
  assert.equal(resultado.custoPecasReconhecido, 300)
  assert.equal(resultado.custosDiretos, 470)
  assert.equal(resultado.lucroBruto, 530)
  assert.equal(resultado.margemPercentual, 53)
  assert.equal(resultado.terceirizadoComCustoCompleto, false)
})

test('rentabilidade de terceirizado não duplica o custo das peças', () => {
  const resultado = calcularRentabilidade({
    receita: 1_000,
    receitaPecas: 600,
    receitaMaoObra: 400,
    custoPecas: 300,
    tecnicoTotal: 650,
    tecnicoProprio: false,
    comissaoPecasPercentual: 0,
    comissaoMaoObraPercentual: 0,
    custoRota: 100,
  })

  assert.equal(resultado.custoPecas, 300)
  assert.equal(resultado.custoPecasReconhecido, 0)
  assert.equal(resultado.custosDiretos, 750)
  assert.equal(resultado.lucroBruto, 250)
  assert.equal(resultado.margemPercentual, 25)
  assert.equal(resultado.terceirizadoComCustoCompleto, true)
})

test('rentabilidade sem receita não gera divisão inválida', () => {
  const resultado = calcularRentabilidade({
    receita: 0,
    receitaPecas: 0,
    receitaMaoObra: 0,
    custoPecas: 50,
    tecnicoTotal: 0,
    tecnicoProprio: true,
    comissaoPecasPercentual: 0,
    comissaoMaoObraPercentual: 0,
    custoRota: 20,
  })

  assert.equal(resultado.lucroBruto, -70)
  assert.equal(resultado.margemPercentual, 0)
})

test('comissão calcula peças e mão de obra separadamente', () => {
  const resultado = calcularComissao(333.33, 166.67, 7.5, 12)

  assert.equal(resultado.comissaoPecas, 25)
  assert.equal(resultado.comissaoMaoObra, 20)
  assert.equal(resultado.total, 45)
})
