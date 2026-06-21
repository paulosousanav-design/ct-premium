import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const empresaPadrao = {
  id: null,
  nome_fantasia: 'Chame o Tecnico',
  razao_social: '',
  cnpj: '',
  whatsapp: '',
  telefone: '',
  email: '',
  site: 'www.chameotecnico.com.br',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  cidade: '',
  estado: '',
  complemento: '',
  chave_pix: '',
  logo_principal_url: '/logo-chame-o-tecnico.png',
  logo_reduzida_url: '/logo-ct.png',
  cor_principal: '#ff6b00',
  cor_secundaria: '#031226',
  texto_garantia:
    'Garantia legal de 90 dias sobre o servico executado e pecas substituidas, conforme condicoes informadas na ordem de servico.',
  texto_entrega:
    'Declaro ter recebido o equipamento/servico nas condicoes descritas nesta ordem de servico.',
  ativa: true,
}

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
    const auth = await requireAdminPermission(request, 'configuracoes')
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await empresasExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json({ data: empresaPadrao, tabelaPendente: true })
    }

    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('ativa', true)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ data: data ?? empresaPadrao, tabelaPendente: false })
  } catch (error) {
    console.error('Erro ao carregar configuracao da empresa:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar configuracao da empresa.') },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'configuracoes')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const supabase = getSupabaseAdmin()
    const tabelaExiste = await empresasExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json(
        { error: "Crie a tabela 'empresas' no Supabase usando o SQL atualizado." },
        { status: 400 }
      )
    }

    const payload = normalizarEmpresa(body)
    const id = Number(body?.id)

    const query = id
      ? supabase.from('empresas').update(payload).eq('id', id)
      : supabase.from('empresas').insert({ ...payload, ativa: true })

    const { data, error } = await query.select('*').single()
    if (error) throw error

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao salvar configuracao da empresa:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao salvar configuracao da empresa.') },
      { status: 500 }
    )
  }
}

async function empresasExiste(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { error } = await supabase.from('empresas').select('id').limit(0)
  return !error
}

function normalizarEmpresa(body: Record<string, unknown> | null) {
  return {
    nome_fantasia: texto(body?.nome_fantasia) || 'Chame o Tecnico',
    razao_social: texto(body?.razao_social) || null,
    cnpj: texto(body?.cnpj) || null,
    whatsapp: texto(body?.whatsapp) || null,
    telefone: texto(body?.telefone) || null,
    email: texto(body?.email) || null,
    site: texto(body?.site) || null,
    cep: texto(body?.cep) || null,
    logradouro: texto(body?.logradouro) || null,
    numero: texto(body?.numero) || null,
    bairro: texto(body?.bairro) || null,
    cidade: texto(body?.cidade) || null,
    estado: texto(body?.estado) || null,
    complemento: texto(body?.complemento) || null,
    chave_pix: texto(body?.chave_pix) || null,
    logo_principal_url: texto(body?.logo_principal_url) || '/logo-chame-o-tecnico.png',
    logo_reduzida_url: texto(body?.logo_reduzida_url) || '/logo-ct.png',
    cor_principal: cor(body?.cor_principal) || '#ff6b00',
    cor_secundaria: cor(body?.cor_secundaria) || '#031226',
    texto_garantia: texto(body?.texto_garantia) || null,
    texto_entrega: texto(body?.texto_entrega) || null,
    ativa: body?.ativa !== false,
    atualizado_em: new Date().toISOString(),
  }
}

function texto(value: unknown) {
  return String(value ?? '').trim()
}

function cor(value: unknown) {
  const result = texto(value)
  return /^#[0-9a-f]{6}$/i.test(result) ? result : ''
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
