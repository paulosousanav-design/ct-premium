import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response
    const supabase = db()

    const { error: tabelaError } = await supabase.from('auditoria_eventos').select('id').limit(0)
    if (tabelaError) {
      if (['42P01', 'PGRST205'].includes(String(tabelaError.code))) {
        return NextResponse.json({
          estruturaPendente: true,
          eventos: [],
          total: 0,
          modulos: [],
          usuarios: [],
          unidades: [],
        })
      }
      throw tabelaError
    }

    const params = request.nextUrl.searchParams
    const pagina = Math.max(Number(params.get('pagina')) || 1, 1)
    const limite = Math.min(Math.max(Number(params.get('limite')) || 50, 10), 100)
    const inicio = (pagina - 1) * limite
    const modulo = textoFiltro(params.get('modulo'))
    const acao = textoFiltro(params.get('acao'))
    const usuario = String(params.get('usuario') ?? '').trim().toLowerCase()
    const unidadeId = Number(params.get('unidadeId')) || 0
    const dataInicio = dataFiltro(params.get('dataInicio'))
    const dataFim = dataFiltro(params.get('dataFim'))
    const busca = textoFiltro(params.get('busca')).replace(/[%(),]/g, ' ').replace(/\s+/g, ' ').trim()

    let query = supabase
      .from('auditoria_eventos')
      .select('*', { count: 'exact' })

    if (modulo) query = query.eq('modulo', modulo)
    if (acao) query = query.eq('acao', acao)
    if (usuario) query = query.eq('usuario_email', usuario)
    if (unidadeId) query = query.eq('unidade_id', unidadeId)
    if (dataInicio) query = query.gte('criado_em', `${dataInicio}T00:00:00`)
    if (dataFim) query = query.lte('criado_em', `${dataFim}T23:59:59.999`)
    if (busca) {
      query = query.or(`descricao.ilike.%${busca}%,entidade_id.ilike.%${busca}%,usuario_nome.ilike.%${busca}%`)
    }

    const { data, error, count } = await query
      .order('criado_em', { ascending: false })
      .range(inicio, inicio + limite - 1)
    if (error) throw error

    const [{ data: modulos }, { data: usuarios }, { data: unidades }] = await Promise.all([
      supabase.from('auditoria_eventos').select('modulo').order('modulo'),
      supabase.from('auditoria_eventos').select('usuario_nome, usuario_email').not('usuario_email', 'is', null).order('usuario_nome'),
      supabase.from('unidades').select('id, codigo, tipo, nome_fantasia').order('tipo').order('nome_fantasia'),
    ])

    return NextResponse.json({
      estruturaPendente: false,
      eventos: data ?? [],
      total: count ?? 0,
      pagina,
      limite,
      modulos: [...new Set((modulos ?? []).map((item) => String(item.modulo)))],
      usuarios: unicosPorEmail(usuarios ?? []),
      unidades: unidades ?? [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao consultar auditoria.' },
      { status: 500 }
    )
  }
}

function textoFiltro(value: string | null) {
  return String(value ?? '').trim().toUpperCase().slice(0, 100)
}

function dataFiltro(value: string | null) {
  const texto = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : ''
}

function unicosPorEmail(itens: Array<{ usuario_nome?: string | null; usuario_email?: string | null }>) {
  const mapa = new Map<string, { nome: string; email: string }>()
  for (const item of itens) {
    const email = String(item.usuario_email ?? '').toLowerCase()
    if (email && !mapa.has(email)) mapa.set(email, { nome: String(item.usuario_nome ?? email), email })
  }
  return [...mapa.values()]
}
