function moeda(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

export type BaixaContaPagarInput = {
  valorOriginal: number
  juros: number
  multa: number
  desconto: number
}

export function calcularBaixaContaPagar(input: BaixaContaPagarInput) {
  const valorOriginal = moeda(Number(input.valorOriginal))
  const juros = moeda(Number(input.juros))
  const multa = moeda(Number(input.multa))
  const desconto = moeda(Number(input.desconto))

  if ([valorOriginal, juros, multa, desconto].some((valor) => !Number.isFinite(valor) || valor < 0)) {
    throw new Error('Valor original, juros, multa e desconto devem ser valores positivos.')
  }
  if (valorOriginal <= 0) {
    throw new Error('O valor original da conta deve ser maior que zero.')
  }

  const totalAntesDesconto = moeda(valorOriginal + juros + multa)
  if (desconto > totalAntesDesconto) {
    throw new Error('O desconto não pode ser maior que o valor total da conta.')
  }

  return {
    valorOriginal,
    juros,
    multa,
    desconto,
    acrescimos: moeda(juros + multa),
    valorPago: moeda(totalAntesDesconto - desconto),
  }
}
