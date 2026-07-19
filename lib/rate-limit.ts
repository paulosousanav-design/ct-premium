import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function limitarRotaPublica(
  request: NextRequest,
  namespace: string,
  limite: number,
  janelaSegundos: number
) {
  if (!supabaseUrl || !serviceRoleKey) return null
  const identificador = criarIdentificador(request, namespace)
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabase.rpc('verificar_limite_requisicao', {
    p_chave: identificador,
    p_limite: limite,
    p_janela_segundos: janelaSegundos,
  })

  // A implantacao do SQL pode ocorrer antes da publicacao sem interromper os fluxos atuais.
  if (error) {
    if (!['PGRST202', '42883'].includes(String(error.code))) console.error('Falha no controle de tentativas:', error.message)
    return null
  }

  const resultado = Array.isArray(data) ? data[0] : data
  if (resultado?.permitido !== false) return null
  const segundos = Math.max(Number(resultado?.tentar_novamente_em ?? janelaSegundos), 1)
  return NextResponse.json(
    { error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' },
    { status: 429, headers: { 'Retry-After': String(segundos), 'Cache-Control': 'no-store' } }
  )
}

function criarIdentificador(request: NextRequest, namespace: string) {
  const encaminhado = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = encaminhado || request.headers.get('x-real-ip') || 'ip-indisponivel'
  return `${namespace}:${createHash('sha256').update(ip).digest('hex')}`
}
