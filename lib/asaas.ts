type AsaasEnvironment = 'sandbox' | 'production'

type AsaasErrorPayload = {
  errors?: Array<{ description?: string }>
  message?: string
}

export type AsaasBillingType = 'PIX' | 'BOLETO'

export type AsaasCustomer = { id: string }

export type AsaasSubscription = {
  id: string
  customer: string
  value: number
  cycle: string
  nextDueDate: string
  status?: string
}

export function asaasEnvironment(): AsaasEnvironment {
  return process.env.ASAAS_ENV === 'production' ? 'production' : 'sandbox'
}

export function asaasConfigured() {
  return Boolean(process.env.ASAAS_API_KEY?.trim())
}

export function asaasBaseUrl() {
  return asaasEnvironment() === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3'
}

export async function criarClienteAsaas(input: {
  name: string
  cpfCnpj?: string
  email?: string
  mobilePhone?: string
  externalReference: string
}) {
  return asaasRequest<AsaasCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      cpfCnpj: input.cpfCnpj || undefined,
      email: input.email || undefined,
      mobilePhone: input.mobilePhone || undefined,
      externalReference: input.externalReference,
    }),
  })
}

export async function criarAssinaturaAsaas(input: {
  customer: string
  billingType: AsaasBillingType
  value: number
  nextDueDate: string
  cycle: 'MONTHLY' | 'YEARLY'
  description: string
  externalReference: string
}) {
  return asaasRequest<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

async function asaasRequest<T>(path: string, init: RequestInit) {
  const apiKey = process.env.ASAAS_API_KEY?.trim()
  if (!apiKey) throw new Error('ASAAS_API_KEY nao configurada no servidor.')

  const response = await fetch(`${asaasBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey,
      ...init.headers,
    },
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => null) as AsaasErrorPayload | T | null
  if (!response.ok) {
    const error = payload as AsaasErrorPayload | null
    const description = error?.errors?.map((item) => item.description).filter(Boolean).join(' | ')
      || error?.message
      || `erro HTTP ${response.status}`
    throw new Error(`Asaas: ${description}`)
  }
  return payload as T
}
