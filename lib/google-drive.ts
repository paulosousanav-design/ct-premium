import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function googleDriveAmbiente() {
  return {
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? '',
    cronSecret: process.env.CRON_SECRET ?? '',
  }
}

export function criarUrlAutorizacao(input: { state: string; redirectUri: string }) {
  const { clientId } = googleDriveAmbiente()
  if (!clientId) throw new Error('GOOGLE_DRIVE_CLIENT_ID nao configurado.')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: input.state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function trocarCodigoPorTokens(code: string, redirectUri: string) {
  const { clientId, clientSecret } = googleDriveAmbiente()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Google OAuth: ${String(data?.error_description ?? data?.error ?? response.status)}`)
  if (!data?.refresh_token) throw new Error('O Google nao retornou acesso offline. Revogue o acesso anterior e tente conectar novamente.')
  return { accessToken: String(data.access_token), refreshToken: String(data.refresh_token) }
}

export async function renovarAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = googleDriveAmbiente()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.access_token) throw new Error(`Google OAuth: ${String(data?.error_description ?? data?.error ?? response.status)}`)
  return String(data.access_token)
}

export async function obterContaGoogle(accessToken: string) {
  return driveJson<{ user?: { emailAddress?: string; displayName?: string } }>(
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)',
    accessToken
  )
}

export async function localizarOuCriarPasta(accessToken: string, nome: string, parentId?: string | null) {
  const nomeSeguro = nome.replace(/'/g, "\\'")
  const partes = [
    `name = '${nomeSeguro}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    'trashed = false',
  ]
  if (parentId) partes.push(`'${parentId}' in parents`)
  const params = new URLSearchParams({ q: partes.join(' and '), fields: 'files(id,name)', pageSize: '10' })
  const encontrados = await driveJson<{ files?: Array<{ id: string; name: string }> }>(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    accessToken
  )
  if (encontrados.files?.[0]) return encontrados.files[0]

  return driveJson<{ id: string; name: string }>('https://www.googleapis.com/drive/v3/files?fields=id,name', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nome,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  })
}

export async function enviarArquivoDrive(input: {
  accessToken: string
  nome: string
  parentId: string
  conteudo: string | Uint8Array
  contentType: string
  descricao?: string
}) {
  const boundary = `ct_backup_${randomBytes(12).toString('hex')}`
  const metadata = JSON.stringify({
    name: input.nome,
    parents: [input.parentId],
    description: input.descricao ?? 'Backup automatico do Chame o Tecnico',
  })
  const conteudo = typeof input.conteudo === 'string' ? Buffer.from(input.conteudo, 'utf8') : Buffer.from(input.conteudo)
  const corpo = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`),
    conteudo,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  return driveJson<{ id: string; name: string; webViewLink?: string; createdTime?: string }>(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,createdTime',
    input.accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: corpo as unknown as BodyInit,
    }
  )
}

export async function removerBackupsAntigos(accessToken: string, parentId: string, diasRetencao: number) {
  const limite = new Date(Date.now() - diasRetencao * 86_400_000)
  const params = new URLSearchParams({
    q: `'${parentId}' in parents and trashed = false`,
    fields: 'files(id,name,createdTime)',
    pageSize: '1000',
  })
  const resultado = await driveJson<{ files?: Array<{ id: string; name: string; createdTime?: string }> }>(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    accessToken
  )
  let removidos = 0
  for (const arquivo of resultado.files ?? []) {
    if (!arquivo.name.startsWith('backup-chame-o-tecnico-') || !arquivo.createdTime) continue
    if (new Date(arquivo.createdTime) >= limite) continue
    await driveJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(arquivo.id)}`, accessToken, { method: 'DELETE' })
    removidos += 1
  }
  return removidos
}

export function criptografarSegredo(valor: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', chaveCriptografia(), iv)
  const criptografado = Buffer.concat([cipher.update(valor, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${criptografado.toString('base64url')}`
}

export function descriptografarSegredo(valor: string) {
  const [versao, iv, tag, conteudo] = valor.split('.')
  if (versao !== 'v1' || !iv || !tag || !conteudo) throw new Error('Credencial do Google Drive invalida.')
  const decipher = createDecipheriv('aes-256-gcm', chaveCriptografia(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(conteudo, 'base64url')), decipher.final()]).toString('utf8')
}

export function criarEstadoOAuth(payload: Record<string, unknown>) {
  const conteudo = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const assinatura = createHmac('sha256', segredoAssinatura()).update(conteudo).digest('base64url')
  return `${conteudo}.${assinatura}`
}

export function validarEstadoOAuth<T>(state: string): T {
  const [conteudo, assinatura] = state.split('.')
  if (!conteudo || !assinatura) throw new Error('Estado OAuth invalido.')
  const esperada = createHmac('sha256', segredoAssinatura()).update(conteudo).digest()
  const recebida = Buffer.from(assinatura, 'base64url')
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) throw new Error('Assinatura OAuth invalida.')
  const payload = JSON.parse(Buffer.from(conteudo, 'base64url').toString('utf8')) as T & { exp?: number }
  if (!payload.exp || payload.exp < Date.now()) throw new Error('Autorizacao OAuth expirada.')
  return payload
}

async function driveJson<T = unknown>(url: string, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(url, { ...init, headers })
  if (response.status === 204) return null as T
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Google Drive: ${String(data?.error?.message ?? response.status)}`)
  return data as T
}

function chaveCriptografia() {
  const base = process.env.BACKUP_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('BACKUP_ENCRYPTION_KEY nao configurada.')
  return createHash('sha256').update(base).digest()
}

function segredoAssinatura() {
  const base = process.env.BACKUP_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Segredo de assinatura nao configurado.')
  return base
}
