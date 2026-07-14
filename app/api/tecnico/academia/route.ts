import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { lerSessaoTecnico, tecnicoSessionCookie } from '@/lib/tecnico-auth'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!url || !key) throw new Error('Supabase não configurado.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
function tecnicoId(request: NextRequest) { return lerSessaoTecnico(request.cookies.get(tecnicoSessionCookie)?.value) }

export async function GET(request: NextRequest) {
  try {
    const id = tecnicoId(request)
    if (!id) return NextResponse.json({ error: 'Técnico não autenticado.' }, { status: 401 })
    const supabase = db()
    const { error: tabelaError } = await supabase.from('academia_conteudos').select('id').limit(0)
    if (tabelaError) return NextResponse.json({ tabelaPendente: true, conteudos: [], progresso: [] })

    const [{ data: conteudos, error }, { data: destinados }, { data: progresso }] = await Promise.all([
      supabase.from('academia_conteudos').select('id, tipo, titulo, resumo, conteudo, video_url, arquivo_url, destaque, obrigatorio, destinatario_todos, publicado_em, atualizado_em').eq('publicado', true).order('destaque', { ascending: false }).order('publicado_em', { ascending: false }),
      supabase.from('academia_conteudo_tecnicos').select('conteudo_id').eq('parceiro_id', id),
      supabase.from('academia_progresso').select('conteudo_id, visualizado_em, confirmado_em').eq('parceiro_id', id),
    ])
    if (error) throw error
    const permitidos = new Set((destinados ?? []).map((item) => Number(item.conteudo_id)))
    const visiveis = (conteudos ?? []).filter((item) => item.destinatario_todos || permitidos.has(Number(item.id)))
    return NextResponse.json({ tabelaPendente: false, conteudos: visiveis, progresso: progresso ?? [] })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error, 'Erro ao carregar Academia Técnica.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const parceiroId = tecnicoId(request)
    if (!parceiroId) return NextResponse.json({ error: 'Técnico não autenticado.' }, { status: 401 })
    const body = await request.json().catch(() => null)
    const conteudoId = Number(body?.conteudoId)
    const acao = String(body?.acao ?? '').toUpperCase()
    if (!conteudoId || !['VISUALIZAR', 'CONFIRMAR'].includes(acao)) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })

    const agora = new Date().toISOString()
    const supabase = db()
    const { data: conteudo } = await supabase.from('academia_conteudos').select('id, publicado, destinatario_todos').eq('id', conteudoId).maybeSingle()
    if (!conteudo?.publicado) return NextResponse.json({ error: 'Conteúdo indisponível.' }, { status: 404 })
    if (!conteudo.destinatario_todos) {
      const { data: destino } = await supabase.from('academia_conteudo_tecnicos').select('conteudo_id').eq('conteudo_id', conteudoId).eq('parceiro_id', parceiroId).maybeSingle()
      if (!destino) return NextResponse.json({ error: 'Conteúdo não destinado a este técnico.' }, { status: 403 })
    }
    const { data: atual } = await supabase.from('academia_progresso').select('id, visualizado_em, confirmado_em').eq('conteudo_id', conteudoId).eq('parceiro_id', parceiroId).maybeSingle()
    const payload = {
      conteudo_id: conteudoId,
      parceiro_id: parceiroId,
      visualizado_em: atual?.visualizado_em ?? agora,
      confirmado_em: acao === 'CONFIRMAR' ? agora : atual?.confirmado_em ?? null,
      atualizado_em: agora,
    }
    const { error } = await supabase.from('academia_progresso').upsert(payload, { onConflict: 'conteudo_id,parceiro_id' })
    if (error) throw error
    return NextResponse.json({ ok: true, progresso: payload })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error, 'Erro ao registrar progresso.') }, { status: 500 })
  }
}

function mensagem(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
