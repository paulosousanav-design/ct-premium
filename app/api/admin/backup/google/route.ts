import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'
import { executarBackupGoogle } from '@/lib/backup-google'
import { criarEstadoOAuth, criarUrlAutorizacao, googleDriveAmbiente } from '@/lib/google-drive'
import { registrarEventoSistema } from '@/lib/monitoramento'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response
    const supabase = db()
    const { error: estruturaError } = await supabase.from('backup_configuracoes').select('*').limit(0)
    if (estruturaError && ['42P01', 'PGRST205'].includes(String(estruturaError.code))) {
      return NextResponse.json({ estruturaPendente: true, conectado: false, ambienteConfigurado: false })
    }
    if (estruturaError) throw estruturaError

    const redirectUri = `${origemPublica(request)}/api/integracoes/google-drive/callback`
    const ambiente = googleDriveAmbiente()
    const ambienteConfigurado = Boolean(ambiente.clientId && ambiente.clientSecret && ambiente.cronSecret)
    if (request.nextUrl.searchParams.get('acao') === 'autorizar') {
      if (!ambiente.clientId || !ambiente.clientSecret) {
        return NextResponse.json({ error: 'Configure GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET na hospedagem.' }, { status: 400 })
      }
      const state = criarEstadoOAuth({
        exp: Date.now() + 10 * 60_000,
        origin: origemPublica(request),
        redirectUri,
        usuarioEmail: auth.email,
      })
      return NextResponse.json({ url: criarUrlAutorizacao({ state, redirectUri }) })
    }

    const { data, error } = await supabase.from('backup_configuracoes').select(
      'google_email, google_pasta_id, google_conectado_em, automatico_ativo, retencao_dias, ultimo_backup_automatico_em, ultimo_backup_automatico_status, ultimo_backup_automatico_erro'
    ).eq('id', 1).maybeSingle()
    if (error) throw error
    return NextResponse.json({
      estruturaPendente: false,
      ambienteConfigurado,
      cronConfigurado: Boolean(ambiente.cronSecret),
      redirectUri,
      conectado: Boolean(data?.google_email && data?.google_pasta_id),
      configuracao: data ?? null,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'BACKUP_GOOGLE', gravidade: 'ATENCAO', request })
    return NextResponse.json({ error: erro(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response
    const resultado = await executarBackupGoogle(db(), {
      tipo: 'MANUAL',
      responsavelNome: auth.nome,
      responsavelEmail: auth.email,
    })
    return NextResponse.json({ ok: true, resultado })
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'BACKUP_GOOGLE', gravidade: 'CRITICO', request })
    return NextResponse.json({ error: erro(error) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const automaticoAtivo = Boolean(body?.automaticoAtivo)
    const retencaoDias = Math.min(Math.max(Number(body?.retencaoDias) || 30, 7), 365)
    const { error } = await db().from('backup_configuracoes').update({
      automatico_ativo: automaticoAtivo,
      retencao_dias: retencaoDias,
      atualizado_em: new Date().toISOString(),
    }).eq('id', 1)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: erro(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response
    const { error } = await db().from('backup_configuracoes').update({
      google_refresh_token_criptografado: null,
      google_email: null,
      google_pasta_id: null,
      google_pasta_banco_id: null,
      google_pasta_storage_id: null,
      google_conectado_em: null,
      automatico_ativo: false,
      atualizado_em: new Date().toISOString(),
    }).eq('id', 1)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: erro(error) }, { status: 500 })
  }
}

function origemPublica(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const protocolo = request.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https')
  return host ? `${protocolo}://${host}` : request.nextUrl.origin
}

function erro(error: unknown) {
  return error instanceof Error ? error.message : 'Erro na integracao com Google Drive.'
}
