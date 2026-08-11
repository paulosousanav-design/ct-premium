import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configuração do Supabase ausente no servidor.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'os')
    if (!auth.ok) return auth.response

    const clienteId = Number(request.nextUrl.searchParams.get('clienteId'))
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: 'Informe o cliente.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const [clienteResultado, equipamentosResultado] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, nome, cpf_cnpj, whatsapp, email, cep, logradouro, numero, bairro, cidade, estado')
        .eq('id', clienteId)
        .maybeSingle(),
      supabase
        .from('equipamentos_clientes')
        .select(`
        id,
        cliente_id,
        categoria_id,
        marca_id,
        modelo,
        numero_serie,
        observacao,
        ativo,
        criado_em,
        categorias:categoria_id(nome),
        marcas:marca_id(nome)
      `)
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .order('atualizado_em', { ascending: false }),
    ])

    if (clienteResultado.error) throw clienteResultado.error
    const equipamentos = equipamentosResultado.data
    const equipamentosError = equipamentosResultado.error

    if (equipamentosError) {
      if (String(equipamentosError.message ?? '').includes('equipamentos_clientes')) {
        return NextResponse.json(
          { error: 'Execute o arquivo supabase-add-cadastro-equipamentos-garantia-asc.sql.' },
          { status: 503 }
        )
      }
      throw equipamentosError
    }

    const equipamentoIds = (equipamentos ?? []).map((item) => Number(item.id)).filter(Boolean)
    let historico: Array<Record<string, unknown>> = []

    if (equipamentoIds.length > 0) {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select(`
          id,
          equipamento_id,
          numero_os,
          created_at,
          finalizada_em,
          equipamento_entregue_em,
          status,
          defeito,
          diagnostico_tecnico,
          servico_executado,
          garantia_asc
        `)
        .in('equipamento_id', equipamentoIds)
        .order('created_at', { ascending: false })

      if (error) throw error
      historico = (data ?? []) as Array<Record<string, unknown>>
    }

    const hoje = Date.now()
    const resultado = (equipamentos ?? []).map((equipamento) => {
      const ordens = historico.filter((ordem) => Number(ordem.equipamento_id) === Number(equipamento.id))
      const ultimaFinalizada = ordens.find((ordem) =>
        String(ordem.status ?? '').toUpperCase() === 'FINALIZADA' && Boolean(ordem.finalizada_em)
      )
      const inicioGarantia = ultimaFinalizada
        ? String(ultimaFinalizada.equipamento_entregue_em ?? ultimaFinalizada.finalizada_em)
        : null
      const garantiaAte = inicioGarantia ? adicionarDias(inicioGarantia, 90) : null

      return {
        ...equipamento,
        total_os: ordens.length,
        ultima_os: ordens[0]?.numero_os ?? null,
        ultimo_atendimento: ordens[0]?.created_at ?? null,
        garantia_asc: garantiaAte
          ? {
              ativa: new Date(garantiaAte).getTime() >= hoje,
              ate: garantiaAte,
              origem_os_id: ultimaFinalizada?.id ?? null,
              origem_numero_os: ultimaFinalizada?.numero_os ?? null,
              servico_executado: ultimaFinalizada?.servico_executado ?? null,
            }
          : null,
        historico: ordens,
      }
    })

    return NextResponse.json(
      { cliente: clienteResultado.data, equipamentos: resultado },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    console.error('Erro ao carregar equipamentos do cliente:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar equipamentos do cliente.') },
      { status: 500 }
    )
  }
}

function adicionarDias(data: string, dias: number) {
  const valor = new Date(data)
  valor.setDate(valor.getDate() + dias)
  return valor.toISOString()
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    return String(obj.message ?? obj.details ?? obj.hint ?? fallback)
  }
  return fallback
}
