import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const permissoesCliente = ['dashboard', 'os', 'finalizadas', 'tecnicos', 'garantidores', 'aprovacao', 'financeiro', 'dre', 'rotas', 'vendas', 'pecas', 'documentos_fiscais', 'clientes', 'relatorios', 'academia', 'documentos', 'chat']

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuração do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function exigirPlataforma(request: NextRequest) {
  const auth = await requireAdminPermission(request, 'configuracoes')
  if (!auth.ok) return auth
  if (!auth.acessoPlataforma) return { ok: false as const, response: NextResponse.json({ error: 'Acesso restrito à administração da plataforma.' }, { status: 403 }) }
  return auth
}

export async function GET(request: NextRequest) {
  const auth = await exigirPlataforma(request)
  if (!auth.ok) return auth.response
  try {
    const { data, error } = await db().from('saas_organizacoes').select('id, nome, slug, plano, status, criado_em, saas_clientes(nome, email, cnpj)').order('criado_em', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await exigirPlataforma(request)
  if (!auth.ok) return auth.response
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const nome = texto(body?.nome)
    const email = texto(body?.email).toLowerCase()
    const responsavel = texto(body?.responsavel) || nome
    const senha = String(body?.senha ?? '')
    const plano = texto(body?.plano).toUpperCase()
    const cnpj = digitos(texto(body?.cnpj)) || null
    const telefone = digitos(texto(body?.telefone)) || null
    if (nome.length < 3 || !email.includes('@') || senha.length < 8) return NextResponse.json({ error: 'Informe empresa, e-mail válido e uma senha inicial com pelo menos 8 caracteres.' }, { status: 400 })
    if (!['ESSENCIAL', 'PROFISSIONAL', 'COMPLETO'].includes(plano)) return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 })

    const supabase = db()
    const { data: cliente, error: clienteError } = await supabase.from('saas_clientes').upsert({ nome, email, cnpj, telefone, atualizado_em: new Date().toISOString() }, { onConflict: 'email' }).select('id').single()
    if (clienteError) throw clienteError

    const slug = await proximoSlug(supabase, nome)
    const { data: organizacao, error: organizacaoError } = await supabase.from('saas_organizacoes').insert({ cliente_id: cliente.id, nome, slug, plano, status: 'ATIVA' }).select('id').single()
    if (organizacaoError) throw organizacaoError

    const { data: unidade, error: unidadeError } = await supabase.from('unidades').insert({ organizacao_id: organizacao.id, codigo: `CLI-${slug}`.toUpperCase(), tipo: 'EMPRESA', nome_fantasia: nome, razao_social: nome, cnpj, telefone, email, ativa: true, empresa_principal: true }).select('id').single()
    if (unidadeError) throw unidadeError

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome: responsavel } })
    if (authError) throw authError
    const { data: usuario, error: usuarioError } = await supabase.from('admin_usuarios').insert({ auth_user_id: authUser.user.id, organizacao_id: organizacao.id, unidade_padrao_id: unidade.id, nome: responsavel, email, ativo: true, permissoes: permissoesCliente, acesso_plataforma: false, atualizado_em: new Date().toISOString() }).select('id').single()
    if (usuarioError) throw usuarioError
    const { error: vinculoError } = await supabase.from('admin_usuario_unidades').insert({ admin_usuario_id: usuario.id, unidade_id: unidade.id })
    if (vinculoError) throw vinculoError

    return NextResponse.json({ ok: true, organizacaoId: organizacao.id, mensagem: 'Oficina criada e acesso administrativo liberado.' })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error) }, { status: 500 })
  }
}

async function proximoSlug(supabase: ReturnType<typeof db>, nome: string) {
  const base = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 36) || 'oficina'
  let slug = base
  let indice = 2
  while (true) {
    const { data, error } = await supabase.from('saas_organizacoes').select('id').eq('slug', slug).maybeSingle()
    if (error) throw error
    if (!data) return slug
    slug = `${base}-${indice++}`
  }
}

function texto(value: unknown) { return String(value ?? '').trim() }
function digitos(value: string) { return value.replace(/\D/g, '') }
function mensagem(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível criar a oficina cliente.' }
