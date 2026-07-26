import { moeda } from './calculos-financeiros.ts'

export type EntradaRentabilidade = {
  receita: number
  receitaPecas: number
  receitaMaoObra: number
  custoPecas: number
  tecnicoTotal: number
  tecnicoProprio: boolean
  comissaoPecasPercentual: number
  comissaoMaoObraPercentual: number
  custoRota: number
}

export function calcularRentabilidade(input: EntradaRentabilidade) {
  const receita = moeda(input.receita)
  const receitaPecas = moeda(input.receitaPecas)
  const receitaMaoObra = moeda(input.receitaMaoObra)
  const custoPecas = moeda(input.custoPecas)
  const custoRota = moeda(input.custoRota)
  const custoTecnico = input.tecnicoProprio
    ? moeda(
        receitaPecas * Math.max(Number(input.comissaoPecasPercentual) || 0, 0) / 100
        + receitaMaoObra * Math.max(Number(input.comissaoMaoObraPercentual) || 0, 0) / 100
      )
    : moeda(input.tecnicoTotal)
  const terceirizadoComCustoCompleto = !input.tecnicoProprio && custoTecnico > 0
  const custoPecasReconhecido = terceirizadoComCustoCompleto ? 0 : custoPecas
  const custosDiretos = moeda(custoPecasReconhecido + custoTecnico + custoRota)
  const lucroBruto = moeda(receita - custosDiretos)

  return {
    receita,
    receitaPecas,
    receitaMaoObra,
    custoPecas,
    custoPecasReconhecido,
    custoTecnico,
    custoRota,
    custosDiretos,
    lucroBruto,
    margemPercentual: receita > 0 ? lucroBruto / receita * 100 : 0,
    terceirizadoComCustoCompleto,
  }
}
