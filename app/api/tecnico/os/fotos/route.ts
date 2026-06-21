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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const osId = Number(formData.get('osId'))
    const tecnicoId = Number(formData.get('tecnicoId')) || getTecnicoId(request)
    const arquivos = formData.getAll('fotos').filter((item): item is File => item instanceof File)

    if (!osId || !tecnicoId) {
      return NextResponse.json({ error: 'Informe OS e tecnico autenticado.' }, { status: 400 })
    }

    if (arquivos.length === 0) {
      return NextResponse.json({ error: 'Selecione ao menos uma foto.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: osAtual, error: osError } = await supabase
      .from('ordens_servico')
      .select('id, parceiro_id')
      .eq('id', osId)
      .eq('parceiro_id', tecnicoId)
      .maybeSingle()

    if (osError) throw osError
    if (!osAtual) {
      return NextResponse.json({ error: 'OS nao localizada para este tecnico.' }, { status: 404 })
    }

    const fotosSalvas = []

    for (const [index, arquivo] of arquivos.entries()) {
      const extensao = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'jpg'
      const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '-')
      const caminho = `${osId}/tecnico/${Date.now()}-${index}-${nomeSeguro || `foto.${extensao}`}`
      const buffer = Buffer.from(await arquivo.arrayBuffer())

      const { error: uploadError } = await supabase.storage
        .from('os-fotos')
        .upload(caminho, buffer, {
          contentType: arquivo.type || 'image/jpeg',
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('os-fotos').getPublicUrl(caminho)
      const { data: foto, error: fotoError } = await supabase
        .from('os_fotos')
        .insert({
          os_id: osId,
          nome_arquivo: arquivo.name,
          url: urlData.publicUrl,
        })
        .select('id, nome_arquivo, url, criado_em')
        .single()

      if (fotoError) throw fotoError
      fotosSalvas.push(foto)
    }

    await supabase.from('os_historico').insert({
      os_id: osId,
      acao: 'FOTOS_TECNICO',
      descricao: `Tecnico anexou ${fotosSalvas.length} foto(s).`,
      responsavel: `Tecnico #${tecnicoId}`,
    })

    return NextResponse.json({ ok: true, fotos: fotosSalvas })
  } catch (error) {
    console.error('Erro ao enviar fotos do tecnico:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao enviar fotos da OS.') },
      { status: 500 }
    )
  }
}

function getTecnicoId(request: NextRequest) {
  const tecnicoQuery = Number(request.nextUrl.searchParams.get('tecnico'))
  if (tecnicoQuery) return tecnicoQuery

  return lerSessaoTecnico(request.cookies.get(tecnicoSessionCookie)?.value) ?? 0
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
