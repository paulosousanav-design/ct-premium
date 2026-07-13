import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const masterPassword = process.env.MASTER_UNLOCK_PASSWORD

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'os')
    if (!auth.ok) return auth.response

    if (!supabaseUrl || !serviceRoleKey || !masterPassword) {
      return NextResponse.json(
        { error: 'Configuração do servidor ausente.' },
        { status: 500 }
      )
    }

    const body = await request.json().catch(() => null)
    const osId = Number(body?.osId)
    const senha = String(body?.senha ?? '')

    if (!osId || !senha) {
      return NextResponse.json(
        { error: 'Dados inválidos.' },
        { status: 400 }
      )
    }

    if (senha !== masterPassword) {
      return NextResponse.json(
        { error: 'Senha master inválida.' },
        { status: 401 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { error: updateError } = await supabase
      .from('ordens_servico')
      .update({
        bloqueada: false,
      })
      .eq('id', osId)

    if (updateError) throw updateError

    const { error: historicoError } = await supabase.from('os_historico').insert({
      os_id: osId,
      acao: 'DESBLOQUEIO_MASTER',
      descricao: 'OS desbloqueada com senha master.',
      responsavel: `${auth.nome} (${auth.email})`,
    })

    if (historicoError) throw historicoError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao desbloquear OS:', error)
    return NextResponse.json(
      { error: 'Erro ao desbloquear a OS.' },
      { status: 500 }
    )
  }
}
