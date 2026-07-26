import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

type Gravidade = 'INFO' | 'ATENCAO' | 'CRITICO'
type TipoEvento = 'ERRO' | 'ALERTA' | 'SAUDE'

type RegistrarEventoInput = {
  error?: unknown
  mensagem?: string
  tipo?: TipoEvento
  gravidade?: Gravidade
  modulo: string
  origem?: string
  rota?: string
  metodo?: string
  codigo?: string
  detalhes?: Record<string, unknown> | null
  request?: NextRequest | {
    path?: string
    method?: string
    headers?: Record<string, string | string[] | undefined>
  }
  usuarioNome?: string | null
  usuarioEmail?: string | null
  unidadeId?: number | null
}

export async function registrarEventoSistema(input: RegistrarEventoInput) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null

  const mensagem = mensagemErro(input.error, input.mensagem ?? 'Erro inesperado.')
  const codigo = input.codigo ?? codigoErro(input.error)
  const rota = input.rota ?? rotaRequest(input.request)
  const metodo = input.metodo ?? metodoRequest(input.request)
  const headers = headersRequest(input.request)
  const unidadeCabecalho = Number(valorHeader(headers, 'x-unidade-id'))
  const ip = valorHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim()
    || valorHeader(headers, 'x-real-ip')
    || null
  const detalhes = limparDetalhes({
    ...input.detalhes,
    stack: stackErro(input.error),
  })
  const fingerprint = criarFingerprint({
    modulo: input.modulo,
    origem: input.origem ?? 'API',
    rota,
    codigo,
    mensagem,
  })

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) => fetch(url, {
          ...options,
          signal: AbortSignal.timeout(5_000),
        }),
      },
    })
    const { data, error } = await supabase.rpc('registrar_evento_sistema', {
      p_fingerprint: fingerprint,
      p_tipo: input.tipo ?? 'ERRO',
      p_gravidade: input.gravidade ?? 'ATENCAO',
      p_modulo: normalizarModulo(input.modulo),
      p_origem: input.origem ?? 'API',
      p_rota: rota || null,
      p_metodo: metodo || null,
      p_codigo: codigo || null,
      p_mensagem: mensagem,
      p_detalhes: detalhes,
      p_unidade_id: input.unidadeId || unidadeCabecalho || null,
      p_usuario_nome: input.usuarioNome || null,
      p_usuario_email: input.usuarioEmail || null,
      p_ip: ip,
    })
    if (error && !['PGRST202', '42883', '42P01', 'PGRST205'].includes(String(error.code))) {
      console.error('Falha ao registrar monitoramento:', error.message)
    }
    return error ? null : Number(data) || null
  } catch {
    return null
  }
}

export function criarFingerprint(input: {
  modulo: string
  origem?: string
  rota?: string
  codigo?: string
  mensagem: string
}) {
  const base = [
    normalizarModulo(input.modulo),
    String(input.origem ?? 'API').toUpperCase(),
    normalizarRotaFingerprint(input.rota ?? ''),
    String(input.codigo ?? '').toUpperCase(),
    normalizarMensagemFingerprint(input.mensagem),
  ].join('|')
  return createHash('sha256').update(base).digest('hex')
}

export function normalizarMensagemFingerprint(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '#')
    .replace(/\b\d{3,}\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function normalizarRotaFingerprint(value: string) {
  return String(value ?? '')
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/#')
    .replace(/\/\d{3,}(?=\/|$)/g, '/#')
}

function mensagemErro(error: unknown, fallback: string) {
  if (error instanceof Error) return limparTextoSensivel(error.message || fallback)
  if (error && typeof error === 'object' && 'message' in error) return limparTextoSensivel(String(error.message || fallback))
  return limparTextoSensivel(fallback)
}

function codigoErro(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const objeto = error as Record<string, unknown>
  return String(objeto.code ?? objeto.digest ?? '').slice(0, 100)
}

function stackErro(error: unknown) {
  if (!(error instanceof Error) || !error.stack) return null
  return limparTextoSensivel(error.stack.split('\n').slice(0, 20).join('\n')).slice(0, 6_000)
}

function limparTextoSensivel(value: string) {
  return value
    .replace(/(authorization|token|password|senha|secret|service_role)\s*[:=]\s*[^\s,;]+/gi, '$1=[REMOVIDO]')
    .replace(/([?&](?:token|key|senha|password|secret)=)[^&\s]+/gi, '$1[REMOVIDO]')
    .slice(0, 6_000)
}

function limparDetalhes(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value, (chave, item) => {
    if (/senha|password|token|secret|service.?role|authorization|portal_pin/i.test(chave)) return '[REMOVIDO]'
    if (typeof item === 'string') return limparTextoSensivel(item)
    return item
  })) as Record<string, unknown>
}

function normalizarModulo(value: string) {
  return String(value || 'SISTEMA').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80)
}

function rotaRequest(request: RegistrarEventoInput['request']) {
  if (!request) return ''
  if ('nextUrl' in request) return request.nextUrl.pathname
  return String(request.path ?? '').split('?')[0]
}

function metodoRequest(request: RegistrarEventoInput['request']) {
  if (!request) return ''
  return String(request.method ?? '').toUpperCase()
}

function headersRequest(request: RegistrarEventoInput['request']) {
  if (!request) return null
  if ('nextUrl' in request) return request.headers
  return request.headers ?? null
}

function valorHeader(headers: Headers | Record<string, string | string[] | undefined> | null, chave: string) {
  if (!headers) return ''
  if (headers instanceof Headers) return headers.get(chave) ?? ''
  const valor = headers[chave] ?? headers[chave.toLowerCase()]
  return Array.isArray(valor) ? String(valor[0] ?? '') : String(valor ?? '')
}
