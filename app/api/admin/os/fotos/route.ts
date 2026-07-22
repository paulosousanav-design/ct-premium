import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAX_FOTOS = 10
const MAX_BYTES = 8 * 1024 * 1024

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(request: NextRequest) {
  const caminhosEnviados: string[] = []
  try {
    const auth = await requireAdminUnidade(request, 'os')
    if (!auth.ok) return auth.response
    const formData = await request.formData()
    const osId = Number(formData.get('osId'))
    const arquivos = formData.getAll('fotos').filter((item): item is File => item instanceof File && item.size > 0)
    if (!osId) return NextResponse.json({ error: 'Informe a OS.' }, { status: 400 })
    if (!arquivos.length) return NextResponse.json({ error: 'Selecione ao menos uma foto.' }, { status: 400 })
    if (arquivos.length > MAX_FOTOS) return NextResponse.json({ error: `Envie no maximo ${MAX_FOTOS} fotos por vez.` }, { status: 400 })
    const invalida = arquivos.find((arquivo) => !arquivo.type.startsWith('image/') || arquivo.size > MAX_BYTES)
    if (invalida) return NextResponse.json({ error: 'Cada arquivo deve ser uma imagem de ate 8 MB.' }, { status: 400 })

    const supabase = db()
    const { data: ordem, error: ordemError } = await supabase.from('ordens_servico')
      .select('id').eq('id', osId).eq('unidade_id', auth.unidadeId).maybeSingle()
    if (ordemError) throw ordemError
    if (!ordem) return NextResponse.json({ error: 'OS nao encontrada nesta unidade.' }, { status: 404 })

    const fotosPendentes: Array<{ os_id: number; nome_arquivo: string; url: string }> = []
    for (const arquivo of arquivos) {
      const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100) || 'foto.jpg'
      const caminho = `${osId}/atendimento/${Date.now()}-${crypto.randomUUID()}-${nomeSeguro}`
      const { error: uploadError } = await supabase.storage.from('os-fotos').upload(
        caminho,
        Buffer.from(await arquivo.arrayBuffer()),
        { contentType: arquivo.type, upsert: false }
      )
      if (uploadError) throw uploadError
      caminhosEnviados.push(caminho)
      const { data: urlData } = supabase.storage.from('os-fotos').getPublicUrl(caminho)
      fotosPendentes.push({
        os_id: osId,
        nome_arquivo: arquivo.name,
        url: urlData.publicUrl,
      })
    }

    const { data: fotosSalvas, error: fotosError } = await supabase.from('os_fotos')
      .insert(fotosPendentes).select('id, nome_arquivo, url, criado_em')
    if (fotosError) throw fotosError

    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: osId,
      acao: 'FOTOS_ADMINISTRATIVO',
      descricao: `Administrativo anexou ${(fotosSalvas ?? []).length} foto(s).`,
      responsavel: `${auth.nome} (${auth.email})`,
    })
    if (historicoError) console.error('Fotos salvas, mas o historico nao foi registrado:', historicoError)
    return NextResponse.json({ ok: true, fotos: fotosSalvas ?? [] })
  } catch (error) {
    if (caminhosEnviados.length && supabaseUrl && serviceRoleKey) {
      await db().storage.from('os-fotos').remove(caminhosEnviados).catch(() => undefined)
    }
    console.error('Erro ao enviar fotos administrativas da OS:', error)
    return NextResponse.json({ error: formatarErro(error, 'Erro ao enviar fotos da OS.') }, { status: 500 })
  }
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const item = error as Record<string, unknown>
    return [item.message, item.details, item.hint].filter(Boolean).map(String).join(' | ') || fallback
  }
  return fallback
}
