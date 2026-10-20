import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

const CINCO_MINUTOS = 5 * 60 * 1000

function segredoOtp() {
  const segredo = process.env.TECNICO_OTP_SECRET
    ?? process.env.TECNICO_SESSION_SECRET
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!segredo) throw new Error('Segredo do codigo de acesso nao configurado no servidor.')
  return segredo
}

export function gerarCodigoTecnico() {
  return String(randomInt(100_000, 1_000_000))
}

export function hashCodigoTecnico(codigo: string, parceiroId: number) {
  return createHmac('sha256', segredoOtp())
    .update(`${parceiroId}:${codigo}`)
    .digest('hex')
}

export function codigoTecnicoValido(codigo: string, parceiroId: number, hashEsperado: string) {
  const hashRecebido = hashCodigoTecnico(codigo, parceiroId)
  const recebido = Buffer.from(hashRecebido, 'hex')
  const esperado = Buffer.from(hashEsperado, 'hex')
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
}

export function expiracaoCodigoTecnico(agora = Date.now()) {
  return new Date(agora + CINCO_MINUTOS)
}

export function telefoneWhatsAppInternacional(valor: string) {
  const numeros = valor.replace(/\D/g, '')
  if (numeros.startsWith('55') && (numeros.length === 12 || numeros.length === 13)) return numeros
  if (numeros.length === 10 || numeros.length === 11) return `55${numeros}`
  return numeros
}

