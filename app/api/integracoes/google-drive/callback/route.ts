import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  criptografarSegredo,
  localizarOuCriarPasta,
  obterContaGoogle,
  trocarCodigoPorTokens,
  validarEstadoOAuth,
} from '@/lib/google-drive'
import { registrarEventoSistema } from '@/lib/monitoramento'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type Estado = { exp: number; origin: string; redirectUri: string; usuarioEmail: string }

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  let origem = request.nextUrl.origin
  try {
    const erroGoogle = request.nextUrl.searchParams.get('error')
    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    if (!state) throw new Error('Retorno do Google sem estado de seguranca.')
    const payload = validarEstadoOAuth<Estado>(state)
    origem = payload.origin
    if (erroGoogle) throw new Error(`Autorizacao Google cancelada: ${erroGoogle}`)
    if (!code) throw new Error('Google nao retornou o codigo de autorizacao.')

    const tokens = await trocarCodigoPorTokens(code, payload.redirectUri)
    const conta = await obterContaGoogle(tokens.accessToken)
    const pastaPrincipal = await localizarOuCriarPasta(tokens.accessToken, 'Chame o Tecnico - Backups')
    const pastaBanco = await localizarOuCriarPasta(tokens.accessToken, 'Banco de dados', pastaPrincipal.id)
    const pastaStorage = await localizarOuCriarPasta(tokens.accessToken, 'Fotos e documentos', pastaPrincipal.id)
    const { error } = await db().from('backup_configuracoes').upsert({
      id: 1,
      google_refresh_token_criptografado: criptografarSegredo(tokens.refreshToken),
      google_email: conta.user?.emailAddress ?? payload.usuarioEmail,
      google_pasta_id: pastaPrincipal.id,
      google_pasta_banco_id: pastaBanco.id,
      google_pasta_storage_id: pastaStorage.id,
      google_conectado_em: new Date().toISOString(),
      automatico_ativo: false,
      atualizado_em: new Date().toISOString(),
    })
    if (error) throw error
    return NextResponse.redirect(`${origem}/admin/backups?google=conectado`)
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'BACKUP_GOOGLE', gravidade: 'ATENCAO', request })
    const mensagem = encodeURIComponent(error instanceof Error ? error.message : 'Erro ao conectar Google Drive.')
    return NextResponse.redirect(`${origem}/admin/backups?googleErro=${mensagem}`)
  }
}
