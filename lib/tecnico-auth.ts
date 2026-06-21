import { createHash, createHmac, timingSafeEqual } from 'crypto'

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const sessionSecret = process.env.TECNICO_SESSION_SECRET ?? serviceRoleKey

export const tecnicoSessionCookie = 'tecnico_session'

export function hashTecnicoPin(pin: string) {
  return createHash('sha256').update(`${serviceRoleKey}:${pin}`).digest('hex')
}

export function normalizarTelefone(valor?: string | null) {
  return String(valor ?? '').replace(/\D/g, '')
}

export function criarSessaoTecnico(tecnicoId: number) {
  const payload = Buffer.from(
    JSON.stringify({
      tecnicoId,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 15,
    })
  ).toString('base64url')
  const assinatura = assinar(payload)

  return `${payload}.${assinatura}`
}

export function lerSessaoTecnico(token?: string | null) {
  if (!token) return null

  const [payload, assinatura] = token.split('.')
  if (!payload || !assinatura || !assinaturaValida(payload, assinatura)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      tecnicoId?: number
      exp?: number
    }

    if (!data.tecnicoId || !data.exp || data.exp < Date.now()) return null
    return Number(data.tecnicoId)
  } catch {
    return null
  }
}

function assinar(payload: string) {
  return createHmac('sha256', sessionSecret).update(payload).digest('base64url')
}

function assinaturaValida(payload: string, assinatura: string) {
  const esperada = assinar(payload)
  const assinaturaBuffer = Buffer.from(assinatura)
  const esperadaBuffer = Buffer.from(esperada)

  return (
    assinaturaBuffer.length === esperadaBuffer.length &&
    timingSafeEqual(assinaturaBuffer, esperadaBuffer)
  )
}
