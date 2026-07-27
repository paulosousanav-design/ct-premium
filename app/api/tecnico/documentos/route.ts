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
      .limit(100)

    if (error && String(error.code) === '42703') {
      const fallback = await supabase
        .from('tecnico_documentos')
        .select('id, tipo, valor, nome_arquivo, url, observacao, status, criado_em, pago_em')
        .eq('parceiro_id', tecnicoId)
        .order('criado_em', { ascending: false })
        .limit(100)

      data = (fallback.data ?? []).map((doc) => ({ ...doc, os_id: null })) as unknown as typeof data
      error = fallback.error
    }

    if (error) throw error

    const documentos = (data ?? []) as Array<Record<string, unknown>>
    const idsDocumentos = documentos.map((doc) => Number(doc.id)).filter(Boolean)
    const vinculos = await carregarVinculosDocumentos(supabase, idsDocumentos)
    const osIdsPorDocumento = new Map<number, number[]>()
    for (const vinculo of vinculos.data) {
      const documentoId = Number(vinculo.documento_id)
      const osId = Number(vinculo.os_id)
      if (!documentoId || !osId) continue
      osIdsPorDocumento.set(documentoId, [...(osIdsPorDocumento.get(documentoId) ?? []), osId])
    }

    return NextResponse.json({
      data: documentos.map((doc) => {
        const osIdLegado = Number(doc.os_id)
        const osIds = osIdsPorDocumento.get(Number(doc.id)) ?? (osIdLegado ? [osIdLegado] : [])
        return { ...doc, os_ids: osIds }
      }),
      tabelaPendente: false,
      vinculoMultiploPendente: vinculos.tabelaPendente,
    })
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
    const osIdLegado = Number(formData.get('osId')) || null
    const osIds = Array.from(new Set([
      ...formData.getAll('osIds').map((value) => Number(value)).filter(Boolean),
      ...(osIdLegado ? [osIdLegado] : []),
    ]))
    const osId = osIds[0] ?? null
    const tipo = String(formData.get('tipo') ?? 'NF').trim().toUpperCase()
    const valor = toNumber(String(formData.get('valor') ?? '0').replace(',', '.'))
    const observacao = String(formData.get('observacao') ?? '').trim()
    const arquivo = formData.get('arquivo')

    if (!tecnicoId) {
      return NextResponse.json({ error: 'Acesso do tecnico nao autenticado.' }, { status: 401 })
    }

    if (!(arquivo instanceof File)) {
      return NextResponse.json({ error: 'Selecione a nota fiscal para enviar.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const tabelaExiste = await tecnicoDocumentosExiste(supabase)
    if (!tabelaExiste) {
      return NextResponse.json(
        { error: "Crie a tabela 'tecnico_documentos' no Supabase usando o arquivo supabase-add-chave-pix.sql." },
        { status: 400 }
      )
    }

    if (osIds.length === 0) {
      return NextResponse.json({ error: 'Selecione ao menos uma OS para vincular a nota fiscal.' }, { status: 400 })
    }

    const { data: ordensSelecionadas, error: ordensError } = await supabase
      .from('ordens_servico')
      .select('id, status')
      .eq('parceiro_id', tecnicoId)
      .in('id', osIds)

    if (ordensError) throw ordensError
    if ((ordensSelecionadas ?? []).length !== osIds.length) {
      return NextResponse.json({ error: 'Uma ou mais OS selecionadas nao pertencem a este tecnico.' }, { status: 400 })
    }
    if ((ordensSelecionadas ?? []).some((ordem) => ordem.status !== 'FINALIZADA')) {
      return NextResponse.json({ error: 'A nota fiscal pode ser vinculada somente a OS finalizadas.' }, { status: 400 })
    }

    const vinculoMultiploDisponivel = await tecnicoDocumentosOsExiste(supabase)
    if (osIds.length > 1 && !vinculoMultiploDisponivel) {
      return NextResponse.json(
        { error: "Execute o arquivo 'supabase-add-nf-multiplas-os.sql' no Supabase antes de vincular varias OS." },
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
      tipo: tipo === 'NF' ? 'NF' : 'NF',
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
      return NextResponse.json({ ok: true, data: { ...fallback.data, os_ids: osIds } })
    }

    if (error) throw error

    if (vinculoMultiploDisponivel) {
      const { error: vinculosError } = await supabase
        .from('tecnico_documentos_os')
        .insert(osIds.map((ordemId) => ({ documento_id: data.id, os_id: ordemId })))

      if (vinculosError) throw vinculosError
    }

    return NextResponse.json({ ok: true, data: { ...data, os_ids: osIds } })
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

async function tecnicoDocumentosOsExiste(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { error } = await supabase.from('tecnico_documentos_os').select('documento_id').limit(0)
  return !error
}

async function carregarVinculosDocumentos(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentosIds: number[]
) {
  if (documentosIds.length === 0) return { data: [] as Array<{ documento_id: number; os_id: number }>, tabelaPendente: false }

  const { data, error } = await supabase
    .from('tecnico_documentos_os')
    .select('documento_id, os_id')
    .in('documento_id', documentosIds)

  if (error) {
    if (String(error.code) === '42P01') return { data: [] as Array<{ documento_id: number; os_id: number }>, tabelaPendente: true }
    throw error
  }

  return { data: (data ?? []) as Array<{ documento_id: number; os_id: number }>, tabelaPendente: false }
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
