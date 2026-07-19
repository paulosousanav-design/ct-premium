import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const verificacoes = [
  ['clientes', true], ['ordens_servico', true], ['os_historico', true],
  ['admin_usuarios', true], ['unidades', true], ['financeiro_historico', true],
  ['chat_mensagens', false], ['seguranca_rate_limits', false],
] as const

export async function GET(request: NextRequest) {
  const inicio = performance.now()
  try {
    const auth = await requireAdminPermission(request, 'configuracoes')
    if (!auth.ok) return auth.response
    if (!auth.permissoes.includes('usuarios')) return NextResponse.json({ error: 'Diagnostico restrito ao ADM Master.' }, { status: 403 })
    if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ status: 'FALHA', ambiente: { supabaseUrl: Boolean(supabaseUrl), serviceRole: Boolean(serviceRoleKey) }, verificacoes: [], latenciaMs: 0 }, { status: 500 })

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const resultados = await Promise.all(verificacoes.map(async ([tabela, critica]) => {
      const { error } = await supabase.from(tabela).select('id').limit(0)
      return { tabela, critica, ok: !error, erro: error ? String(error.message) : null }
    }))
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    const bucketsEsperados = ['os-fotos', 'tecnico-documentos']
    const storage = bucketsEsperados.map((nome) => ({ nome, ok: !bucketsError && Boolean((buckets ?? []).find((bucket) => bucket.name === nome)) }))
    const falhaCritica = resultados.some((item) => item.critica && !item.ok)
    const atencao = resultados.some((item) => !item.ok) || storage.some((item) => !item.ok)
    return NextResponse.json({
      status: falhaCritica ? 'FALHA' : atencao ? 'ATENCAO' : 'SAUDAVEL',
      ambiente: { supabaseUrl: true, serviceRole: true, nodeEnv: process.env.NODE_ENV ?? 'desconhecido' },
      verificacoes: resultados,
      storage,
      latenciaMs: Math.round(performance.now() - inicio),
      verificadoEm: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro no diagnostico.', status: 'FALHA', latenciaMs: Math.round(performance.now() - inicio) }, { status: 500 })
  }
}
