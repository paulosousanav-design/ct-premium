export type EntradaBaixaRecebimento = {
  total: number
  recebidoAtual: number
  descontoAtual: number
  issRetidoAtual: number
  principal: number
  desconto: number
  juros: number
  multa: number
  issRetido: number
}

export type ResultadoBaixaRecebimento = {
  saldoAtual: number
  recebido: number
  desconto: number
  issRetido: number
  juros: number
  multa: number
  entradaCaixa: number
  saldoRestante: number
  status: 'PARCIAL' | 'RECEBIDO'
}

export function calcularBaixaRecebimento(input: EntradaBaixaRecebimento): ResultadoBaixaRecebimento {
  const total = moeda(input.total)
  const recebidoAtual = moeda(input.recebidoAtual)
  const descontoAtual = moeda(input.descontoAtual)
  const issRetidoAtual = moeda(input.issRetidoAtual)
  const principal = moeda(input.principal)
  const descontoLancado = moeda(input.desconto)
  const juros = moeda(input.juros)
  const multa = moeda(input.multa)
  const issRetidoLancado = moeda(input.issRetido)
  const saldoAtual = moeda(Math.max(total - recebidoAtual - descontoAtual - issRetidoAtual, 0))

  if (total <= 0) throw new Error('OS sem valor para recebimento.')
  if ([input.principal, input.desconto, input.juros, input.multa, input.issRetido].some((valor) => !Number.isFinite(Number(valor)) || Number(valor) < 0)) {
    throw new Error('Valores do recebimento devem ser positivos.')
  }
  if (principal + descontoLancado + issRetidoLancado <= 0) {
    throw new Error('Informe principal, desconto ou ISS retido.')
  }
  if (principal + descontoLancado + issRetidoLancado > saldoAtual + 0.009) {
    throw new Error('O valor da baixa ultrapassa o saldo da OS.')
  }

  const recebido = moeda(Math.min(total, recebidoAtual + principal))
  const desconto = moeda(Math.min(total, descontoAtual + descontoLancado))
  const issRetido = moeda(Math.min(total, issRetidoAtual + issRetidoLancado))
  const saldoRestante = moeda(Math.max(total - recebido - desconto - issRetido, 0))

  return {
    saldoAtual,
    recebido,
    desconto,
    issRetido,
    juros,
    multa,
    entradaCaixa: moeda(principal + juros + multa),
    saldoRestante,
    status: saldoRestante <= 0.009 ? 'RECEBIDO' : 'PARCIAL',
  }
}

export function moeda(value: unknown) {
  const numero = Number(value ?? 0)
  if (!Number.isFinite(numero)) return 0
  return Math.round((numero + Number.EPSILON) * 100) / 100
}
