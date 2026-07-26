import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { executarBackupGoogle } from '@/lib/backup-google'
import { registrarEventoSistema } from '@/lib/monitoramento'

export const maxDuration = 300

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 })
  }
  try {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente.')
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const resultado = await executarBackupGoogle(supabase, {
      tipo: 'AUTOMATICO',
      responsavelNome: 'Automacao do sistema',
      responsavelEmail: 'cron@chameotecnico.com.br',
    })
    return NextResponse.json({ ok: true, resultado })
  } catch (error) {
    await registrarEventoSistema({
      error,
      modulo: 'BACKUP_AUTOMATICO',
      origem: 'CRON',
      gravidade: 'CRITICO',
      request,
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro no backup automatico.' },
      { status: 500 }
    )
  }
}
