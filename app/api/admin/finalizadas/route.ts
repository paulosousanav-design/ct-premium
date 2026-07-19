import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'finalizadas')
    if (!auth.ok) return auth.response
    const supabase = db()
    const [{ data, error }, { data: unidade, error: unidadeError }] = await Promise.all([
      supabase.from('ordens_servico').select(`
        id, numero_os, status, prioridade, modelo, created_at, finalizada_em, garantia, total,
        cliente_total, status_financeiro,
        clientes:cliente_id ( nome ), categorias:categoria_id ( nome ),
        marcas:marca_id ( nome ), parceiros:parceiro_id ( responsavel, nome_fantasia )
      `).eq('status', 'FINALIZADA').eq('unidade_id', auth.unidadeId)
        .order('finalizada_em', { ascending: false, nullsFirst: false }),
      supabase.from('unidades').select('nome_fantasia, tipo').eq('id', auth.unidadeId).maybeSingle(),
    ])
    if (error) throw error
    if (unidadeError) throw unidadeError
    return NextResponse.json({
      data: data ?? [],
      unidadeNome: unidade?.nome_fantasia
        ? `${unidade.tipo === 'MATRIZ' ? 'Matriz' : 'Filial'} — ${unidade.nome_fantasia}`
        : 'Unidade selecionada',
    })
  } catch (error) {
    console.error('Erro ao carregar OS finalizadas:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao carregar as OS finalizadas.' }, { status: 500 })
  }
}
