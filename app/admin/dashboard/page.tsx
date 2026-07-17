'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/admin-fetch'
import { getAdminActorLabel } from '@/lib/admin-actor'
import { getUnidadeGerencialId, getUnidadesPermitidasIds } from '@/lib/unidade-client'

type DashboardStats = {
  osNovas: number
  emTriagem: number
  emAtendimento: number
  aguardandoRevisao: number
  aguardandoPeca: number
  criticas: number
  parceirosAtivos: number
  parceirosPendentes: number
  clientes: number
  notificacoes: number
  ordensTotal: number
  finalizadas: number
  encerradasSemReparo: number
  osSemTecnico3Dias: number
  orcamentosPendentes: number
  aReceberCliente: number
  recebidoCliente: number
  aReceberGarantidor: number
  recebidoGarantidor: number
  recebidoTotal: number
  aPagarTecnico: number
  ticketMedioMargem: number
  estoqueBaixo: number
  slaParticularPercentual: number
  slaGarantiaPercentual: number
  slaParticularForaPrazo: number
  slaGarantiaForaPrazo: number
}

type OrdemResumo = {
  id: number
  numero_os: string | null
  status: string | null
  prioridade: string | null
  created_at: string
}

type HistoricoResumo = {
  id: number
  os_id: number | null
  acao: string | null
  status_anterior: string | null
  status_novo: string | null
  prioridade_anterior: string | null
  prioridade_nova: string | null
  descricao: string | null
  responsavel: string | null
  criado_em: string | null
}

type VolumeDia = {
  dia: string
  valor: number
}

type ParceiroResumo = {
  status?: string | null
}

type GarantidorFiltro = {
  id: number
  nome: string | null
}

type FiltroOrigemDashboard = 'TODOS' | 'CLIENTE' | 'GARANTIDOR'

