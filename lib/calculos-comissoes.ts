import { moeda } from './calculos-financeiros.ts'

export function calcularComissao(
  valorPecas: number,
  valorMaoObra: number,
  percentualPecas: number,
  percentualMaoObra: number
) {
  const pecas = moeda(valorPecas)
  const maoObra = moeda(valorMaoObra)
  const taxaPecas = Math.max(Number(percentualPecas) || 0, 0)
  const taxaMaoObra = Math.max(Number(percentualMaoObra) || 0, 0)
  const comissaoPecas = moeda(pecas * taxaPecas / 100)
  const comissaoMaoObra = moeda(maoObra * taxaMaoObra / 100)

  return {
    valorPecas: pecas,
    valorMaoObra: maoObra,
    percentualPecas: taxaPecas,
    percentualMaoObra: taxaMaoObra,
    comissaoPecas,
    comissaoMaoObra,
    total: moeda(comissaoPecas + comissaoMaoObra),
  }
}
