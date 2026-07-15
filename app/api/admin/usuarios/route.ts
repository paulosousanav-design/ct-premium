import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type UsuarioAdminRow = {
  id: number
  auth_user_id: string | null
  nome: string
  email: string
  ativo: boolean
  permissoes: string[]
  unidade_padrao_id?: number | null
  criado_em: string
  atualizado_em: string
}

type VinculoUnidadeRow = { admin_usuario_id: number; unidade_id: number }

const permissoesValidas = new Set([
  'dashboard',
  'os',
  'finalizadas',
  'tecnicos',
  'garantidores',
  'aprovacao',
  'financeiro',
  'vendas',
  'pecas',
  'clientes',
  'usuarios',
  'relatorios',
  'academia',
  'documentos',
  'unidades',
  'configuracoes',
])

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configuracao do Supabase ausente no servidor.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await adminUsuariosExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json({ data: [], tabelaPendente: true })
    }

    const temUnidades = await unidadesExistem(supabase)
    const camposUsuario: string = temUnidades
      ? 'id, auth_user_id, nome, email, ativo, permissoes, unidade_padrao_id, criado_em, atualizado_em'
      : 'id, auth_user_id, nome, email, ativo, permissoes, criado_em, atualizado_em'
    const { data, error } = await supabase
      .from('admin_usuarios')
      .select(camposUsuario)
      .order('nome', { ascending: true })

    if (error) throw error

    const [{ data: unidades }, { data: vinculos }] = temUnidades
      ? await Promise.all([
          supabase.from('unidades').select('id, codigo, tipo, nome_fantasia, ativa').order('tipo').order('nome_fantasia'),
          supabase.from('admin_usuario_unidades').select('admin_usuario_id, unidade_id'),
        ])
      : [{ data: [] }, { data: [] }]
    const vinculosUsuario = (vinculos ?? []) as VinculoUnidadeRow[]
    const usuarios = ((data ?? []) as unknown as UsuarioAdminRow[]).map((usuario) => ({
      ...usuario,
      unidade_ids: vinculosUsuario
        .filter((vinculo) => Number(vinculo.admin_usuario_id) === Number(usuario.id))
        .map((vinculo) => Number(vinculo.unidade_id)),
    }))
    return NextResponse.json({ data: usuarios, tabelaPendente: false, unidadesPendente: !temUnidades, unidades: unidades ?? [] })
  } catch (error) {
    console.error('Erro ao listar usuarios admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao listar usuarios.') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const nome = String(body?.nome ?? '').trim()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const senha = String(body?.senha ?? '').trim()
    const permissoes = normalizarPermissoes(body?.permissoes)
    const ativo = body?.ativo !== false

    if (!nome || !email || !senha) {
      return NextResponse.json({ error: 'Informe nome, e-mail e senha.' }, { status: 400 })
    }

    if (senha.length < 6) {
      return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await adminUsuariosExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json(
        { error: "Crie a tabela 'admin_usuarios' no Supabase usando o SQL atualizado." },
        { status: 400 }
      )
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })

    if (authError && !String(authError.message).toLowerCase().includes('already')) throw authError

    const authUserId = authData.user?.id ?? null
    const temUnidades = await unidadesExistem(supabase)
    const selecaoUnidades = temUnidades ? await normalizarSelecaoUnidades(supabase, body?.unidadeIds, body?.unidadePadraoId) : { ids: [], padraoId: null }
    const camposUsuario: string = temUnidades
      ? 'id, auth_user_id, nome, email, ativo, permissoes, unidade_padrao_id, criado_em, atualizado_em'
      : 'id, auth_user_id, nome, email, ativo, permissoes, criado_em, atualizado_em'
    const payload: Record<string, unknown> = {
      auth_user_id: authUserId,
      nome,
      email,
      ativo,
      permissoes,
      atualizado_em: new Date().toISOString(),
    }
    if (temUnidades) payload.unidade_padrao_id = selecaoUnidades.padraoId
    const { data, error } = await supabase
      .from('admin_usuarios')
      .upsert(payload, { onConflict: 'email' })
      .select(camposUsuario)
      .single()

    if (error) throw error
    if (temUnidades) await salvarVinculosUnidades(supabase, Number((data as unknown as UsuarioAdminRow).id), selecaoUnidades.ids)

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao criar usuario admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao criar usuario.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'usuarios')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const nome = String(body?.nome ?? '').trim()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const permissoes = normalizarPermissoes(body?.permissoes)
    const ativo = body?.ativo !== false

    if (!id || !nome || !email) {
      return NextResponse.json({ error: 'Informe usuario, nome e e-mail.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const temUnidades = await unidadesExistem(supabase)
    const selecaoUnidades = temUnidades ? await normalizarSelecaoUnidades(supabase, body?.unidadeIds, body?.unidadePadraoId) : { ids: [], padraoId: null }
    const camposUsuario: string = temUnidades
      ? 'id, auth_user_id, nome, email, ativo, permissoes, unidade_padrao_id, criado_em, atualizado_em'
      : 'id, auth_user_id, nome, email, ativo, permissoes, criado_em, atualizado_em'
    const payload: Record<string, unknown> = {
      nome,
      email,
      ativo,
      permissoes,
      atualizado_em: new Date().toISOString(),
    }
    if (temUnidades) payload.unidade_padrao_id = selecaoUnidades.padraoId
    const { data, error } = await supabase
      .from('admin_usuarios')
      .update(payload)
      .eq('id', id)
      .select(camposUsuario)
      .single()

    if (error) throw error
    if (temUnidades) await salvarVinculosUnidades(supabase, Number((data as unknown as UsuarioAdminRow).id), selecaoUnidades.ids)

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao atualizar usuario admin:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao atualizar usuario.') },
      { status: 500 }
    )
  }
}