const STATUS_RAPIDOS = [
  { value: 'NOVA', label: 'Nova', className: 'border-slate-300 text-slate-700 hover:bg-slate-50', icon: UserIcon },
  { value: 'EM_TRIAGEM', label: 'Triagem', className: 'border-amber-300 text-amber-700 hover:bg-amber-50', icon: ListIcon },
  { value: 'EM_ATENDIMENTO', label: 'Atendimento', className: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50', icon: WrenchIcon },
  { value: 'PRONTO_AGUARDANDO_ENTREGA', label: 'Pronto/entrega', className: 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600', icon: CheckIcon },
  { value: 'AGUARDANDO_PECA', label: 'Aguard. Peça', className: 'border-violet-300 text-violet-700 hover:bg-violet-50', icon: SettingsIcon },
  { value: 'CRITICA', label: 'Crítica', className: 'border-red-500 bg-red-500 text-white hover:bg-red-600', icon: AlertIcon },
  { value: 'FINALIZADA', label: 'Finalizar', className: 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600', icon: CheckIcon },
] as const

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

async function contarTabela(table: string) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

function aplicarFiltroOrigemQuery<T>(query: T, filtro: FiltroOrigemDashboard): T {
  const builder = query as T & {
    eq: (column: string, value: unknown) => T
    or: (filters: string) => T
  }

  if (filtro === 'CLIENTE') return builder.or('garantia.is.false,garantia.is.null')
  if (filtro === 'GARANTIDOR') return builder.eq('garantia', true)
  return query
}

function aplicarFiltroGarantidorQuery<T>(query: T, garantidorId: string): T {
  if (garantidorId === 'TODOS') return query

  const builder = query as T & {
    eq: (column: string, value: unknown) => T
  }

  return builder.eq('garantidor_id', Number(garantidorId))
}

function aplicarEscopoUnidadeQuery<T>(query: T, unidadeId: number | null, unidadesPermitidas: number[]): T {
  const builder = query as T & {
    eq: (column: string, value: unknown) => T
    in: (column: string, values: number[]) => T
  }
  return unidadeId
    ? builder.eq('unidade_id', unidadeId)
    : builder.in('unidade_id', unidadesPermitidas)
}

export default function DashboardPage() {
  const router = useRouter()

  const [stats, setStats] = useState<DashboardStats>({
    osNovas: 0,
    emTriagem: 0,
    emAtendimento: 0,
    aguardandoRevisao: 0,
    aguardandoPeca: 0,
    criticas: 0,
    parceirosAtivos: 0,
    parceirosPendentes: 0,
    clientes: 0,
    notificacoes: 0,
    ordensTotal: 0,
    finalizadas: 0,
    encerradasSemReparo: 0,
    osSemTecnico3Dias: 0,
    orcamentosPendentes: 0,
    aReceberCliente: 0,
    recebidoCliente: 0,
    aReceberGarantidor: 0,
    recebidoGarantidor: 0,
    recebidoTotal: 0,
    aPagarTecnico: 0,
    ticketMedioMargem: 0,
    estoqueBaixo: 0,
    slaParticularPercentual: 0,
    slaGarantiaPercentual: 0,
    slaParticularForaPrazo: 0,
    slaGarantiaForaPrazo: 0,
  })

  const [volume, setVolume] = useState<VolumeDia[]>(DIAS.map((dia) => ({ dia, valor: 0 })))
  const [ultimasOs, setUltimasOs] = useState<OrdemResumo[]>([])
  const [historico, setHistorico] = useState<HistoricoResumo[]>([])
  const [osMap, setOsMap] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [salvandoStatusId, setSalvandoStatusId] = useState<number | null>(null)
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigemDashboard>('TODOS')
  const [filtroGarantidor, setFiltroGarantidor] = useState('TODOS')
  const [garantidoresFiltro, setGarantidoresFiltro] = useState<GarantidorFiltro[]>([])

  const carregarDashboard = useCallback(async () => {
    setLoading(true)
    setErro('')

    try {
      const unidadeId = getUnidadeGerencialId()
      const unidadesPermitidas = getUnidadesPermitidasIds()
      const countOsSemTecnico3Dias = async () => {
        try {
          let query = supabase
            .from('ordens_servico')
            .select('*', { count: 'exact', head: true })
            .is('parceiro_id', null)
            .lte('created_at', limiteSemTecnico.toISOString())
            .not('status', 'in', '("FINALIZADA","CANCELADA","ENCERRADA_SEM_REPARO")')

          query = aplicarFiltroOrigemQuery(query, filtroOrigem)
          query = aplicarFiltroGarantidorQuery(query, filtroGarantidor)
          query = aplicarEscopoUnidadeQuery(query, unidadeId, unidadesPermitidas)

          const { count } = await query
          return count ?? 0
        } catch {
          return 0
        }
      }
      const countOrcamentosPendentes = async () => {
        try {
          let query = supabase
            .from('ordens_servico')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'AGUARDANDO_APROVACAO')

          query = aplicarFiltroOrigemQuery(query, filtroOrigem)
          query = aplicarFiltroGarantidorQuery(query, filtroGarantidor)
          query = aplicarEscopoUnidadeQuery(query, unidadeId, unidadesPermitidas)

          const { count } = await query
          return count ?? 0
        } catch {
          return 0
        }
      }
      const carregarResumoParceiros = async () => {
        try {
          const response = await adminFetch('/api/admin/parceiros')
          const data = await response.json().catch(() => null)

          if (!response.ok) return { total: 0, pendentes: 0 }

          const parceiros = Array.isArray(data?.data) ? (data.data as ParceiroResumo[]) : []

          return {
            total: parceiros.length,
            pendentes: parceiros.filter((parceiro) => (parceiro.status ?? 'ATIVO').toUpperCase() === 'PENDENTE')
              .length,
          }
        } catch {
          return { total: 0, pendentes: 0 }
        }
      }
      const carregarResumoEscopo = async () => {
        try {
          let query = supabase
            .from('ordens_servico')
            .select('cliente_id, parceiro_id')
            .limit(5000)
          query = aplicarEscopoUnidadeQuery(query, unidadeId, unidadesPermitidas)
          const { data, error } = await query
          if (error) throw error
          return {
            clientes: new Set((data ?? []).map((item) => Number(item.cliente_id)).filter(Boolean)).size,
            tecnicos: new Set((data ?? []).map((item) => Number(item.parceiro_id)).filter(Boolean)).size,
          }
        } catch {
          return { clientes: 0, tecnicos: 0 }
        }
      }
      const limiteSemTecnico = new Date()
      limiteSemTecnico.setDate(limiteSemTecnico.getDate() - 3)

      const [
        resumoEscopo,
        notificacoes,
        osSemTecnico3Dias,
        orcamentosPendentes,
        parceirosResumo,
        relatoriosResumo,
        garantidoresResumo,
      ] = await Promise.all([
        carregarResumoEscopo(),
        contarTabela('notificacoes').catch(() => 0),
        countOsSemTecnico3Dias(),
        countOrcamentosPendentes(),
        carregarResumoParceiros(),
        carregarResumoRelatorios(filtroOrigem, filtroGarantidor),
        carregarGarantidoresFiltro(),
      ])

      let ultimasOsQuery = supabase
        .from('ordens_servico')
        .select('id, numero_os, status, prioridade, created_at')
        .order('created_at', { ascending: false })
        .limit(8)

      ultimasOsQuery = aplicarFiltroOrigemQuery(ultimasOsQuery, filtroOrigem)
      ultimasOsQuery = aplicarFiltroGarantidorQuery(ultimasOsQuery, filtroGarantidor)
      ultimasOsQuery = aplicarEscopoUnidadeQuery(ultimasOsQuery, unidadeId, unidadesPermitidas)

      const { data: ultimasOsData, error: ultimasOsError } = await ultimasOsQuery

      if (ultimasOsError) throw ultimasOsError

      const { data: historicoData, error: historicoError } = await supabase
        .from('os_historico')
        .select(`
          id,
          os_id,
          acao,
          status_anterior,
          status_novo,
          prioridade_anterior,
          prioridade_nova,
          descricao,
          responsavel,
          criado_em
        `)
        .order('criado_em', { ascending: false })
        .limit(100)

      if (historicoError) throw historicoError

      let volumeQuery = supabase
        .from('ordens_servico')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .limit(500)

      volumeQuery = aplicarFiltroOrigemQuery(volumeQuery, filtroOrigem)
      volumeQuery = aplicarFiltroGarantidorQuery(volumeQuery, filtroGarantidor)
      volumeQuery = aplicarEscopoUnidadeQuery(volumeQuery, unidadeId, unidadesPermitidas)

      const { data: volumeData, error: volumeError } = await volumeQuery

      if (volumeError) throw volumeError

      const base = new Map<string, number>()
      const hoje = new Date()

      for (let i = 6; i >= 0; i--) {
        const data = new Date(hoje)
        data.setDate(hoje.getDate() - i)
        base.set(data.toISOString().slice(0, 10), 0)
      }

      ;(volumeData ?? []).forEach((item) => {
        const chave = new Date(item.created_at).toISOString().slice(0, 10)
        if (base.has(chave)) {
          base.set(chave, (base.get(chave) ?? 0) + 1)
        }
      })

      const volumeArray: VolumeDia[] = Array.from(base.entries()).map(([dataIso, valor]) => {
        const data = new Date(`${dataIso}T00:00:00`)
        const diaIndex = data.getDay() === 0 ? 6 : data.getDay() - 1
        return { dia: DIAS[diaIndex] ?? 'Dia', valor }
      })

      const map = new Map<number, string>()
      ;(ultimasOsData ?? []).forEach((os) => {
        if (os.id && os.numero_os) map.set(os.id, os.numero_os)
      })

      setOsMap(map)
      setStats({
        osNovas: relatoriosResumo.osNovas,
        emTriagem: relatoriosResumo.emTriagem,
        emAtendimento: relatoriosResumo.emAtendimento,
        aguardandoRevisao: relatoriosResumo.aguardandoRevisao,
        aguardandoPeca: relatoriosResumo.aguardandoPeca,
        criticas: relatoriosResumo.criticas,
        parceirosAtivos: resumoEscopo.tecnicos,
        parceirosPendentes: parceirosResumo.pendentes,
        clientes: resumoEscopo.clientes,
        notificacoes,
        ordensTotal: relatoriosResumo.ordensTotal,
        finalizadas: relatoriosResumo.finalizadas,
        encerradasSemReparo: relatoriosResumo.encerradasSemReparo,
        osSemTecnico3Dias,
        orcamentosPendentes,
        aReceberCliente: relatoriosResumo.aReceberCliente,
        recebidoCliente: relatoriosResumo.recebidoCliente,
        aReceberGarantidor: relatoriosResumo.aReceberGarantidor,
        recebidoGarantidor: relatoriosResumo.recebidoGarantidor,
        recebidoTotal: relatoriosResumo.recebidoTotal,
        aPagarTecnico: relatoriosResumo.aPagarTecnico,
        ticketMedioMargem: relatoriosResumo.ticketMedioMargem,
        estoqueBaixo: relatoriosResumo.estoqueBaixo,
        slaParticularPercentual: relatoriosResumo.slaParticularPercentual,
        slaGarantiaPercentual: relatoriosResumo.slaGarantiaPercentual,
        slaParticularForaPrazo: relatoriosResumo.slaParticularForaPrazo,
        slaGarantiaForaPrazo: relatoriosResumo.slaGarantiaForaPrazo,
      })
      setVolume(volumeArray)
      setUltimasOs((ultimasOsData ?? []) as OrdemResumo[])
      const idsEscopo = new Set((volumeData ?? []).map((item) => Number(item.id)))
      setHistorico(((historicoData ?? []) as HistoricoResumo[]).filter((item) => item.os_id && idsEscopo.has(Number(item.os_id))).slice(0, 6))
      setGarantidoresFiltro(garantidoresResumo)
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao carregar o dashboard.'))
    } finally {
      setLoading(false)
    }
  }, [filtroGarantidor, filtroOrigem])

  useEffect(() => {
    // Carrega os dados iniciais e os recarrega quando os filtros mudam.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregarDashboard()

    let atualizacaoPendente: ReturnType<typeof setTimeout> | null = null

    function agendarAtualizacao() {
      if (atualizacaoPendente) clearTimeout(atualizacaoPendente)
      atualizacaoPendente = setTimeout(() => void carregarDashboard(), 250)
    }

    function atualizarAoVoltar() {
      if (document.visibilityState === 'visible') agendarAtualizacao()
    }

    window.addEventListener('focus', agendarAtualizacao)
    document.addEventListener('visibilitychange', atualizarAoVoltar)
    const atualizacaoAutomatica = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregarDashboard()
    }, 60_000)

    return () => {
      window.removeEventListener('focus', agendarAtualizacao)
      document.removeEventListener('visibilitychange', atualizarAoVoltar)
      window.clearInterval(atualizacaoAutomatica)
      if (atualizacaoPendente) clearTimeout(atualizacaoPendente)
    }
  }, [carregarDashboard])

  async function atualizarStatusRapido(osId: number, novoStatus: string) {
    setSalvandoStatusId(osId)
    setErro('')

    try {
      const unidadeId = getUnidadeGerencialId()
      const unidadesPermitidas = getUnidadesPermitidasIds()
      let osAtualQuery = supabase
        .from('ordens_servico')
        .select('id, numero_os, status, prioridade')
        .eq('id', osId)
      osAtualQuery = aplicarEscopoUnidadeQuery(osAtualQuery, unidadeId, unidadesPermitidas)
      const { data: osAtual, error: osAtualError } = await osAtualQuery.maybeSingle()

      if (osAtualError) throw osAtualError
      if (!osAtual) throw new Error('OS não encontrada.')

      const statusAnterior = osAtual.status ?? 'NOVA'
      const prioridadeAnterior = osAtual.prioridade ?? 'NORMAL'

      let updateQuery = supabase
        .from('ordens_servico')
        .update({ status: novoStatus })
        .eq('id', osId)
      updateQuery = aplicarEscopoUnidadeQuery(updateQuery, unidadeId, unidadesPermitidas)
      const { error: updateError } = await updateQuery

      if (updateError) throw updateError

      if (statusAnterior !== novoStatus) {
        const responsavel = await getAdminActorLabel()
        const { error: historicoError } = await supabase.from('os_historico').insert({
          os_id: osId,
          acao: 'ALTERACAO_STATUS',
          status_anterior: statusAnterior,
          status_novo: novoStatus,
          prioridade_anterior: prioridadeAnterior,
          prioridade_nova: prioridadeAnterior,
          descricao: `Status alterado de ${statusAnterior} para ${novoStatus}`,
          responsavel,
        })

        if (historicoError) throw historicoError
      }

      await carregarDashboard()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao atualizar status.'))
    } finally {
      setSalvandoStatusId(null)
    }
  }

  const volumeMax = useMemo(() => Math.max(...volume.map((v) => v.valor), 1), [volume])

  return (
    <main className="min-h-screen w-full bg-slate-100 px-4 py-4 md:px-6">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard Admin</h1>
            <p className="text-slate-500">Bem-vindo ao CT Premium</p>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {[
                { value: 'TODOS', label: 'Todos' },
                { value: 'CLIENTE', label: 'Particular' },
                { value: 'GARANTIDOR', label: 'Garantia' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setFiltroOrigem(item.value as FiltroOrigemDashboard)
                    if (item.value === 'CLIENTE') setFiltroGarantidor('TODOS')
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-black transition ${
                    filtroOrigem === item.value
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <select
              value={filtroGarantidor}
              onChange={(event) => {
                setFiltroGarantidor(event.target.value)
                if (event.target.value !== 'TODOS') setFiltroOrigem('GARANTIDOR')
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm outline-none focus:border-orange-500"
            >
              <option value="TODOS">Todos os garantidores</option>
              {garantidoresFiltro.map((garantidor) => (
                <option key={garantidor.id} value={garantidor.id}>
                  {garantidor.nome ?? `Garantidor #${garantidor.id}`}
                </option>
              ))}
            </select>

          <div className="flex gap-3">
            <button
              onClick={() => router.push('/admin/os')}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              <FilePlusIcon className="h-4 w-4" />
              Nova OS
            </button>

            <button
              onClick={carregarDashboard}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              <RefreshIcon className="h-4 w-4" />
              Atualizar
            </button>
          </div>
          </div>
        </header>

        {erro && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">
            {erro}
          </div>
        )}

        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <AlertCard
            title="Triagem agora"
            value={loading ? '...' : String(stats.osNovas)}
            detail="OS novas aguardando tratamento"
            onClick={() => router.push('/admin/os')}
            tone={stats.osNovas > 0 ? 'green' : 'slate'}
          />
          <AlertCard
            title="Sem tecnico +3 dias"
            value={loading ? '...' : String(stats.osSemTecnico3Dias)}
            detail="Chamados abertos sem atribuicao"
            onClick={() => router.push('/admin/os')}
            tone={stats.osSemTecnico3Dias > 0 ? 'red' : 'slate'}
          />
          <AlertCard
            title="Aprovacao pendente"
            value={loading ? '...' : String(stats.orcamentosPendentes)}
            detail="Orcamentos aguardando decisao"
            onClick={() => router.push('/admin/aprovacao')}
            tone={stats.orcamentosPendentes > 0 ? 'amber' : 'slate'}
          />
          <AlertCard
            title="Tecnicos pendentes"
            value={loading ? '...' : String(stats.parceirosPendentes)}
            detail="Cadastros aguardando aprovacao"
            onClick={() => router.push('/admin/parceiros?status=PENDENTES')}
            tone={stats.parceirosPendentes > 0 ? 'amber' : 'slate'}
          />
          <AlertCard
            title="Estoque baixo"
            value={loading ? '...' : String(stats.estoqueBaixo)}
            detail="Itens abaixo do minimo"
            onClick={() => router.push('/admin/pecas')}
            tone={stats.estoqueBaixo > 0 ? 'red' : 'slate'}
          />
        </section>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <FinanceMiniCard
            title="SLA particular"
            value={loading ? '...' : `${stats.slaParticularPercentual}% dentro`}
            tone={stats.slaParticularForaPrazo > 0 ? 'amber' : 'green'}
          />
          <FinanceMiniCard
            title="Particular fora SLA"
            value={loading ? '...' : String(stats.slaParticularForaPrazo)}
            tone={stats.slaParticularForaPrazo > 0 ? 'amber' : 'green'}
          />
          <FinanceMiniCard
            title="SLA garantia/seguradora"
            value={loading ? '...' : `${stats.slaGarantiaPercentual}% dentro`}
            tone={stats.slaGarantiaForaPrazo > 0 ? 'amber' : 'green'}
          />
          <FinanceMiniCard
            title="Garantia fora SLA"
            value={loading ? '...' : String(stats.slaGarantiaForaPrazo)}
            tone={stats.slaGarantiaForaPrazo > 0 ? 'amber' : 'green'}
          />
        </section>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          <FinanceMiniCard title="Total recebido" value={formatCurrency(stats.recebidoTotal)} tone="slate" destaque />
          <FinanceMiniCard title="Recebido cliente" value={formatCurrency(stats.recebidoCliente)} tone="green" />
          <FinanceMiniCard title="A receber cliente" value={formatCurrency(stats.aReceberCliente)} tone="orange" />
          <FinanceMiniCard title="A receber garantidor" value={formatCurrency(stats.aReceberGarantidor)} tone="amber" />
          <FinanceMiniCard title="Recebido garantidor" value={formatCurrency(stats.recebidoGarantidor)} tone="green" />
          <FinanceMiniCard title="A pagar tecnico" value={formatCurrency(stats.aPagarTecnico)} tone="blue" />
          <FinanceMiniCard title="Ticket medio margem" value={formatCurrency(stats.ticketMedioMargem)} tone="green" />
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2 shadow-sm sm:p-3">
            <QuickButton label="Nova OS" onClick={() => router.push('/admin/os')} />
            <QuickButton label="Triagem" onClick={() => router.push('/admin/os')} />
            <QuickButton label="Aprovacao" onClick={() => router.push('/admin/aprovacao')} />
            <QuickButton label="Financeiro" onClick={() => router.push('/admin/financeiro')} />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard title="OS Novas" value={loading ? '...' : String(stats.osNovas)} icon={<FileTextIcon />} iconTone="blue" />
          <MetricCard title="Em Triagem" value={loading ? '...' : String(stats.emTriagem)} icon={<ListIcon />} iconTone="amber" />
          <MetricCard title="Em Atendimento" value={loading ? '...' : String(stats.emAtendimento)} icon={<WrenchIcon />} iconTone="green" />
          <MetricCard title="Revisao Admin" value={loading ? '...' : String(stats.aguardandoRevisao)} icon={<BadgeCheckIcon />} iconTone="blue" />
          <MetricCard title="Aguardando Peça" value={loading ? '...' : String(stats.aguardandoPeca)} icon={<SettingsIcon />} iconTone="violet" />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="OS Críticas"
            value={loading ? '...' : String(stats.criticas)}
            tone="critical"
            icon={<AlertIcon />}
            iconTone="red"
          />
          <MetricCard
            title="Tecnicos na unidade"
            value={loading ? '...' : String(stats.parceirosAtivos)}
            icon={<UsersIcon />}
            iconTone="blue"
          />
          <MetricCard
            title="Clientes atendidos"
            value={loading ? '...' : String(stats.clientes)}
            icon={<UsersIcon />}
            iconTone="green"
          />
          <MetricCard
            title="Total de OS"
            value={loading ? '...' : String(stats.ordensTotal)}
            icon={<BadgeCheckIcon />}
            iconTone="slate"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[2fr_1fr_1.2fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Volume de OS</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                Últimos 7 dias
              </span>
            </div>

            <div className="grid grid-cols-7 gap-3">
              {volume.map((item) => (
                <div key={item.dia} className="space-y-2">
                  <div className="text-xs text-slate-500">{item.dia}</div>
                  <div className="flex h-40 items-end rounded-xl bg-slate-50 p-2">
                    <div
                      className="w-full rounded-lg bg-orange-500"
                      style={{ height: `${Math.max((item.valor / volumeMax) * 100, 15)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
              <InfoItem
                label="OS Abertas"
                value={String(Math.max(stats.ordensTotal - stats.finalizadas - stats.encerradasSemReparo, 0))}
              />
              <InfoItem label="OS Finalizadas" value={String(stats.finalizadas)} />
              <InfoItem label="OS Críticas" value={String(stats.criticas)} tone="critical" />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Resumo rápido</h2>
            <div className="space-y-3">
              <LineItem label="Novas" value={stats.osNovas} />
              <LineItem label="Triagem" value={stats.emTriagem} />
              <LineItem label="Atendimento" value={stats.emAtendimento} />
              <LineItem label="Revisao admin" value={stats.aguardandoRevisao} />
              <LineItem label="Aguardando peça" value={stats.aguardandoPeca} />
              <LineItem label="Críticas" value={stats.criticas} tone="critical" />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Linha do tempo recente</h2>

            <div className="max-h-[560px] space-y-4 overflow-y-auto pr-2">
              {historico.map((item) => {
                const numeroOS = item.os_id ? osMap.get(item.os_id) ?? `OS #${item.os_id}` : 'OS'
                const color = getEventColor(item.acao, item.status_novo)

                return (
                  <div key={item.id} className="relative rounded-xl border border-slate-200 p-4 pl-5">
                    <span
                      className="absolute left-2 top-6 h-3 w-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{numeroOS}</p>
                        <p className="text-xs text-slate-500">
                          {item.criado_em ? new Date(item.criado_em).toLocaleString('pt-BR') : ''}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                        {item.acao ?? 'Evento'}
                      </span>
                    </div>

                    {item.descricao && (
                      <p className="mt-3 text-sm text-slate-600">{item.descricao}</p>
                    )}

                    <div className="mt-3 grid gap-2 text-xs text-slate-500">
                      <span>Status: {item.status_anterior ?? '-'} → {item.status_novo ?? '-'}</span>
                      <span>
                        Prioridade: {item.prioridade_anterior ?? '-'} → {item.prioridade_nova ?? '-'}
                      </span>
                    </div>
                  </div>
                )
              })}

              {!historico.length && (
                <p className="text-sm text-slate-500">Nenhum histórico registrado ainda.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Últimas Ordens de Serviço</h2>
            <button
              onClick={() => router.push('/admin/os')}
              className="text-sm font-medium text-orange-500"
            >
              Ver todas
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3">OS</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Prioridade</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ultimasOs.map((os) => (
                  <tr key={os.id} className="border-t">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{os.numero_os ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">{os.status ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">{os.prioridade ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(os.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                        <button
                          onClick={() => router.push(`/admin/os/${os.id}`)}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                        >
                          <ArrowRightLeftIcon className="h-3.5 w-3.5" />
                          Abrir
                        </button>

                        {STATUS_RAPIDOS.map((status) => {
                          const Icon = status.icon
                          return (
                            <button
                              key={status.value}
                              onClick={() => atualizarStatusRapido(os.id, status.value)}
                              disabled={salvandoStatusId === os.id}
                              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${status.className}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {salvandoStatusId === os.id ? '...' : status.label}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                ))}

                {!ultimasOs.length && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                      Nenhuma OS encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function MetricCard({
  title,
  value,
  icon,
  iconTone = 'slate',
  tone = 'default',
}: {
  title: string
  value: string
  icon: ReactNode
  iconTone?: 'blue' | 'amber' | 'green' | 'violet' | 'red' | 'slate'
  tone?: 'default' | 'critical'
}) {
  const critical = tone === 'critical'

  const iconWrap =
    iconTone === 'blue'
      ? 'bg-blue-50 text-blue-500'
      : iconTone === 'amber'
        ? 'bg-amber-50 text-amber-500'
        : iconTone === 'green'
          ? 'bg-green-50 text-green-500'
          : iconTone === 'violet'
            ? 'bg-violet-50 text-violet-500'
            : iconTone === 'red'
              ? 'bg-red-50 text-red-500'
              : 'bg-slate-50 text-slate-500'

  return (
    <div
      className={`min-w-0 rounded-xl bg-white p-3 shadow-sm sm:rounded-2xl sm:p-5 ${
        critical ? 'border border-red-200 bg-red-50/60' : ''
      }`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${iconWrap}`}>
          {icon}
        </div>

        <div className="min-w-0">
          <p className={`text-xs leading-tight sm:text-sm ${critical ? 'text-red-700' : 'text-slate-500'}`}>{title}</p>
          <p className={`mt-1 break-words text-xl font-bold leading-tight sm:text-2xl ${critical ? 'text-red-600' : 'text-slate-900'}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

function AlertCard({
  title,
  value,
  detail,
  onClick,
  tone,
}: {
  title: string
  value: string
  detail: string
  onClick: () => void
  tone: 'green' | 'amber' | 'red' | 'slate'
}) {
  const colors = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-white text-slate-900',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-xl border px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 sm:px-4 sm:py-3 ${colors[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase leading-tight opacity-70 sm:text-xs">{title}</p>
          <p className="mt-1 break-words text-xl font-black leading-tight sm:text-2xl">{value}</p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-white/70 px-2 py-1 text-[10px] font-black sm:inline">Abrir</span>
      </div>
      <p className="mt-1 text-[11px] font-semibold leading-tight opacity-80 sm:text-xs">{detail}</p>
    </button>
  )
}

function FinanceMiniCard({
  title,
  value,
  tone,
  destaque = false,
}: {
  title: string
  value: string
  tone: 'orange' | 'amber' | 'blue' | 'green' | 'slate'
  destaque?: boolean
}) {
  const colors = {
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    slate: 'border-slate-200 bg-white text-slate-900',
  }

  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2.5 shadow-sm sm:px-4 sm:py-3 ${colors[tone]}`}>
      <p className="text-[10px] font-black uppercase leading-tight opacity-70 sm:text-xs">{title}</p>
      <p className={`${destaque ? 'text-lg sm:text-2xl' : 'text-base sm:text-xl'} mt-1 break-words font-black leading-tight`}>
        {value}
      </p>
    </div>
  )
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-orange-300 hover:text-orange-600"
    >
      {label}
    </button>
  )
}

function InfoItem({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'critical'
}) {
  const critical = tone === 'critical'

  return (
    <div
      className={`rounded-xl bg-slate-50 p-4 ${
        critical ? 'border border-red-200 bg-red-50/60' : ''
      }`}
    >
      <p className={`text-xs uppercase ${critical ? 'text-red-600' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-1 text-lg font-bold ${critical ? 'text-red-600' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  )
}

async function carregarGarantidoresFiltro() {
  try {
    const { data, error } = await supabase
      .from('garantidores')
      .select('id, nome')
      .order('nome', { ascending: true })

    if (error) return []
    return (data ?? []) as GarantidorFiltro[]
  } catch {
    return []
  }
}

async function carregarResumoRelatorios(filtroOrigem: FiltroOrigemDashboard, garantidorId: string) {
  try {
    const hoje = new Date()
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const params = new URLSearchParams({
      inicio: formatDateInput(inicio),
      fim: formatDateInput(hoje),
    })

    if (filtroOrigem === 'CLIENTE') params.set('origemFinanceira', 'CLIENTE')
    if (filtroOrigem === 'GARANTIDOR') params.set('origemFinanceira', 'GARANTIDOR')
    if (garantidorId !== 'TODOS') params.set('garantidor', garantidorId)

    const response = await adminFetch(`/api/admin/relatorios?${params.toString()}`)
    const data = await response.json().catch(() => null)
    const cards = data?.cards ?? {}
    const slaParticular = data?.slaResumo?.particular ?? {}
    const slaGarantia = data?.slaResumo?.garantia ?? {}
    const statusResumo = Array.isArray(data?.statusResumo) ? data.statusResumo : []
    const countStatus = (status: string) =>
      Number(statusResumo.find((item: { status?: string; total?: number }) => item.status === status)?.total ?? 0) || 0

    return {
      osNovas: Number(cards.novas ?? 0) || 0,
      emTriagem: countStatus('EM_TRIAGEM'),
      emAtendimento: countStatus('EM_ATENDIMENTO'),
      prontoEntrega: countStatus('PRONTO_AGUARDANDO_ENTREGA'),
      aguardandoRevisao: countStatus('AGUARDANDO_REVISAO'),
      aguardandoPeca: countStatus('AGUARDANDO_PECA'),
      criticas: countStatus('CRITICA'),
      ordensTotal: Number(cards.totalOs ?? 0) || 0,
      finalizadas: Number(cards.finalizadas ?? 0) || 0,
      encerradasSemReparo: countStatus('ENCERRADA_SEM_REPARO'),
      aReceberCliente: Number(cards.aReceberCliente ?? 0) || 0,
      recebidoCliente: Number(cards.recebidoCliente ?? 0) || 0,
      aReceberGarantidor: Number(cards.aReceberGarantidor ?? 0) || 0,
      recebidoGarantidor: Number(cards.recebidoGarantidor ?? 0) || 0,
      recebidoTotal: Number(cards.recebidoTotal ?? 0) || 0,
      aPagarTecnico: Number(cards.aPagarTecnico ?? 0) || 0,
      ticketMedioMargem: Number(cards.ticketMedioMargem ?? 0) || 0,
      estoqueBaixo: Number(cards.estoqueBaixo ?? 0) || 0,
      slaParticularPercentual: Number(slaParticular.percentualDentro ?? 0) || 0,
      slaGarantiaPercentual: Number(slaGarantia.percentualDentro ?? 0) || 0,
      slaParticularForaPrazo: Number(slaParticular.foraPrazo ?? 0) || 0,
      slaGarantiaForaPrazo: Number(slaGarantia.foraPrazo ?? 0) || 0,
    }
  } catch {
    return {
      osNovas: 0,
      emTriagem: 0,
      emAtendimento: 0,
      aguardandoRevisao: 0,
      aguardandoPeca: 0,
      criticas: 0,
      ordensTotal: 0,
      finalizadas: 0,
      encerradasSemReparo: 0,
      aReceberCliente: 0,
      recebidoCliente: 0,
      aReceberGarantidor: 0,
      recebidoGarantidor: 0,
      recebidoTotal: 0,
      aPagarTecnico: 0,
      ticketMedioMargem: 0,
      estoqueBaixo: 0,
      slaParticularPercentual: 0,
      slaGarantiaPercentual: 0,
      slaParticularForaPrazo: 0,
      slaGarantiaForaPrazo: 0,
    }
  }
}

function LineItem({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'critical'
}) {
  const critical = tone === 'critical'

  return (
    <div
      className={`flex items-center justify-between rounded-xl px-4 py-3 ${
        critical ? 'border border-red-200 bg-red-50' : 'bg-slate-50'
      }`}
    >
      <span className={critical ? 'text-red-700' : 'text-slate-600'}>{label}</span>
      <span className={critical ? 'font-semibold text-red-600' : 'font-semibold text-slate-900'}>
        {value}
      </span>
    </div>
  )
}

function getEventColor(acao: string | null, statusNovo: string | null) {
  if (statusNovo === 'CRITICA' || acao === 'ALERTA') return '#ef4444'
  if (statusNovo === 'AGUARDANDO_PECA') return '#f59e0b'
  if (statusNovo === 'PRONTO_AGUARDANDO_ENTREGA') return '#10b981'
  if (statusNovo === 'EM_ATENDIMENTO') return '#22c55e'
  if (statusNovo === 'EM_TRIAGEM') return '#3b82f6'
  if (statusNovo === 'FINALIZADA') return '#16a34a'
  return '#94a3b8'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatarErro(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err

  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>

    const possiveis = [obj.message, obj.details, obj.hint, obj.code, obj.error, obj.statusText]
      .filter(Boolean)
      .map(String)

    if (possiveis.length > 0) return possiveis.join(' | ')

    try {
      return JSON.stringify(err, null, 2)
    } catch {
      return fallback
    }
  }

  return fallback
}

function SvgIcon({
  children,
  className = 'h-5 w-5',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      {children}
    </svg>
  )
}

function FilePlusIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </SvgIcon>
  )
}

function RefreshIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M21 12a9 9 0 0 0-15-6.7" />
      <path d="M3 4v5h5" />
      <path d="M3 12a9 9 0 0 0 15 6.7" />
      <path d="M21 20v-5h-5" />
    </SvgIcon>
  )
}

function FileTextIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
      <path d="M9 9h2" />
    </SvgIcon>
  )
}

function ListIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </SvgIcon>
  )
}

function WrenchIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6l-2 2-3-3 2-2Z" />
    </SvgIcon>
  )
}

function SettingsIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.65 1.65 0 0 0 1.5-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.69 0 1.25.31 1.5 1H21a2 2 0 1 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1Z" />
    </SvgIcon>
  )
}

function AlertIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </SvgIcon>
  )
}

function UsersIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </SvgIcon>
  )
}

function BadgeCheckIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M12 2l2.6 2 3.4.4 1.6 3 .4 3.4 2 2.6-2 2.6-.4 3.4-3 1.6-3.4.4-2.6 2-2.6-2-3.4-.4-1.6-3-.4-3.4-2-2.6 2-2.6.4-3.4 3-1.6 3.4-.4Z" />
      <path d="m9 12 2 2 4-4" />
    </SvgIcon>
  )
}

function ArrowRightLeftIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="m17 11 4-4-4-4" />
      <path d="M21 7H7" />
      <path d="m7 13-4 4 4 4" />
      <path d="M3 17h14" />
    </SvgIcon>
  )
}

function UserIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </SvgIcon>
  )
}

function CheckIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M20 6 9 17l-5-5" />
    </SvgIcon>
  )
}
