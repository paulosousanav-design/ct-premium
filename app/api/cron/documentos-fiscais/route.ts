import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sincronizarDocumentosDfe } from '@/lib/dfe-sync'
import { registrarEventoSistema } from '@/lib/monitoramento'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }
  try {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuração do Supabase ausente.')
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: configuracoes, error } = await supabase.from('dfe_configuracoes').select('*').eq('consulta_ativa', true).order('unidade_id')
    if (error) {
      if (['42P01', 'PGRST205'].includes(String(error.code))) return NextResponse.json({ ok: true, estruturaPendente: true, resultados: [] })
      throw error
    }
    const resultados: Array<Record<string, unknown>> = []
    for (const configuracao of configuracoes ?? []) {
      try {
        const resultado = await sincronizarDocumentosDfe(supabase, configuracao)
        resultados.push({ unidadeId: configuracao.unidade_id, ok: true, ...resultado })
      } catch (error) {
        resultados.push({ unidadeId: configuracao.unidade_id, ok: false, erro: mensagem(error) })
        await registrarEventoSistema({ error, modulo: 'DOCUMENTOS_FISCAIS', origem: 'CRON', gravidade: 'ATENCAO', request })
      }
    }
    return NextResponse.json({ ok: resultados.every((item) => item.ok), resultados })
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'DOCUMENTOS_FISCAIS', origem: 'CRON', gravidade: 'CRITICO', request })
    return NextResponse.json({ error: mensagem(error) }, { status: 500 })
  }
}

function mensagem(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Erro na consulta automática de documentos fiscais.'
}