async function adminUsuariosExiste(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { error } = await supabase.from('admin_usuarios').select('id').limit(0)
  return !error
}

async function unidadesExistem(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { error } = await supabase.from('admin_usuario_unidades').select('admin_usuario_id, unidade_id').limit(0)
  if (error) return false
  const { error: colunaError } = await supabase.from('admin_usuarios').select('unidade_padrao_id').limit(0)
  return !colunaError
}

async function normalizarSelecaoUnidades(supabase: ReturnType<typeof getSupabaseAdmin>, value: unknown, padraoValue: unknown) {
  let ids = Array.isArray(value) ? [...new Set(value.map(Number).filter(Boolean))] : []
  const { data: ativas } = await supabase.from('unidades').select('id, tipo').eq('ativa', true)
  const idsAtivas = new Set((ativas ?? []).map((unidade) => Number(unidade.id)))
  ids = ids.filter((id) => idsAtivas.has(id))
  if (!ids.length) {
    const matriz = (ativas ?? []).find((unidade) => unidade.tipo === 'MATRIZ')
    if (matriz) ids = [Number(matriz.id)]
  }
  const padraoInformado = Number(padraoValue)
  return { ids, padraoId: ids.includes(padraoInformado) ? padraoInformado : ids[0] ?? null }
}

async function salvarVinculosUnidades(supabase: ReturnType<typeof getSupabaseAdmin>, usuarioId: number, unidadeIds: number[]) {
  const { error: deleteError } = await supabase.from('admin_usuario_unidades').delete().eq('admin_usuario_id', usuarioId)
  if (deleteError) throw deleteError
  if (!unidadeIds.length) return
  const { error } = await supabase.from('admin_usuario_unidades').insert(unidadeIds.map((unidadeId) => ({ admin_usuario_id: usuarioId, unidade_id: unidadeId })))
  if (error) throw error
}

function normalizarPermissoes(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(String).filter((item) => permissoesValidas.has(item))
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code].filter(Boolean).map(String)
    if (possiveis.length > 0) return possiveis.join(' | ')
  }

  return fallback
}
