import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'
import { calcularRateioDespesas } from '@/lib/calculos-rotas'
import { cabecalhosAuditoria, type AtorAuditoria } from '@/lib/auditoria-contexto'
import { registrarEventoSistema } from '@/lib/monitoramento'
import { calcularRotaGoogle, montarEnderecoCliente, montarEnderecoRota } from '@/lib/google-routes'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY
const METODOS = new Set(['IGUAL', 'RECEITA', 'QUILOMETRAGEM'])
const TIPOS_DESPESA = new Set(['COMBUSTIVEL', 'PEDAGIO', 'ALIMENTACAO', 'HOSPEDAGEM', 'ESTACIONAMENTO', 'OUTRA'])
const FINALIDADES = new Set(['COLETA', 'ATENDIMENTO', 'ENTREGA', 'RETORNO', 'OUTRA'])

function getSupabaseAdmin(request?: NextRequest, ator?: AtorAuditoria) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: request && ator ? { headers: cabecalhosAuditoria(request, ator) } : undefined,
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'rotas')
    if (!auth.ok) return auth.response
    const supabase = getSupabaseAdmin()

    if (!(await tabelaExiste(supabase, 'rotas'))) {
      return NextResponse.json({
        estruturaPendente: true,
        rotas: [],
        despesas: [],
        vinculos: [],
        ordensDisponiveis: [],
        tecnicos: [],
        mapasConfigurado: Boolean(googleMapsApiKey),
        calculoKmPendente: true,
      })
    }

    const [calculoKmDisponivel, { data: rotas, error: rotasError }, { data: tecnicos, error: tecnicosError }] = await Promise.all([
      colunaExiste(supabase, 'rotas', 'km_planejado'),
      supabase.from('rotas').select('*').eq('unidade_id', auth.unidadeId).order('data_inicio', { ascending: false }).limit(150),
      supabase.from('parceiros').select('id, responsavel, nome_fantasia, tipo_vinculo, status').eq('status', 'ATIVO').order('responsavel'),
    ])
    if (rotasError) throw rotasError
    if (tecnicosError) throw tecnicosError

    const rotaIds = (rotas ?? []).map((item) => Number(item.id))
    const [{ data: despesas, error: despesasError }, { data: vinculos, error: vinculosError }] = rotaIds.length
      ? await Promise.all([
          supabase.from('rota_despesas').select('*').in('rota_id', rotaIds).order('data_despesa'),
          supabase.from('rota_ordens').select('*').in('rota_id', rotaIds).order('vinculado_em'),
        ])
      : [{ data: [], error: null }, { data: [], error: null }]
    if (despesasError) throw despesasError
    if (vinculosError) throw vinculosError

    const osVinculadasIds = [...new Set((vinculos ?? []).map((item) => Number(item.os_id)))]
    const { data: ordensVinculadas, error: vinculadasError } = osVinculadasIds.length
      ? await supabase
          .from('ordens_servico')
          .select('id, numero_os, status, modelo, cliente_total, total, clientes:cliente_id(nome), garantidores:garantidor_id(nome)')
          .in('id', osVinculadasIds)
      : { data: [], error: null }
    if (vinculadasError) throw vinculadasError

    const { data: ordensBase, error: ordensError } = await supabase
      .from('ordens_servico')
      .select('id, numero_os, status, modelo, cliente_total, total, clientes:cliente_id(nome), garantidores:garantidor_id(nome)')
      .eq('unidade_id', auth.unidadeId)
      .not('status', 'eq', 'ENCERRADA_SEM_REPARO')
      .order('created_at', { ascending: false })
      .limit(500)
    if (ordensError) throw ordensError

    const ordensMap = new Map((ordensVinculadas ?? []).map((item) => [Number(item.id), item]))
    const vinculosComOrdem = (vinculos ?? []).map((item) => ({ ...item, ordem: ordensMap.get(Number(item.os_id)) ?? null }))

    return NextResponse.json({
      estruturaPendente: false,
      rotas: rotas ?? [],
      despesas: despesas ?? [],
      vinculos: vinculosComOrdem,
      ordensDisponiveis: ordensBase ?? [],
      tecnicos: tecnicos ?? [],
      mapasConfigurado: Boolean(googleMapsApiKey),
      calculoKmPendente: !calculoKmDisponivel,
    })
  } catch (error) {
    return NextResponse.json({ error: formatarErro(error, 'Erro ao carregar gestao de rotas.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'rotas')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const acao = String(body?.acao ?? '').toUpperCase()
    const supabase = getSupabaseAdmin(request, auth)

    if (!(await tabelaExiste(supabase, 'rotas'))) {
      return NextResponse.json({ error: 'Execute o arquivo supabase-add-gestao-rotas.sql no Supabase.' }, { status: 400 })
    }

    if (acao === 'CRIAR') {
      const origem = texto(body?.origem)
      const destino = texto(body?.destino)
      const dataInicio = texto(body?.dataInicio)
      const metodoRateio = normalizar(body?.metodoRateio, METODOS, 'RECEITA')
      if (!origem || !destino || !dataInicio) {
        return NextResponse.json({ error: 'Informe origem, destino e data inicial.' }, { status: 400 })
      }
      const { data: rota, error } = await supabase.from('rotas').insert({
        unidade_id: auth.unidadeId,
        origem,
        destino,
        data_inicio: dataInicio,
        data_fim: texto(body?.dataFim) || null,
        parceiro_id: numeroPositivo(body?.parceiroId) || null,
        motorista_nome: texto(body?.motoristaNome) || null,
        veiculo: texto(body?.veiculo) || null,
        km_total: numeroNaoNegativo(body?.kmTotal),
        metodo_rateio: metodoRateio,
        observacao: texto(body?.observacao) || null,
        criado_por_nome: auth.nome,
        criado_por_email: auth.email,
      }).select('id').single()
      if (error) throw error
      const numeroRota = `RT${new Date(`${dataInicio}T12:00:00`).getFullYear()}${String(rota.id).padStart(5, '0')}`
      const { error: numeroError } = await supabase.from('rotas').update({ numero_rota: numeroRota }).eq('id', rota.id)
      if (numeroError) throw numeroError
      return NextResponse.json({ ok: true, id: rota.id, numeroRota })
    }

    const rotaId = numeroPositivo(body?.rotaId)
    if (!rotaId) return NextResponse.json({ error: 'Rota invalida.' }, { status: 400 })
    const rota = await carregarRotaAutorizada(supabase, rotaId, auth.unidadeId)
    if (!rota) return NextResponse.json({ error: 'Rota nao encontrada nesta unidade.' }, { status: 404 })

    if (acao === 'INICIAR_ROTA') {
      if (rota.status !== 'PLANEJADA') {
        return NextResponse.json({ error: 'Somente uma rota planejada pode ser iniciada.' }, { status: 400 })
      }
      const { count, error: vinculosError } = await supabase
        .from('rota_ordens')
        .select('id', { count: 'exact', head: true })
        .eq('rota_id', rotaId)
      if (vinculosError) throw vinculosError
      if (!count) {
        return NextResponse.json({ error: 'Vincule pelo menos uma OS antes de iniciar a rota.' }, { status: 400 })
      }
      const { error } = await supabase.from('rotas').update({
        status: 'EM_ANDAMENTO',
        atualizado_por_nome: auth.nome,
        atualizado_por_email: auth.email,
        atualizado_em: new Date().toISOString(),
      }).eq('id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (acao === 'CONCLUIR_ROTA') {
      if (rota.status !== 'EM_ANDAMENTO') {
        return NextResponse.json({ error: 'Somente uma rota em andamento pode ser concluida.' }, { status: 400 })
      }
      const dataFim = texto(body?.dataFim)
      const kmTotal = numeroNaoNegativo(body?.kmTotal)
      if (!dataFim) return NextResponse.json({ error: 'Informe a data final da rota.' }, { status: 400 })
      if (dataFim < String(rota.data_inicio)) {
        return NextResponse.json({ error: 'A data final nao pode ser anterior ao inicio da rota.' }, { status: 400 })
      }
      if (kmTotal <= 0) {
        return NextResponse.json({ error: 'Informe a quilometragem total realizada para concluir a rota.' }, { status: 400 })
      }
      const { data: vinculos, error: vinculosError } = await supabase
        .from('rota_ordens')
        .select('id, km_referencia')
        .eq('rota_id', rotaId)
      if (vinculosError) throw vinculosError
      if (!vinculos?.length) {
        return NextResponse.json({ error: 'Vincule pelo menos uma OS antes de concluir a rota.' }, { status: 400 })
      }
      if (String(rota.metodo_rateio) === 'QUILOMETRAGEM' && vinculos.some((item) => numeroNaoNegativo(item.km_referencia) <= 0)) {
        return NextResponse.json({ error: 'Informe os quilometros de referencia de todas as OS antes de concluir.' }, { status: 400 })
      }
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      const { error } = await supabase.from('rotas').update({
        status: 'CONCLUIDA',
        data_fim: dataFim,
        km_total: kmTotal,
        atualizado_por_nome: auth.nome,
        atualizado_por_email: auth.email,
        atualizado_em: new Date().toISOString(),
      }).eq('id', rotaId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (acao === 'CANCELAR_ROTA') {
      if (rota.status === 'CONCLUIDA') {
        return NextResponse.json({ error: 'Reabra a rota concluida antes de cancela-la.' }, { status: 400 })
      }
      if (rota.status === 'CANCELADA') {
        return NextResponse.json({ error: 'Esta rota ja esta cancelada.' }, { status: 400 })
      }
      const { error } = await supabase.from('rotas').update({
        status: 'CANCELADA',
        atualizado_por_nome: auth.nome,
        atualizado_por_email: auth.email,
        atualizado_em: new Date().toISOString(),
      }).eq('id', rotaId)
      if (error) throw error
      const { error: rateioError } = await supabase.from('rota_ordens').update({
        percentual_rateio: 0,
        custo_rateado: 0,
      }).eq('rota_id', rotaId)
      if (rateioError) throw rateioError
      return NextResponse.json({ ok: true })
    }

    if (acao === 'REABRIR_ROTA') {
      if (!['CONCLUIDA', 'CANCELADA'].includes(String(rota.status))) {
        return NextResponse.json({ error: 'Esta rota nao esta encerrada.' }, { status: 400 })
      }
      const { error } = await supabase.from('rotas').update({
        status: rota.status === 'CONCLUIDA' ? 'EM_ANDAMENTO' : 'PLANEJADA',
        data_fim: rota.status === 'CONCLUIDA' ? null : rota.data_fim,
        atualizado_por_nome: auth.nome,
        atualizado_por_email: auth.email,
        atualizado_em: new Date().toISOString(),
      }).eq('id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (['CONCLUIDA', 'CANCELADA'].includes(String(rota.status))) {
      return NextResponse.json({ error: 'A rota esta encerrada. Reabra-a antes de fazer alteracoes.' }, { status: 400 })
    }

    if (acao === 'CALCULAR_DISTANCIA') {
      if (!googleMapsApiKey) {
        return NextResponse.json({ error: 'Configure GOOGLE_MAPS_API_KEY no ambiente do servidor.' }, { status: 400 })
      }
      if (!(await colunaExiste(supabase, 'rotas', 'km_planejado'))) {
        return NextResponse.json({ error: 'Execute o arquivo supabase-add-calculo-km-rotas.sql no Supabase.' }, { status: 400 })
      }
      const retornaOrigem = body?.retornaOrigem !== false
      const { data: vinculos, error: vinculosError } = await supabase
        .from('rota_ordens')
        .select('id, os_id')
        .eq('rota_id', rotaId)
        .order('id')
      if (vinculosError) throw vinculosError
      if (!vinculos?.length) {
        return NextResponse.json({ error: 'Vincule pelo menos uma OS para calcular a rota.' }, { status: 400 })
      }
      const osIds = vinculos.map((item) => Number(item.os_id))
      const { data: ordens, error: ordensError } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, clientes:cliente_id(logradouro, numero, bairro, cidade, estado, cep)')
        .in('id', osIds)
      if (ordensError) throw ordensError
      const ordensMap = new Map((ordens ?? []).map((item) => [Number(item.id), item]))
      const paradas = vinculos.map((vinculo) => {
        const ordem = ordensMap.get(Number(vinculo.os_id))
        const clienteRelacao = ordem?.clientes
        const cliente = (Array.isArray(clienteRelacao) ? clienteRelacao[0] : clienteRelacao) as {
          logradouro?: unknown
          numero?: unknown
          bairro?: unknown
          cidade?: unknown
          estado?: unknown
          cep?: unknown
        } | null | undefined
        const endereco = cliente ? montarEnderecoCliente(cliente) : ''
        if (!cliente?.logradouro || !cliente?.cidade || !cliente?.estado) {
          throw new Error(`Complete o endereco do cliente da ${ordem?.numero_os ?? `OS #${vinculo.os_id}`} antes de calcular a rota.`)
        }
        return {
          vinculoId: Number(vinculo.id),
          osId: Number(vinculo.os_id),
          numeroOs: String(ordem?.numero_os ?? `OS #${vinculo.os_id}`),
          endereco,
        }
      })
      const origem = montarEnderecoRota(rota.origem)
      const destino = retornaOrigem ? origem : montarEnderecoRota(rota.destino)
      const resultado = await calcularRotaGoogle({
        apiKey: googleMapsApiKey,
        origem,
        destino,
        paradas,
      })

      for (const parada of paradas) {
        const { error } = await supabase.from('rota_ordens').update({
          km_referencia: resultado.distanciasPorVinculo.get(parada.vinculoId) ?? 0,
        }).eq('id', parada.vinculoId).eq('rota_id', rotaId)
        if (error) throw error
      }
      const { error: rotaError } = await supabase.from('rotas').update({
        km_planejado: resultado.distanciaKm,
        duracao_planejada_min: resultado.duracaoMinutos,
        retorna_origem: retornaOrigem,
        ordem_otimizada: resultado.ordemOtimizada.map((parada) => parada.osId),
        rota_calculada_em: new Date().toISOString(),
        atualizado_por_nome: auth.nome,
        atualizado_por_email: auth.email,
        atualizado_em: new Date().toISOString(),
      }).eq('id', rotaId)
      if (rotaError) throw rotaError
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({
        ok: true,
        distanciaKm: resultado.distanciaKm,
        duracaoMinutos: resultado.duracaoMinutos,
        ordemOtimizada: resultado.ordemOtimizada.map((parada) => ({
          osId: parada.osId,
          numeroOs: parada.numeroOs,
        })),
      })
    }

    if (acao === 'ATUALIZAR') {
      const metodoRateio = normalizar(body?.metodoRateio, METODOS, String(rota.metodo_rateio ?? 'RECEITA'))
      const payload: Record<string, unknown> = {
        metodo_rateio: metodoRateio,
        atualizado_por_nome: auth.nome,
        atualizado_por_email: auth.email,
        atualizado_em: new Date().toISOString(),
      }
      if (body?.origem !== undefined) payload.origem = texto(body.origem) || rota.origem
      if (body?.destino !== undefined) payload.destino = texto(body.destino) || rota.destino
      if (body?.dataInicio !== undefined) payload.data_inicio = texto(body.dataInicio) || rota.data_inicio
      if (body?.dataFim !== undefined) payload.data_fim = texto(body.dataFim) || null
      if (body?.parceiroId !== undefined) payload.parceiro_id = numeroPositivo(body.parceiroId) || null
      if (body?.motoristaNome !== undefined) payload.motorista_nome = texto(body.motoristaNome) || null
      if (body?.veiculo !== undefined) payload.veiculo = texto(body.veiculo) || null
      if (body?.kmTotal !== undefined) payload.km_total = numeroNaoNegativo(body.kmTotal)
      if (body?.observacao !== undefined) payload.observacao = texto(body.observacao) || null
      const { error } = await supabase.from('rotas').update(payload).eq('id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, metodoRateio)
      return NextResponse.json({ ok: true })
    }

    if (acao === 'ADICIONAR_DESPESA') {
      const tipo = normalizar(body?.tipo, TIPOS_DESPESA, 'OUTRA')
      const valor = dinheiro(body?.valor)
      if (valor <= 0) return NextResponse.json({ error: 'Informe um valor de despesa maior que zero.' }, { status: 400 })
      const { error } = await supabase.from('rota_despesas').insert({
        rota_id: rotaId,
        tipo,
        descricao: texto(body?.descricao) || null,
        valor,
        data_despesa: texto(body?.dataDespesa) || new Date().toISOString().slice(0, 10),
        criado_por_nome: auth.nome,
        criado_por_email: auth.email,
      })
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (acao === 'EXCLUIR_DESPESA') {
      const despesaId = numeroPositivo(body?.despesaId)
      if (!despesaId) return NextResponse.json({ error: 'Despesa invalida.' }, { status: 400 })
      const { error } = await supabase.from('rota_despesas').delete().eq('id', despesaId).eq('rota_id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (acao === 'VINCULAR_OS') {
      const osId = numeroPositivo(body?.osId)
      if (!osId) return NextResponse.json({ error: 'Selecione uma ordem de servico.' }, { status: 400 })
      const { data: ordem, error: ordemError } = await supabase.from('ordens_servico')
        .select('id, unidade_id, cliente_total, total').eq('id', osId).maybeSingle()
      if (ordemError) throw ordemError
      if (!ordem || Number(ordem.unidade_id) !== auth.unidadeId) {
        return NextResponse.json({ error: 'OS nao encontrada nesta unidade.' }, { status: 404 })
      }
      const { error } = await supabase.from('rota_ordens').insert({
        rota_id: rotaId,
        os_id: osId,
        finalidade: normalizar(body?.finalidade, FINALIDADES, 'ATENDIMENTO'),
        km_referencia: numeroNaoNegativo(body?.kmReferencia),
        receita_referencia: dinheiro(ordem.cliente_total ?? ordem.total),
        vinculado_por_nome: auth.nome,
        vinculado_por_email: auth.email,
      })
      if (error) {
        if (String(error.code) === '23505') {
          return NextResponse.json({ error: 'Esta OS ja esta vinculada a esta rota.' }, { status: 409 })
        }
        throw error
      }
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (acao === 'ATUALIZAR_KM_OS') {
      const vinculoId = numeroPositivo(body?.vinculoId)
      const { error } = await supabase.from('rota_ordens')
        .update({ km_referencia: numeroNaoNegativo(body?.kmReferencia) })
        .eq('id', vinculoId).eq('rota_id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    if (acao === 'DESVINCULAR_OS') {
      const vinculoId = numeroPositivo(body?.vinculoId)
      const { error } = await supabase.from('rota_ordens').delete().eq('id', vinculoId).eq('rota_id', rotaId)
      if (error) throw error
      await recalcularRateio(supabase, rotaId, String(rota.metodo_rateio))
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 })
  } catch (error) {
    await registrarEventoSistema({ error, modulo: 'GESTAO_ROTAS', gravidade: 'CRITICO', request })
    return NextResponse.json({ error: formatarErro(error, 'Erro ao atualizar gestao de rotas.') }, { status: 500 })
  }
}

async function carregarRotaAutorizada(supabase: ReturnType<typeof getSupabaseAdmin>, rotaId: number, unidadeId: number) {
  const { data, error } = await supabase.from('rotas').select('*').eq('id', rotaId).eq('unidade_id', unidadeId).maybeSingle()
  if (error) throw error
  return data
}

async function recalcularRateio(supabase: ReturnType<typeof getSupabaseAdmin>, rotaId: number, metodo: string) {
  const [{ data: despesas, error: despesasError }, { data: vinculos, error: vinculosError }] = await Promise.all([
    supabase.from('rota_despesas').select('valor').eq('rota_id', rotaId),
    supabase.from('rota_ordens').select('id, os_id, km_referencia, receita_referencia').eq('rota_id', rotaId).order('id'),
  ])
  if (despesasError) throw despesasError
  if (vinculosError) throw vinculosError
  if (!vinculos?.length) return

  const osIds = vinculos.map((item) => Number(item.os_id))
  const { data: ordens, error: ordensError } = await supabase
    .from('ordens_servico')
    .select('id, cliente_total, total')
    .in('id', osIds)
  if (ordensError) throw ordensError
  const receitasAtuais = new Map((ordens ?? []).map((item) => [
    Number(item.id),
    dinheiro(item.cliente_total ?? item.total),
  ]))
  const totalDespesas = (despesas ?? []).reduce((acc, item) => acc + Number(item.valor ?? 0), 0)
  const pesos = vinculos.map((item) => metodo === 'QUILOMETRAGEM'
    ? numeroNaoNegativo(item.km_referencia)
    : metodo === 'RECEITA'
      ? receitasAtuais.get(Number(item.os_id)) ?? numeroNaoNegativo(item.receita_referencia)
      : 1)
  const rateio = calcularRateioDespesas(totalDespesas, pesos)

  for (let index = 0; index < vinculos.length; index += 1) {
    const { error } = await supabase.from('rota_ordens').update({
      receita_referencia: receitasAtuais.get(Number(vinculos[index].os_id)) ?? numeroNaoNegativo(vinculos[index].receita_referencia),
      percentual_rateio: rateio[index].percentual,
      custo_rateado: rateio[index].valor,
    }).eq('id', vinculos[index].id)
    if (error) throw error
  }
}

async function tabelaExiste(supabase: ReturnType<typeof getSupabaseAdmin>, tabela: string) {
  const { error } = await supabase.from(tabela).select('id').limit(0)
  return !error
}

async function colunaExiste(supabase: ReturnType<typeof getSupabaseAdmin>, tabela: string, coluna: string) {
  const { error } = await supabase.from(tabela).select(coluna).limit(0)
  return !error
}

function texto(value: unknown) { return String(value ?? '').trim() }
function numeroPositivo(value: unknown) { const numero = Number(value); return Number.isFinite(numero) && numero > 0 ? numero : 0 }
function numeroNaoNegativo(value: unknown) { const numero = Number(value); return Number.isFinite(numero) && numero >= 0 ? numero : 0 }
function dinheiro(value: unknown) { return Math.round(numeroNaoNegativo(value) * 100) / 100 }
function normalizar(value: unknown, opcoes: Set<string>, fallback: string) {
  const normalizado = texto(value).toUpperCase()
  return opcoes.has(normalizado) ? normalizado : fallback
}
function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return fallback
}
