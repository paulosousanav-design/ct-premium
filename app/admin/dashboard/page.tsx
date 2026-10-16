'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminFetch } from '@/lib/admin-fetch'

type DashboardStats = {
  osNovas: number
  emTriagem: number
  emAtendimento: number
  aguardandoRevisao: number
  aguardandoPeca: number
  prontoEntrega: number
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
  cliente_nome?: string | null
  cliente_cidade?: string | null
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
type PeriodoKpi = 'MES_ATUAL' | '30_DIAS' | '90_DIAS'
type TomAndamento = 'blue' | 'amber' | 'emerald' | 'violet' | 'orange' | 'teal' | 'green' | 'rose'
type AndamentoItem = { label: string; value: number; href: string; tone: TomAndamento }

type KpiResumo = {
  slaPercentual: number
  slaAmostras: number
  tempoMedioConclusaoDias: number
  conclusoesAmostras: number
  aprovacaoPercentual: number
  aprovacoes: number
  decisoesOrcamento: number
  produtividadeMedia: number
  tecnicosAtivos: number
  tecnicoDestaque: { nome: string; total: number } | null
  ticketMedio: number
  ticketAmostras: number
}

type KpiMetas = {
  metaSlaPercentual: number
  metaConclusaoDias: number
  metaAprovacaoPercentual: number
  metaProdutividade: number
  metaTicket: number
}

const KPI_VAZIO: KpiResumo = {
  slaPercentual: 0,
  slaAmostras: 0,
  tempoMedioConclusaoDias: 0,
  conclusoesAmostras: 0,
  aprovacaoPercentual: 0,
  aprovacoes: 0,
  decisoesOrcamento: 0,
  produtividadeMedia: 0,
  tecnicosAtivos: 0,
  tecnicoDestaque: null,
  ticketMedio: 0,
  ticketAmostras: 0,
}

const KPI_METAS_PADRAO: KpiMetas = {
  metaSlaPercentual: 90,
  metaConclusaoDias: 5,
  metaAprovacaoPercentual: 70,
  metaProdutividade: 10,
  metaTicket: 500,
}

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

export default function DashboardPage() {
  const router = useRouter()

  const [stats, setStats] = useState<DashboardStats>({
    osNovas: 0,
    emTriagem: 0,
    emAtendimento: 0,
    aguardandoRevisao: 0,
    aguardandoPeca: 0,
    prontoEntrega: 0,
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
  const [periodoKpi, setPeriodoKpi] = useState<PeriodoKpi>('MES_ATUAL')
  const [kpis, setKpis] = useState<KpiResumo>(KPI_VAZIO)
  const [metasKpi, setMetasKpi] = useState<KpiMetas>(KPI_METAS_PADRAO)
  const [metasEdicao, setMetasEdicao] = useState<KpiMetas>(KPI_METAS_PADRAO)
  const [editandoMetas, setEditandoMetas] = useState(false)
  const [salvandoMetas, setSalvandoMetas] = useState(false)

  const carregarDashboard = useCallback(async () => {
    setLoading(true)
    setErro('')

    try {
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
      const params = new URLSearchParams({ origem: filtroOrigem })
      if (filtroGarantidor !== 'TODOS') params.set('garantidor', filtroGarantidor)
      const [dashboardResponse, parceirosResumo, relatoriosResumo, configuracaoKpi] = await Promise.all([
        adminFetch(`/api/admin/dashboard?${params.toString()}`),
        carregarResumoParceiros(),
        carregarResumoRelatorios(filtroOrigem, filtroGarantidor, periodoKpi),
        carregarConfiguracaoKpi(),
      ])
      const dashboardData = await dashboardResponse.json().catch(() => null)
      if (!dashboardResponse.ok) throw new Error(dashboardData?.error ?? 'Erro ao carregar o dashboard.')
      const resumoEscopo = dashboardData?.resumoEscopo ?? { clientes: 0, tecnicos: 0 }
      const notificacoes = Number(dashboardData?.notificacoes ?? 0)
      const osSemTecnico3Dias = Number(dashboardData?.osSemTecnico3Dias ?? 0)
      const orcamentosPendentes = Number(dashboardData?.orcamentosPendentes ?? 0)
      const criticasAtivas = Number(dashboardData?.criticas ?? 0)
      const ultimasOsData = (dashboardData?.ultimasOs ?? []) as OrdemResumo[]
      const volumeData = (dashboardData?.volume ?? []) as Array<{ id: number; created_at: string }>
      const historicoData = (dashboardData?.historico ?? []) as HistoricoResumo[]
      const garantidoresResumo = (dashboardData?.garantidores ?? []) as GarantidorFiltro[]

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
        prontoEntrega: relatoriosResumo.prontoEntrega,
        criticas: criticasAtivas,
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
      setUltimasOs(ultimasOsData)
      setHistorico(historicoData)
      setGarantidoresFiltro(garantidoresResumo)
      setKpis(relatoriosResumo.kpis)
      setMetasKpi(configuracaoKpi)
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao carregar o dashboard.'))
    } finally {
      setLoading(false)
    }
  }, [filtroGarantidor, filtroOrigem, periodoKpi])

  async function salvarMetasKpi() {
    setSalvandoMetas(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/relatorios/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metasEdicao),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao salvar as metas dos KPIs.')
      setMetasKpi(metasEdicao)
      setEditandoMetas(false)
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao salvar as metas dos KPIs.'))
    } finally {
      setSalvandoMetas(false)
    }
  }

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
      const response = await adminFetch('/api/admin/dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: osId, status: novoStatus }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao atualizar status.')

      await carregarDashboard()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao atualizar status.'))
    } finally {
      setSalvandoStatusId(null)
    }
  }

  const volumeMax = useMemo(() => Math.max(...volume.map((v) => v.valor), 1), [volume])
  const andamentoOrdens = useMemo(() => {
    const itens: AndamentoItem[] = [
      { label: 'Novas', value: stats.osNovas, href: '/admin/os?status=NOVA', tone: 'blue' },
      { label: 'Triagem', value: stats.emTriagem, href: '/admin/os?status=EM_TRIAGEM', tone: 'amber' },
      { label: 'Atendimento', value: stats.emAtendimento, href: '/admin/os?status=EM_ATENDIMENTO', tone: 'emerald' },
      { label: 'Peça', value: stats.aguardandoPeca, href: '/admin/os?status=AGUARDANDO_PECA', tone: 'violet' },
      { label: 'Revisão', value: stats.aguardandoRevisao, href: '/admin/os?status=AGUARDANDO_REVISAO', tone: 'orange' },
      { label: 'Pronto', value: stats.prontoEntrega, href: '/admin/os?status=PRONTO_AGUARDANDO_ENTREGA', tone: 'teal' },
      { label: 'Finalizadas', value: stats.finalizadas, href: '/admin/finalizadas', tone: 'green' },
      { label: 'Sem reparo', value: stats.encerradasSemReparo, href: '/admin/os?status=ENCERRADA_SEM_REPARO', tone: 'rose' },
    ]
    const total = itens.reduce((soma, item) => soma + item.value, 0)
    return { itens, total }
  }, [stats])

  return (
    <main className="min-h-screen w-full bg-slate-100 px-4 py-4 md:px-6">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Painel</h1>
            <p className="text-slate-500">
              {loading
                ? 'Carregando o panorama...'
                : `${formatNumber(stats.ordensTotal)} OS no período · ${formatNumber(stats.clientes)} clientes · ${formatNumber(stats.parceirosAtivos)} técnicos`}
            </p>
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

        <section>
          <h2 className="text-lg font-black text-slate-950">O que precisa de você hoje</h2>
          <p className="mt-1 text-sm text-slate-500">Cada cartão abre a lista já filtrada.</p>
        </section>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <AlertCard
            title="Triagem agora"
            value={loading ? '...' : String(stats.osNovas)}
            detail="OS novas aguardando tratamento"
            onClick={() => router.push('/admin/os?status=NOVA')}
            tone={stats.osNovas > 0 ? 'green' : 'slate'}
          />
          <AlertCard
            title="Sem técnico há 3 dias"
            value={loading ? '...' : String(stats.osSemTecnico3Dias)}
            detail="Chamados abertos sem atribuição"
            onClick={() => router.push('/admin/os?fila=sem-tecnico')}
            tone={stats.osSemTecnico3Dias > 0 ? 'red' : 'slate'}
          />
          <AlertCard
            title="Aprovação pendente"
            value={loading ? '...' : String(stats.orcamentosPendentes)}
            detail="Orçamentos aguardando decisão"
            onClick={() => router.push('/admin/aprovacao')}
            tone={stats.orcamentosPendentes > 0 ? 'amber' : 'slate'}
          />
          <AlertCard
            title="Técnicos pendentes"
            value={loading ? '...' : String(stats.parceirosPendentes)}
            detail="Cadastros aguardando aprovação"
            onClick={() => router.push('/admin/parceiros?status=PENDENTES')}
            tone={stats.parceirosPendentes > 0 ? 'amber' : 'slate'}
          />
          <AlertCard
            title="Estoque baixo"
            value={loading ? '...' : String(stats.estoqueBaixo)}
            detail="Itens abaixo do mínimo"
            onClick={() => router.push('/admin/pecas')}
            tone={stats.estoqueBaixo > 0 ? 'red' : 'slate'}
          />
        </section>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <AlertCard
            title="OS críticas"
            value={loading ? '...' : String(stats.criticas)}
            detail="Chamados marcados como críticos"
            onClick={() => router.push('/admin/os?status=CRITICA')}
            tone={stats.criticas > 0 ? 'red' : 'slate'}
          />
          <AlertCard
            title="Revisão da equipe"
            value={loading ? '...' : String(stats.aguardandoRevisao)}
            detail="OS aguardando análise interna"
            onClick={() => router.push('/admin/os?status=AGUARDANDO_REVISAO')}
            tone={stats.aguardandoRevisao > 0 ? 'amber' : 'slate'}
          />
          <AlertCard
            title="A receber do cliente"
            value={loading ? '...' : formatCurrency(stats.aReceberCliente)}
            detail="Valores ainda não recebidos"
            onClick={() => router.push('/admin/financeiro?aba=receber')}
            tone={stats.aReceberCliente > 0 ? 'amber' : 'slate'}
          />
          <AlertCard
            title="A pagar ao técnico"
            value={loading ? '...' : formatCurrency(stats.aPagarTecnico)}
            detail="Serviços executados sem pagamento"
            onClick={() => router.push('/admin/financeiro?aba=tecnicos')}
            tone={stats.aPagarTecnico > 0 ? 'amber' : 'slate'}
          />
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Andamento das ordens</h2>
              <p className="text-sm text-slate-500">Onde cada chamado está agora. O número abre a lista filtrada.</p>
            </div>
            <p className="text-sm font-bold text-slate-700">
              {loading ? '...' : `${formatNumber(stats.finalizadas)} finalizadas no período`}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {andamentoOrdens.itens.map((item) => (
              <AndamentoCard
                key={item.label}
                label={item.label}
                value={item.value}
                tone={item.tone}
                share={andamentoOrdens.total > 0 ? (item.value / andamentoOrdens.total) * 100 : 0}
                loading={loading}
                onClick={() => router.push(item.href)}
              />
            ))}
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-5">
          <article className="flex h-80 flex-col rounded-2xl bg-white p-3 shadow-sm xl:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-black text-slate-950">Entradas da semana</h2>
              <p className="text-[11px] font-semibold text-slate-500">7 dias</p>
            </div>
            <div className="mt-2 flex min-h-0 flex-1 items-end gap-1.5">
              {volume.map((item, index) => (
                <div key={`${item.dia}-${index}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] font-black text-slate-700">{item.valor}</span>
                  <div className="relative w-full flex-1">
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-md bg-orange-500"
                      style={{ height: `${Math.max((item.valor / volumeMax) * 100, item.valor > 0 ? 8 : 2)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">{item.dia}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="flex h-80 flex-col rounded-2xl bg-white p-3 shadow-sm xl:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-slate-950">Últimas ordens</h2>
              <button
                type="button"
                onClick={() => router.push('/admin/os')}
                className="rounded-lg px-2 py-1 text-[11px] font-black text-orange-600 hover:bg-orange-50"
              >
                Ver todas
              </button>
            </div>
            <div className="mt-2 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto pr-1">
              {ultimasOs.length === 0 ? (
                <p className="py-3 text-xs text-slate-500">{loading ? 'Carregando...' : 'Nenhuma ordem neste filtro.'}</p>
              ) : (
                ultimasOs.map((os) => {
                  const clienteLinha = [os.cliente_nome, os.cliente_cidade].filter(Boolean).join(' · ')
                  return (
                  <button
                    key={os.id}
                    type="button"
                    onClick={() => router.push(`/admin/os/${os.id}`)}
                    className="flex w-full items-center justify-between gap-3 py-1.5 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-baseline gap-2">
                        <span className="shrink-0 text-sm font-black text-slate-950">{os.numero_os ?? `OS #${os.id}`}</span>
                        {clienteLinha && (
                          <span className="truncate text-sm font-semibold text-slate-600">{clienteLinha}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">{formatarQuando(os.created_at)}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black text-white"
                      style={{ backgroundColor: getEventColor(null, os.status) }}
                    >
                      {formatarStatusDashboard(os.status)}
                    </span>
                  </button>
                  )
                })
              )}
            </div>
          </article>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Dinheiro do período</h2>
              <p className="text-sm text-slate-500">Recebido, em aberto e o que ainda vai para o técnico.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/admin/financeiro')}
              className="rounded-lg px-3 py-2 text-xs font-black text-orange-600 hover:bg-orange-50"
            >
              Abrir financeiro
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
            <FinanceMiniCard title="Recebido" value={loading ? '...' : formatCurrency(stats.recebidoTotal)} tone="green" destaque />
            <FinanceMiniCard title="Recebido do cliente" value={loading ? '...' : formatCurrency(stats.recebidoCliente)} tone="slate" />
            <FinanceMiniCard title="A receber do cliente" value={loading ? '...' : formatCurrency(stats.aReceberCliente)} tone="amber" />
            <FinanceMiniCard title="Recebido do garantidor" value={loading ? '...' : formatCurrency(stats.recebidoGarantidor)} tone="blue" />
            <FinanceMiniCard title="A receber do garantidor" value={loading ? '...' : formatCurrency(stats.aReceberGarantidor)} tone="orange" />
            <FinanceMiniCard title="A pagar ao técnico" value={loading ? '...' : formatCurrency(stats.aPagarTecnico)} tone="amber" />
            <FinanceMiniCard title="Ticket médio" value={loading ? '...' : formatCurrency(stats.ticketMedioMargem)} tone="slate" />
            <FinanceMiniCard title="Estoque baixo" value={loading ? '...' : formatNumber(stats.estoqueBaixo)} tone={stats.estoqueBaixo > 0 ? 'orange' : 'slate'} />
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Desempenho</h2>
              <p className="text-sm text-slate-500">
                SLA particular {loading ? '...' : `${formatNumber(stats.slaParticularPercentual)}%`}
                {stats.slaParticularForaPrazo > 0 ? ` · ${formatNumber(stats.slaParticularForaPrazo)} fora` : ''}
                {' · '}
                SLA garantia {loading ? '...' : `${formatNumber(stats.slaGarantiaPercentual)}%`}
                {stats.slaGarantiaForaPrazo > 0 ? ` · ${formatNumber(stats.slaGarantiaForaPrazo)} fora` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                {[
                  { value: 'MES_ATUAL', label: 'Este mês' },
                  { value: '30_DIAS', label: '30 dias' },
                  { value: '90_DIAS', label: '90 dias' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setPeriodoKpi(item.value as PeriodoKpi)}
                    className={`rounded-lg px-3 py-2 text-xs font-black ${
                      periodoKpi === item.value ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => router.push('/admin/relatorios')}
                className="rounded-lg px-3 py-2 text-xs font-black text-orange-600 hover:bg-orange-50"
              >
                Ver relatórios
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="SLA no prazo"
              value={`${formatNumber(kpis.slaPercentual)}%`}
              meta={`Meta ${formatNumber(metasKpi.metaSlaPercentual)}%`}
              detail={kpis.slaAmostras > 0 ? `${formatNumber(kpis.slaAmostras)} OS avaliadas` : 'Sem amostra no período'}
              atingiu={kpis.slaPercentual >= metasKpi.metaSlaPercentual}
              semAmostra={kpis.slaAmostras === 0}
              progresso={percentualProgresso(kpis.slaPercentual, metasKpi.metaSlaPercentual)}
            />
            <KpiCard
              title="Tempo médio"
              value={`${formatNumber(kpis.tempoMedioConclusaoDias)} dias`}
              meta={`Meta até ${formatNumber(metasKpi.metaConclusaoDias)} dias`}
              detail={kpis.conclusoesAmostras > 0 ? `${formatNumber(kpis.conclusoesAmostras)} conclusões` : 'Sem amostra no período'}
              atingiu={kpis.tempoMedioConclusaoDias > 0 && kpis.tempoMedioConclusaoDias <= metasKpi.metaConclusaoDias}
              semAmostra={kpis.conclusoesAmostras === 0}
              progresso={percentualProgressoInverso(kpis.tempoMedioConclusaoDias, metasKpi.metaConclusaoDias)}
            />
            <KpiCard
              title="Aprovação de orçamento"
              value={`${formatNumber(kpis.aprovacaoPercentual)}%`}
              meta={`Meta ${formatNumber(metasKpi.metaAprovacaoPercentual)}%`}
              detail={kpis.decisoesOrcamento > 0 ? `${formatNumber(kpis.aprovacoes)} de ${formatNumber(kpis.decisoesOrcamento)} decisões` : 'Sem amostra no período'}
              atingiu={kpis.aprovacaoPercentual >= metasKpi.metaAprovacaoPercentual}
              semAmostra={kpis.decisoesOrcamento === 0}
              progresso={percentualProgresso(kpis.aprovacaoPercentual, metasKpi.metaAprovacaoPercentual)}
            />
            <KpiCard
              title="Produtividade"
              value={formatNumber(kpis.produtividadeMedia)}
              meta={`Meta ${formatNumber(metasKpi.metaProdutividade)} OS por técnico`}
              detail={kpis.tecnicoDestaque ? `${kpis.tecnicoDestaque.nome} · ${formatNumber(kpis.tecnicoDestaque.total)} OS` : `${formatNumber(kpis.tecnicosAtivos)} técnicos ativos`}
              atingiu={kpis.produtividadeMedia >= metasKpi.metaProdutividade}
              semAmostra={kpis.tecnicosAtivos === 0}
              progresso={percentualProgresso(kpis.produtividadeMedia, metasKpi.metaProdutividade)}
            />
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Movimento recente</h2>
          <p className="text-sm text-slate-500">As últimas mudanças nas ordens deste filtro.</p>
          <div className="mt-4 space-y-2">
            {historico.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">{loading ? 'Carregando...' : 'Nenhuma mudança recente.'}</p>
            ) : (
              historico.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => item.os_id && router.push(`/admin/os/${item.os_id}`)}
                  className="flex w-full items-start gap-3 rounded-xl bg-slate-50 px-4 py-3 text-left hover:bg-orange-50"
                >
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: getEventColor(item.acao, item.status_novo) }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-950">
                      {item.os_id ? osMap.get(item.os_id) ?? `OS #${item.os_id}` : 'OS'}
                      <span className="font-semibold text-slate-500"> · {textoHistorico(item)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[item.responsavel, formatarQuando(item.criado_em)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </button>
              ))
            )}
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

function AndamentoCard({
  label,
  value,
  tone,
  share,
  loading,
  onClick,
}: {
  label: string
  value: number
  tone: TomAndamento
  share: number
  loading: boolean
  onClick: () => void
}) {
  const paleta: Record<TomAndamento, { borda: string; fundo: string; texto: string; barra: string; trilho: string }> = {
    blue: { borda: 'border-blue-300', fundo: 'bg-blue-50', texto: 'text-blue-700', barra: 'bg-blue-500', trilho: 'bg-blue-100' },
    amber: { borda: 'border-amber-300', fundo: 'bg-amber-50', texto: 'text-amber-700', barra: 'bg-amber-500', trilho: 'bg-amber-100' },
    emerald: { borda: 'border-emerald-300', fundo: 'bg-emerald-50', texto: 'text-emerald-700', barra: 'bg-emerald-500', trilho: 'bg-emerald-100' },
    violet: { borda: 'border-violet-300', fundo: 'bg-violet-50', texto: 'text-violet-700', barra: 'bg-violet-500', trilho: 'bg-violet-100' },
    orange: { borda: 'border-orange-300', fundo: 'bg-orange-50', texto: 'text-orange-700', barra: 'bg-orange-500', trilho: 'bg-orange-100' },
    teal: { borda: 'border-teal-300', fundo: 'bg-teal-50', texto: 'text-teal-700', barra: 'bg-teal-500', trilho: 'bg-teal-100' },
    green: { borda: 'border-green-300', fundo: 'bg-green-50', texto: 'text-green-700', barra: 'bg-green-600', trilho: 'bg-green-100' },
    rose: { borda: 'border-rose-300', fundo: 'bg-rose-50', texto: 'text-rose-700', barra: 'bg-rose-500', trilho: 'bg-rose-100' },
  }
  const cor = paleta[tone]
  const ativo = value > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border px-3 py-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${cor.borda} ${ativo ? cor.fundo : 'bg-white'}`}
    >
      <span className={`absolute inset-x-0 top-0 h-1.5 ${cor.barra}`} />
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[11px] font-black uppercase tracking-wide ${cor.texto}`}>{label}</p>
        {ativo && <span className={`h-2 w-2 shrink-0 rounded-full ${cor.barra} animate-pulse`} />}
      </div>
      <p className={`mt-2 text-3xl font-black leading-none ${ativo ? cor.texto : 'text-slate-900'}`}>
        {loading ? '...' : formatNumber(value)}
      </p>
      <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${cor.trilho}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${cor.barra}`}
          style={{ width: `${loading ? 0 : Math.min(Math.max(share, ativo ? 18 : 0), 100)}%` }}
        />
      </div>
    </button>
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

function KpiCard({
  title,
  value,
  meta,
  detail,
  atingiu,
  semAmostra,
  progresso,
}: {
  title: string
  value: string
  meta: string
  detail: string
  atingiu: boolean
  semAmostra: boolean
  progresso: number
}) {
  const tone = semAmostra
    ? 'border-slate-200 bg-slate-50 text-slate-600'
    : atingiu
      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
      : 'border-amber-200 bg-amber-50/70 text-amber-800'
  const barra = semAmostra ? 'bg-slate-300' : atingiu ? 'bg-emerald-500' : 'bg-amber-500'

  return (
    <article className={`rounded-xl border px-3 py-3 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase leading-tight opacity-70">{title}</p>
        <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[8px] font-black uppercase">
          {semAmostra ? 'Sem dados' : atingiu ? 'Meta atingida' : 'Atenção'}
        </span>
      </div>
      <p className="mt-1.5 break-words text-xl font-black leading-none">{value}</p>
      <p className="mt-1.5 text-[11px] font-bold">{meta}</p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/80">
        <div className={`h-full rounded-full transition-all ${barra}`} style={{ width: `${Math.min(Math.max(progresso, 0), 100)}%` }} />
      </div>
      <p className="mt-1.5 line-clamp-1 text-[10px] font-semibold opacity-75" title={detail}>{detail}</p>
    </article>
  )
}

function MetaInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-xs font-bold text-slate-700">
      {label}
      <input
        type="number"
        min="0.01"
        step="0.1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-orange-500"
      />
    </label>
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

async function carregarResumoRelatorios(
  filtroOrigem: FiltroOrigemDashboard,
  garantidorId: string,
  periodoKpi: PeriodoKpi
) {
  try {
    const hoje = new Date()
    const inicio = inicioPeriodoKpi(hoje, periodoKpi)
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
    const kpisData = data?.kpis ?? {}
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
      kpis: normalizarKpis(kpisData),
    }
  } catch {
    return {
      osNovas: 0,
      emTriagem: 0,
      emAtendimento: 0,
      aguardandoRevisao: 0,
      aguardandoPeca: 0,
      prontoEntrega: 0,
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
      kpis: KPI_VAZIO,
    }
  }
}

async function carregarConfiguracaoKpi(): Promise<KpiMetas> {
  try {
    const response = await adminFetch('/api/admin/relatorios/configuracoes')
    const payload = await response.json().catch(() => null)
    if (!response.ok) return KPI_METAS_PADRAO
    const data = payload?.data ?? {}
    return {
      metaSlaPercentual: numeroPositivoOuZero(data.metaSlaPercentual, KPI_METAS_PADRAO.metaSlaPercentual),
      metaConclusaoDias: numeroPositivo(data.metaConclusaoDias, KPI_METAS_PADRAO.metaConclusaoDias),
      metaAprovacaoPercentual: numeroPositivoOuZero(data.metaAprovacaoPercentual, KPI_METAS_PADRAO.metaAprovacaoPercentual),
      metaProdutividade: numeroPositivo(data.metaProdutividade, KPI_METAS_PADRAO.metaProdutividade),
      metaTicket: numeroPositivo(data.metaTicket, KPI_METAS_PADRAO.metaTicket),
    }
  } catch {
    return KPI_METAS_PADRAO
  }
}

function normalizarKpis(data: Record<string, unknown>): KpiResumo {
  const destaque = data.tecnicoDestaque as { nome?: unknown; total?: unknown } | null | undefined
  return {
    slaPercentual: Number(data.slaPercentual ?? 0) || 0,
    slaAmostras: Number(data.slaAmostras ?? 0) || 0,
    tempoMedioConclusaoDias: Number(data.tempoMedioConclusaoDias ?? 0) || 0,
    conclusoesAmostras: Number(data.conclusoesAmostras ?? 0) || 0,
    aprovacaoPercentual: Number(data.aprovacaoPercentual ?? 0) || 0,
    aprovacoes: Number(data.aprovacoes ?? 0) || 0,
    decisoesOrcamento: Number(data.decisoesOrcamento ?? 0) || 0,
    produtividadeMedia: Number(data.produtividadeMedia ?? 0) || 0,
    tecnicosAtivos: Number(data.tecnicosAtivos ?? 0) || 0,
    tecnicoDestaque: destaque?.nome
      ? { nome: String(destaque.nome), total: Number(destaque.total ?? 0) || 0 }
      : null,
    ticketMedio: Number(data.ticketMedio ?? 0) || 0,
    ticketAmostras: Number(data.ticketAmostras ?? 0) || 0,
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

function formatarStatusDashboard(status: string | null) {
  const nomes: Record<string, string> = {
    NOVA: 'Nova',
    EM_TRIAGEM: 'Triagem',
    EM_ATENDIMENTO: 'Em atendimento',
    AGUARDANDO_PECA: 'Aguardando peça',
    AGUARDANDO_REVISAO: 'Revisão',
    AGUARDANDO_APROVACAO: 'Aguardando aprovação',
    CRITICA: 'Crítica',
    PRONTO_AGUARDANDO_ENTREGA: 'Pronto',
    FINALIZADA: 'Finalizada',
    ENCERRADA_SEM_REPARO: 'Sem reparo',
  }

  if (!status) return 'Sem status'
  return nomes[status] ?? status
}

function formatarQuando(value: string | null) {
  if (!value) return ''
  const data = new Date(value)
  if (Number.isNaN(data.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data)
}

function textoHistorico(item: HistoricoResumo) {
  if (item.descricao?.trim()) return item.descricao.trim()
  if (item.status_novo) return formatarStatusDashboard(item.status_novo)
  return item.acao ?? 'Atualização da OS'
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

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value || 0)
}

function percentualProgresso(valor: number, meta: number) {
  if (meta <= 0) return valor > 0 ? 100 : 0
  return (valor / meta) * 100
}

function percentualProgressoInverso(valor: number, meta: number) {
  if (valor <= 0 || meta <= 0) return 0
  return (meta / valor) * 100
}

function inicioPeriodoKpi(hoje: Date, periodo: PeriodoKpi) {
  if (periodo === 'MES_ATUAL') return new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const inicio = new Date(hoje)
  inicio.setDate(inicio.getDate() - (periodo === '30_DIAS' ? 29 : 89))
  return inicio
}

function numeroPositivo(value: unknown, fallback: number) {
  const numero = Number(value)
  return Number.isFinite(numero) && numero > 0 ? numero : fallback
}

function numeroPositivoOuZero(value: unknown, fallback: number) {
  const numero = Number(value)
  return Number.isFinite(numero) && numero >= 0 ? numero : fallback
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
