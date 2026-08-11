import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuração do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'clientes')
    if (!auth.ok) return auth.response

    const busca = String(request.nextUrl.searchParams.get('busca') ?? '').trim()
    if (busca.length < 2) return NextResponse.json({ equipamentos: [] })

    const supabase = db()
    const termo = escaparFiltro(busca)
    const serieNormalizada = normalizarSerie(busca)

    const [clientesResultado, equipamentosResultado, ordensResultado] = await Promise.all([
      supabase.from('clientes').select('id').or(`nome.ilike.%${termo}%,cpf_cnpj.ilike.%${termo}%,whatsapp.ilike.%${termo}%`).limit(100),
      supabase.from('equipamentos_clientes').select('id').eq('ativo', true).or(`modelo.ilike.%${termo}%,numero_serie.ilike.%${termo}%${serieNormalizada ? `,numero_serie_normalizada.ilike.%${serieNormalizada}%` : ''}`).limit(100),
      supabase.from('ordens_servico').select('equipamento_id').ilike('numero_os', `%${termo}%`).not('equipamento_id', 'is', null).limit(100),
    ])

    for (const resultado of [clientesResultado, equipamentosResultado, ordensResultado]) {
      if (resultado.error) {
        if (['42P01', 'PGRST205'].includes(String(resultado.error.code))) {
          return NextResponse.json({ error: 'Execute o arquivo supabase-add-cadastro-equipamentos-garantia-asc.sql.' }, { status: 503 })
        }
        throw resultado.error
      }
    }

    const clienteIds = (clientesResultado.data ?? []).map((item) => Number(item.id)).filter(Boolean)
    const equipamentoIds = new Set<number>([
      ...(equipamentosResultado.data ?? []).map((item) => Number(item.id)),
      ...(ordensResultado.data ?? []).map((item) => Number(item.equipamento_id)),
    ].filter(Boolean))

    if (clienteIds.length) {
      const { data, error } = await supabase.from('equipamentos_clientes').select('id').eq('ativo', true).in('cliente_id', clienteIds).limit(200)
      if (error) throw error
      for (const item of data ?? []) equipamentoIds.add(Number(item.id))
    }

    if (!equipamentoIds.size) return NextResponse.json({ equipamentos: [] })

    const ids = [...equipamentoIds].slice(0, 100)
    const [{ data: equipamentos, error: equipamentosError }, { data: historico, error: historicoError }] = await Promise.all([
      supabase.from('equipamentos_clientes').select(`
        id, cliente_id, categoria_id, marca_id, modelo, numero_serie, observacao, criado_em,
        categorias:categoria_id(nome), marcas:marca_id(nome),
        clientes:cliente_id(id,nome,cpf_cnpj,whatsapp,email,cep,logradouro,numero,bairro,cidade,estado)
      `).in('id', ids).eq('ativo', true).order('atualizado_em', { ascending: false }),
      supabase.from('ordens_servico').select(`
        id, equipamento_id, numero_os, created_at, finalizada_em, equipamento_entregue_em,
        status, defeito, diagnostico_tecnico, servico_executado
      `).in('equipamento_id', ids).order('created_at', { ascending: false }).limit(1000),
    ])
    if (equipamentosError) throw equipamentosError
    if (historicoError) throw historicoError

    const hoje = Date.now()
    const resultado = (equipamentos ?? []).map((equipamento) => {
      const ordens = (historico ?? []).filter((ordem) => Number(ordem.equipamento_id) === Number(equipamento.id))
      const ultimaFinalizada = ordens.find((ordem) => String(ordem.status ?? '').toUpperCase() === 'FINALIZADA' && Boolean(ordem.finalizada_em))
      const inicioGarantia = ultimaFinalizada ? String(ultimaFinalizada.equipamento_entregue_em ?? ultimaFinalizada.finalizada_em) : null
      const garantiaAte = inicioGarantia ? adicionarDias(inicioGarantia, 90) : null
      return {
        ...equipamento,
        total_os: ordens.length,
        ultima_os: ordens[0]?.numero_os ?? null,
        ultimo_atendimento: ordens[0]?.created_at ?? null,
        status_atual: ordens[0]?.status ?? null,
        garantia_asc: garantiaAte ? {
          ativa: new Date(garantiaAte).getTime() >= hoje,
          ate: garantiaAte,
          origem_os_id: ultimaFinalizada?.id ?? null,
          origem_numero_os: ultimaFinalizada?.numero_os ?? null,
          servico_executado: ultimaFinalizada?.servico_executado ?? null,
        } : null,
        historico: ordens,
      }
    })

    return NextResponse.json({ equipamentos: resultado }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error) }, { status: 500 })
  }
}

function escaparFiltro(valor: string) { return valor.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim() }
function normalizarSerie(valor: string) { return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() }
function adicionarDias(data: string, dias: number) { const valor = new Date(data); valor.setDate(valor.getDate() + dias); return valor.toISOString() }
function mensagem(error: unknown) { return error instanceof Error ? error.message : 'Erro ao buscar equipamentos.' }
