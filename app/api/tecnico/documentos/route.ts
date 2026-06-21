import { lerSessaoTecnico, tecnicoSessionCookie } from '@/lib/tecnico-auth'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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
    const tecnicoId = getTecnicoId(request)
    if (!tecnicoId) {
      return NextResponse.json({ error: 'Acesso do tecnico nao autenticado.' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await tecnicoDocumentosExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json({ data: [], tabelaPendente: true })
    }

    let { data, error } = await supabase
      .from('tecnico_documentos')
      .select('id, os_id, tipo, valor, nome_arquivo, url, observacao, status, criado_em, pago_em')
      .eq('parceiro_id', tecnicoId)
      .order('criado_em', { ascending: false })
      .limit(8)

    if (error && String(error.code) === '42703') {
      const fallback = await supabase
        .from('tecnico_documentos')
        .select('id, tipo, valor, nome_arquivo, url, observacao, status, criado_em, pago_em')
        .eq('parceiro_id', tecnicoId)
        .order('criado_em', { ascending: false })
        .limit(8)

      data = (fallback.data ?? []).map((doc) => ({ ...doc, os_id: null })) as unknown as typeof data
      error = fallback.error
    }

    if (error) throw error

    return NextResponse.json({ data: data ?? [], tabelaPendente: false })
  } catch (error) {
    console.error('Erro ao listar documentos do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao listar documentos do tecnico.') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const tecnicoId = Number(formData.get('tecnicoId')) || getTecnicoId(request)
    const osId = Number(formData.get('osId')) || null
    const tipo = String(formData.get('tipo') ?? 'RECIBO').trim().toUpperCase()
    const valor = toNumber(String(formData.get('valor') ?? '0').replace(',', '.'))
    const observacao = String(formData.get('observacao') ?? '').trim()
    const arquivo = formData.get('arquivo')

    if (!tecnicoId) {
      return NextResponse.json({ error: 'Acesso do tecnico nao autenticado.' }, { status: 401 })
    }

    if (!(arquivo instanceof File)) {
      return NextResponse.json({ error: 'Selecione a NF ou recibo para enviar.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await tecnicoDocumentosExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json(
        { error: "Crie a tabela 'tecnico_documentos' no Supabase usando o arquivo supabase-add-chave-pix.sql." },
        { status: 400 }
      )
    }

    const extensao = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'pdf'
    const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '-')
    const bucket = await bucketDocumentosTecnico(supabase)
    const caminho = `${tecnicoId}/${osId ?? 'geral'}/${Date.now()}-${nomeSeguro || `documento.${extensao}`}`
    const buffer = Buffer.from(await arquivo.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(caminho, buffer, {
        contentType: arquivo.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(caminho)
    const insertPayload: Record<string, unknown> = {
      os_id: osId,
      parceiro_id: tecnicoId,
      tipo: ['NF', 'RECIBO'].includes(tipo) ? tipo : 'RECIBO',
      valor,
      nome_arquivo: arquivo.name,
      url: urlData.publicUrl,
      observacao: observacao || null,
      status: 'PENDENTE',
    }

    const { data, error } = await supabase
      .from('tecnico_documentos')
      .insert(insertPayload)
      .select('id, os_id, tipo, valor, nome_arquivo, url, observacao, status, criado_em, pago_em')
      .single()

    if (error && String(error.code) === '42703') {
      delete insertPayload.os_id
      const fallback = await supabase
        .from('tecnico_documentos')
        .insert(insertPayload)
        .select('id, tipo, valor, nome_arquivo, url, observacao, status, criado_em, pago_em')
        .single()

      if (fallback.error) throw fallback.error
      return NextResponse.json({ ok: true, data: fallback.data })
    }

    if (error) throw error

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Erro ao enviar documento do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao enviar documento do tecnico.') },
      { status: 500 }
    )
  }
}

async function tecnicoDocumentosExiste(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { error } = await supabase.from('tecnico_documentos').select('id').limit(0)
  return !error
}

async function bucketDocumentosTecnico(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase.storage.getBucket('tecnico-documentos')
  if (!error && data) return 'tecnico-documentos'
  return 'os-fotos'
}

function getTecnicoId(request: NextRequest) {
  const tecnicoQuery = Number(request.nextUrl.searchParams.get('tecnico'))
  if (tecnicoQuery) return tecnicoQuery

  return lerSessaoTecnico(request.cookies.get(tecnicoSessionCookie)?.value) ?? 0
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0) || 0
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code]
      .filter(Boolean)
      .map(String)

    if (possiveis.length > 0) return possiveis.join(' | ')
  }

  return fallback
}
