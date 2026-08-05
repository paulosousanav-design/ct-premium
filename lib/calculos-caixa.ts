export const FORMAS_CAIXA = ['DINHEIRO', 'PIX', 'CARTAO', 'BOLETO', 'DEPOSITO', 'OUTROS'] as const

export type FormaCaixa = typeof FORMAS_CAIXA[number]
export type ValoresPorForma = Record<FormaCaixa, number>

export type MovimentoCaixaCalculo = {
  natureza: 'ENTRADA' | 'SAIDA'
  forma: FormaCaixa
  valor: number
}

export type ResumoCaixa = {
  entradas: ValoresPorForma
  saidas: ValoresPorForma
  liquido: ValoresPorForma
  totalEntradas: number
  totalSaidas: number
  resultadoLiquido: number
  dinheiroEsperado: number
}

export function valoresPorFormaVazios(): ValoresPorForma {
  return { DINHEIRO: 0, PIX: 0, CARTAO: 0, BOLETO: 0, DEPOSITO: 0, OUTROS: 0 }
}

export function normalizarFormaCaixa(valor: unknown): FormaCaixa {
  const forma = String(valor ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (forma === 'DINHEIRO') return 'DINHEIRO'
  if (forma === 'PIX') return 'PIX'
  if (forma.includes('CARTAO') || forma.includes('CREDITO') || forma.includes('DEBITO')) return 'CARTAO'
  if (forma === 'BOLETO') return 'BOLETO'
  if (forma.includes('DEPOSITO') || forma.includes('TRANSFERENCIA')) return 'DEPOSITO'
  return 'OUTROS'
}

export function calcularResumoCaixa(saldoInicial: number, movimentos: MovimentoCaixaCalculo[]): ResumoCaixa {
  const abertura = moeda(saldoInicial)
  if (!Number.isFinite(abertura) || abertura < 0) throw new Error('O saldo inicial deve ser um valor positivo.')

  const entradas = valoresPorFormaVazios()
  const saidas = valoresPorFormaVazios()

  for (const movimento of movimentos) {
    const valor = moeda(Number(movimento.valor))
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Todo movimento deve ter valor maior que zero.')
    if (movimento.natureza === 'ENTRADA') entradas[movimento.forma] = moeda(entradas[movimento.forma] + valor)
    else saidas[movimento.forma] = moeda(saidas[movimento.forma] + valor)
  }

  const liquido = valoresPorFormaVazios()
  for (const forma of FORMAS_CAIXA) liquido[forma] = moeda(entradas[forma] - saidas[forma])
  const totalEntradas = moeda(FORMAS_CAIXA.reduce((total, forma) => total + entradas[forma], 0))
  const totalSaidas = moeda(FORMAS_CAIXA.reduce((total, forma) => total + saidas[forma], 0))

  return {
    entradas,
    saidas,
    liquido,
    totalEntradas,
    totalSaidas,
    resultadoLiquido: moeda(totalEntradas - totalSaidas),
    dinheiroEsperado: moeda(abertura + liquido.DINHEIRO),
  }
}

export function calcularDiferencaCaixa(valorContado: number, dinheiroEsperado: number) {
  const contado = moeda(Number(valorContado))
  const esperado = moeda(Number(dinheiroEsperado))
  if (![contado, esperado].every(Number.isFinite) || contado < 0) throw new Error('Informe um valor contado valido.')
  return moeda(contado - esperado)
}

export function moeda(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}
