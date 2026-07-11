'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type RelatoriosData = {
  periodo: { inicio: string; fim: string }
  filtros?: {
    origemFinanceira: string
    statusFinanceiro: string
    statusOs: string
    tecnico: string
    garantidor: string
    slaParticularDias?: number
    slaGarantiaDias?: number
    opcoes: {
      statusOs: string[]
      statusFinanceiro: string[]
      tecnicos: string[]
      garantidores: string[]
    }
  }
  cards: Record<string, number>
  statusResumo: Array<{ status: string; total: number }>
  tecnicoResumo: Array<{ nome: string; total: number; valor: number }>
  garantidorResumo: Array<{ nome: string; total: number; valor: number }>
  slaResumo?: {
    particular: SlaResumo
    garantia: SlaResumo
  }
  slaGarantidores?: Array<SlaResumo & { garantidor: string }>
  ticketCategorias: Array<{
    categoria: string
    totalOs: number
    finalizadas: number
    faturamento: number
    tecnico: number
    margem: number
    ticketBruto: number
    ticketMargem: number
    mttrHoras: number
    menorMttrHoras: number
    maiorMttrHoras: number
  }>
  resumoMensal: Array<{
    chave: string
    label: string
    totalOs: number
    valor: number
    recebido: number
    pagoTecnico?: number
    contasPagas?: number
    resultadoLiquido?: number
  }>
  despesasCategorias?: Array<{ categoria: string; valor: number }>
  pecas: {
    total: number
    estoqueBaixo: number
    valorEstoque: number
    itensBaixos?: Array<{ id: number; descricao?: string | null; codigo?: string | null; estoque: number; minimo: number; localizacao?: string | null }>
    movimentacoes?: Array<Record<string, unknown>>
  }
  ultimasOrdens: Array<{
    id: number
    numero_os: string | null
    cliente: string
    tecnico: string
    status: string | null
    garantia: boolean
    origemFinanceira?: string
    valor: number
    criada_em: string | null
  }>
}

type SlaResumo = {
  label: string
  limiteDias: number
  total: number
  abertas: number
  finalizadas: number
  dentroPrazo: number
  foraPrazo: number
  percentualDentro: number
  mediaDias: number
}

function getPeriodoInicial() {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: hoje.toISOString().slice(0, 10),
  }
}

export default function RelatoriosPage() {
  const periodoInicial = useMemo(() => getPeriodoInicial(), [])
  const [inicio, setInicio] = useState(periodoInicial.inicio)
  const [fim, setFim] = useState(periodoInicial.fim)
  const [origemFinanceira, setOrigemFinanceira] = useState('TODOS')
  const [statusFinanceiro, setStatusFinanceiro] = useState('TODOS')
  const [statusOs, setStatusOs] = useState('TODOS')
  const [tecnico, setTecnico] = useState('TODOS')
  const [garantidor, setGarantidor] = useState('TODOS')
  const [slaParticularDias, setSlaParticularDias] = useState('3')
  const [slaGarantiaDias, setSlaGarantiaDias] = useState('7')
  const [data, setData] = useState<RelatoriosData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [metaMensal, setMetaMensal] = useState(() =>
    typeof window === 'undefined' ? '' : window.localStorage.getItem('relatorios_meta_mensal') ?? ''
  )

  const carregar = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setLoading(true)
    setErro('')

    try {
      const params = new URLSearchParams({
        inicio,
        fim,
        origemFinanceira,
        statusFinanceiro,
        statusOs,
        tecnico,
        garantidor,
        slaParticularDias,
        slaGarantiaDias,
      })
      const response = await adminFetch(`/api/admin/relatorios?${params.toString()}`)
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar relatorios.')

      setData(payload as RelatoriosData)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar relatorios.')
    } finally {
      setLoading(false)
    }
  }, [fim, garantidor, inicio, origemFinanceira, slaGarantiaDias, slaParticularDias, statusFinanceiro, statusOs, tecnico])

  useEffect(() => {
    // Carregamento inicial do relatorio ao abrir a tela.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const cards = data?.cards ?? {}
  const opcoes = data?.filtros?.opcoes
  const metaValor = Number(metaMensal || 0)

  function salvarMetaMensal(value: string) {
    setMetaMensal(value)
    window.localStorage.setItem('relatorios_meta_mensal', value)
  }

  function exportarCsv() {
    if (!data) return

    const linhas = [
      ['Relatorio gerencial'],
      [`Periodo: ${inicio} ate ${fim}`],
      [`Origem financeira: ${formatFilterLabel(origemFinanceira)}`],
      [`Status financeiro: ${formatFilterLabel(statusFinanceiro)}`],
      [`Status OS: ${formatStatus(statusOs)}`],
      [`Tecnico: ${formatFilterLabel(tecnico)}`],
      [`Garantidor: ${formatFilterLabel(garantidor)}`],
      [`SLA particular: ${slaParticularDias} dias`],
      [`SLA garantia/seguradora: ${slaGarantiaDias} dias`],
      [],
      ['Indicador', 'Valor'],
      ['OS no periodo', String(cards.totalOs ?? 0)],
      ['Novas', String(cards.novas ?? 0)],
      ['Em tratamento', String(cards.emAndamento ?? 0)],
      ['Finalizadas', String(cards.finalizadas ?? 0)],
      ['Garantia', String(cards.garantia ?? 0)],
      ['Valor cliente', formatCurrency(cards.valorCliente ?? 0)],
      ['Recebido cliente', formatCurrency(cards.recebidoCliente ?? 0)],
      ['Desconto cliente', formatCurrency(cards.descontoCliente ?? 0)],
      ['A receber cliente', formatCurrency(cards.aReceberCliente ?? 0)],
      ['Valor garantidor/seguradora', formatCurrency(cards.valorGarantidor ?? 0)],
      ['Recebido garantidor/seguradora', formatCurrency(cards.recebidoGarantidor ?? 0)],
      ['Desconto garantidor/seguradora', formatCurrency(cards.descontoGarantidor ?? 0)],
      ['A receber garantidor/seguradora', formatCurrency(cards.aReceberGarantidor ?? 0)],
      ['Faturamento total', formatCurrency(cards.valorFaturamento ?? 0)],
      ['Recebido total', formatCurrency(cards.recebidoTotal ?? 0)],
      ['Desconto total', formatCurrency(cards.descontoTotal ?? 0)],
      ['A pagar tecnico', formatCurrency(cards.aPagarTecnico ?? 0)],
      ['Pago tecnico', formatCurrency(cards.pagoTecnico ?? 0)],
      ['Contas a pagar', formatCurrency(cards.contasAPagar ?? 0)],
      ['Contas pagas', formatCurrency(cards.contasPagas ?? 0)],
      ['Resultado liquido', formatCurrency(cards.resultadoLiquido ?? 0)],
      ['Margem total', formatCurrency(cards.margemTotal ?? 0)],
      ['Ticket medio bruto', formatCurrency(cards.ticketMedioBruto ?? 0)],
      ['Ticket medio margem', formatCurrency(cards.ticketMedioMargem ?? 0)],
      [],
      ['SLA'],
      ['Origem', 'Total', 'Dentro SLA', 'Fora SLA', '% dentro', 'Media dias', 'Limite'],
      ...[data.slaResumo?.particular, data.slaResumo?.garantia].filter(Boolean).map((item) => [
        item?.label ?? '-',
        String(item?.total ?? 0),
        String(item?.dentroPrazo ?? 0),
        String(item?.foraPrazo ?? 0),
        `${item?.percentualDentro ?? 0}%`,
        String(item?.mediaDias ?? 0),
        `${item?.limiteDias ?? 0} dias`,
      ]),
      [],
      ['SLA por garantidor'],
      ['Garantidor', 'Total', 'Dentro SLA', 'Fora SLA', '% dentro', 'Media dias'],
      ...(data.slaGarantidores ?? []).map((item) => [
        item.garantidor,
        String(item.total),
        String(item.dentroPrazo),
        String(item.foraPrazo),
        `${item.percentualDentro}%`,
        String(item.mediaDias),
      ]),
      [],
      ['Despesas por categoria'],
      ['Categoria', 'Valor pago'],
      ...(data.despesasCategorias ?? []).map((item) => [
        formatarCategoriaConta(item.categoria),
        formatCurrency(item.valor),
      ]),
      [],
      ['Resumo mensal'],
      ['Mes', 'OS', 'Faturamento', 'Recebido', 'Pago tecnico', 'Contas pagas', 'Resultado liquido'],
      ...data.resumoMensal.map((item) => [
        item.label,
        String(item.totalOs),
        formatCurrency(item.valor),
        formatCurrency(item.recebido),
        formatCurrency(item.pagoTecnico ?? 0),
        formatCurrency(item.contasPagas ?? 0),
        formatCurrency(item.resultadoLiquido ?? 0),
      ]),
      [],
      ['Indicadores por tipo de aparelho'],
      ['Categoria', 'OS', 'Finalizadas', 'Faturamento', 'Ticket medio', 'Margem', 'MTTR medio', 'Menor MTTR', 'Maior MTTR'],
      ...data.ticketCategorias.map((item) => [
        item.categoria,
        String(item.totalOs),
        String(item.finalizadas),
        formatCurrency(item.faturamento),
        formatCurrency(item.ticketBruto),
        formatCurrency(item.margem),
        formatDurationHours(item.mttrHoras),
        formatDurationHours(item.menorMttrHoras),
        formatDurationHours(item.maiorMttrHoras),
      ]),
      [],
      ['Ultimas OS'],
      ['OS', 'Cliente', 'Tecnico', 'Status', 'Origem financeira', 'Valor'],
      ...data.ultimasOrdens.map((ordem) => [
        ordem.numero_os ?? `#${ordem.id}`,
        ordem.cliente,
        ordem.tecnico,
        formatStatus(ordem.status),
        ordem.origemFinanceira ?? (ordem.garantia ? 'GARANTIDOR/SEGURADORA' : 'CLIENTE'),
        formatCurrency(ordem.valor),
      ]),
    ]

    const csv = linhas.map((linha) => linha.map(formatCsvCell).join(';')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `relatorio-${inicio}-${fim}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function imprimirPdf() {
    window.print()
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-orange-600">Relatorios</p>
          <h1 className="text-2xl font-black text-slate-950">Visao gerencial</h1>
          <p className="text-sm text-slate-500">Acompanhe OS, financeiro, tecnicos, garantidores e estoque por periodo.</p>
        </div>

        <div className="flex flex-col gap-2">
          <form onSubmit={carregar} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <FilterInput label="Inicio">
              <input
                type="date"
                value={inicio}
                onChange={(event) => setInicio(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              />
            </FilterInput>
            <FilterInput label="Fim">
              <input
                type="date"
                value={fim}
                onChange={(event) => setFim(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              />
            </FilterInput>
            <FilterInput label="Origem">
              <select
                value={origemFinanceira}
                onChange={(event) => setOrigemFinanceira(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              >
                <option value="TODOS">Todos</option>
                <option value="CLIENTE">Cliente</option>
                <option value="GARANTIDOR">Garantidor/Seguradora</option>
              </select>
            </FilterInput>
            <FilterInput label="Status financeiro">
              <select
                value={statusFinanceiro}
                onChange={(event) => setStatusFinanceiro(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              >
                <option value="TODOS">Todos</option>
                {(opcoes?.statusFinanceiro ?? ['PENDENTE', 'FATURADO', 'RECEBIDO']).map((status) => (
                  <option key={status} value={status}>{formatFilterLabel(status)}</option>
                ))}
              </select>
            </FilterInput>
            <FilterInput label="Status OS">
              <select
                value={statusOs}
                onChange={(event) => setStatusOs(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              >
                <option value="TODOS">Todos</option>
                {(opcoes?.statusOs ?? []).map((status) => (
                  <option key={status} value={status}>{formatStatus(status)}</option>
                ))}
              </select>
            </FilterInput>
            <FilterInput label="Tecnico">
              <select
                value={tecnico}
                onChange={(event) => setTecnico(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              >
                <option value="TODOS">Todos</option>
                {(opcoes?.tecnicos ?? []).map((nome) => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
            </FilterInput>
            <FilterInput label="Garantidor">
              <select
                value={garantidor}
                onChange={(event) => setGarantidor(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              >
                <option value="TODOS">Todos</option>
                {(opcoes?.garantidores ?? []).map((nome) => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
            </FilterInput>
            <FilterInput label="SLA particular (dias)">
              <input
                type="number"
                min="1"
                max="365"
                value={slaParticularDias}
                onChange={(event) => setSlaParticularDias(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              />
            </FilterInput>
            <FilterInput label="SLA garantia (dias)">
              <input
                type="number"
                min="1"
                max="365"
                value={slaGarantiaDias}
                onChange={(event) => setSlaGarantiaDias(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              />
            </FilterInput>
            <button className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white">
              Atualizar
            </button>
          </form>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={exportarCsv}
              disabled={!data || loading}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={imprimirPdf}
              disabled={!data || loading}
              className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Gerar PDF
            </button>
          </div>
        </div>
      </header>

      {erro && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="OS no periodo" value={loading ? '...' : String(cards.totalOs ?? 0)} />
        <Metric label="Novas" value={loading ? '...' : String(cards.novas ?? 0)} tone="green" />
        <Metric label="Em tratamento" value={loading ? '...' : String(cards.emAndamento ?? 0)} tone="blue" />
        <Metric label="Finalizadas" value={loading ? '...' : String(cards.finalizadas ?? 0)} />
        <Metric label="Garantia" value={loading ? '...' : String(cards.garantia ?? 0)} tone="amber" />
        <Metric label="Estoque baixo" value={loading ? '...' : String(cards.estoqueBaixo ?? 0)} tone={(cards.estoqueBaixo ?? 0) > 0 ? 'red' : 'green'} />
      </section>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <SlaMetric title="SLA particular" item={data?.slaResumo?.particular} loading={loading} />
        <SlaMetric title="SLA garantia/seguradora" item={data?.slaResumo?.garantia} loading={loading} />
        <Metric
          label="Particular fora SLA"
          value={loading ? '...' : String(data?.slaResumo?.particular.foraPrazo ?? 0)}
          tone={(data?.slaResumo?.particular.foraPrazo ?? 0) > 0 ? 'red' : 'green'}
        />
        <Metric
          label="Garantia fora SLA"
          value={loading ? '...' : String(data?.slaResumo?.garantia.foraPrazo ?? 0)}
          tone={(data?.slaResumo?.garantia.foraPrazo ?? 0) > 0 ? 'red' : 'green'}
        />
      </section>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Metric label="Faturamento total" value={formatCurrency(cards.valorFaturamento ?? 0)} destaque />
        <Metric label="Total recebido" value={formatCurrency(cards.recebidoTotal ?? 0)} tone="green" destaque />
        <Metric label="Resultado liquido" value={formatCurrency(cards.resultadoLiquido ?? 0)} tone={(cards.resultadoLiquido ?? 0) >= 0 ? 'green' : 'red'} destaque />
        <Metric label="Descontos concedidos" value={formatCurrency(cards.descontoTotal ?? 0)} tone="amber" />
        <Metric label="Recebido cliente" value={formatCurrency(cards.recebidoCliente ?? 0)} tone="green" />
        <Metric label="A receber cliente" value={formatCurrency(cards.aReceberCliente ?? 0)} tone="amber" />
        <Metric label="Recebido garantidor/seguradora" value={formatCurrency(cards.recebidoGarantidor ?? 0)} tone="green" />
        <Metric label="A receber garantidor/seguradora" value={formatCurrency(cards.aReceberGarantidor ?? 0)} tone="amber" />
        <Metric label="A pagar tecnico" value={formatCurrency(cards.aPagarTecnico ?? 0)} tone="red" />
        <Metric label="Pago tecnico" value={formatCurrency(cards.pagoTecnico ?? 0)} tone="blue" />
        <Metric label="Contas a pagar" value={formatCurrency(cards.contasAPagar ?? 0)} tone="red" />
        <Metric label="Contas pagas" value={formatCurrency(cards.contasPagas ?? 0)} tone="blue" />
        <Metric label="Ticket bruto medio" value={formatCurrency(cards.ticketMedioBruto ?? 0)} />
        <Metric label="Ticket margem medio" value={formatCurrency(cards.ticketMedioMargem ?? 0)} tone="green" />
        <Metric label="Margem total" value={formatCurrency(cards.margemTotal ?? 0)} tone="blue" />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Panel title="OS por status">
          <PieChart
            items={(data?.statusResumo ?? []).map((item) => ({
              label: formatStatus(item.status),
              value: item.total,
              display: `${item.total} OS`,
            }))}
            empty="Nenhum status no periodo."
          />
        </Panel>

        <Panel title="Tecnicos com mais OS">
          <VerticalBarChart
            items={(data?.tecnicoResumo ?? []).map((item) => ({
              label: item.nome,
              value: item.total,
              display: `${item.total} OS • ${formatCurrency(item.valor)}`,
            }))}
            empty="Nenhum tecnico no periodo."
          />
        </Panel>
      </section>

      <Panel title="Meta mensal e comparativo">
        <div className="mb-3 grid gap-3 md:grid-cols-[220px_1fr]">
          <label className="block text-sm font-bold text-slate-700">
            Meta mensal
            <input
              type="number"
              value={metaMensal}
              onChange={(event) => salvarMetaMensal(event.target.value)}
              placeholder="Ex.: 50000"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniCard label="Meta" value={formatCurrency(metaValor)} />
            <MiniCard label="Periodo atual" value={formatCurrency(cards.valorFaturamento ?? 0)} />
            <MiniCard label="% da meta" value={`${metaValor > 0 ? (((cards.valorFaturamento ?? 0) / metaValor) * 100).toFixed(0) : 0}%`} />
          </div>
        </div>
        <MonthlyChart items={data?.resumoMensal ?? []} meta={metaValor} />
      </Panel>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Garantidores">
          <SimpleList
            items={(data?.garantidorResumo ?? []).map((item) => ({
              title: item.nome,
              meta: `${item.total} OS`,
              value: formatCurrency(item.valor),
            }))}
            empty="Nenhuma OS em garantia no periodo."
          />
        </Panel>

        <Panel title="SLA por garantidor">
          <SlaGarantidorList items={data?.slaGarantidores ?? []} />
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Estoque">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <MiniCard label="Pecas cadastradas" value={String(data?.pecas.total ?? 0)} />
            <MiniCard label="Custo estoque" value={formatCurrency(data?.pecas.valorEstoque ?? 0)} />
          </div>
          <SimpleList
            items={(data?.pecas.itensBaixos ?? []).map((item) => ({
              title: item.descricao ?? 'Peca',
              meta: `${item.codigo ?? 'Sem codigo'} • ${item.localizacao ?? 'Sem local'}`,
              value: `${item.estoque}/${item.minimo}`,
            }))}
            empty="Nenhuma peca em estoque baixo."
          />
        </Panel>
      </section>

      <Panel title="Grafico financeiro">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FinanceBar label="Recebido cliente" value={cards.recebidoCliente ?? 0} total={cards.valorCliente ?? 0} tone="green" />
          <FinanceBar label="A receber cliente" value={cards.aReceberCliente ?? 0} total={cards.valorCliente ?? 0} tone="amber" />
          <FinanceBar label="Recebido garantidor" value={cards.recebidoGarantidor ?? 0} total={cards.valorGarantidor ?? 0} tone="green" />
          <FinanceBar label="A receber garantidor" value={cards.aReceberGarantidor ?? 0} total={cards.valorGarantidor ?? 0} tone="amber" />
          <FinanceBar label="A pagar tecnico" value={cards.aPagarTecnico ?? 0} total={Math.max(cards.aPagarTecnico ?? 0, cards.pagoTecnico ?? 0)} tone="red" />
          <FinanceBar label="Contas a pagar" value={cards.contasAPagar ?? 0} total={Math.max(cards.contasAPagar ?? 0, cards.contasPagas ?? 0)} tone="red" />
          <FinanceBar label="Contas pagas" value={cards.contasPagas ?? 0} total={Math.max(cards.contasAPagar ?? 0, cards.contasPagas ?? 0)} tone="green" />
          <FinanceBar label="Resultado liquido" value={Math.max(cards.resultadoLiquido ?? 0, 0)} total={Math.max(cards.recebidoTotal ?? 0, 1)} tone={(cards.resultadoLiquido ?? 0) >= 0 ? 'green' : 'red'} />
        </div>
      </Panel>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Despesas por categoria">
          <ExpenseCategoryChart items={data?.despesasCategorias ?? []} />
        </Panel>

        <Panel title="Resultado liquido mensal">
          <MonthlyResultChart items={data?.resumoMensal ?? []} />
        </Panel>
      </section>

      <Panel title="Indicadores por tipo de aparelho">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">Categoria</th>
                <th className="p-3 text-right">OS</th>
                <th className="p-3 text-right">Finalizadas</th>
                <th className="p-3 text-right">Faturamento</th>
                <th className="p-3 text-right">Ticket medio</th>
                <th className="p-3 text-right">Margem</th>
                <th className="p-3 text-right">MTTR medio</th>
                <th className="p-3 text-right">Menor/Maior</th>
              </tr>
            </thead>
            <tbody>
              {!loading && (data?.ticketCategorias ?? []).length === 0 && <TableMessage text="Nenhuma categoria no periodo." colSpan={8} />}
              {!loading && (data?.ticketCategorias ?? []).map((item) => (
                <tr key={item.categoria} className="border-t border-slate-200">
                  <td className="p-3 font-black text-slate-950">{item.categoria}</td>
                  <td className="p-3 text-right">{item.totalOs}</td>
                  <td className="p-3 text-right">{item.finalizadas}</td>
                  <td className="p-3 text-right">{formatCurrency(item.faturamento)}</td>
                  <td className="p-3 text-right font-black text-slate-950">{formatCurrency(item.ticketBruto)}</td>
                  <td className="p-3 text-right font-black text-emerald-700">{formatCurrency(item.margem)}</td>
                  <td className="p-3 text-right font-black text-blue-700">{formatDurationHours(item.mttrHoras)}</td>
                  <td className="p-3 text-right text-xs font-bold text-slate-600">
                    {formatDurationHours(item.menorMttrHoras)} / {formatDurationHours(item.maiorMttrHoras)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Ultimas OS do periodo">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">OS</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Tecnico</th>
                <th className="p-3">Status</th>
                <th className="p-3">Origem</th>
                <th className="p-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableMessage text="Carregando..." />}
              {!loading && (data?.ultimasOrdens ?? []).length === 0 && <TableMessage text="Nenhuma OS no periodo." />}
              {!loading && (data?.ultimasOrdens ?? []).map((ordem) => (
                <tr key={ordem.id} className="border-t border-slate-200">
                  <td className="p-3 font-black text-slate-950">{ordem.numero_os ?? `#${ordem.id}`}</td>
                  <td className="p-3">{ordem.cliente}</td>
                  <td className="p-3">{ordem.tecnico}</td>
                  <td className="p-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                      {formatStatus(ordem.status)}
                    </span>
                  </td>
                  <td className="p-3">{ordem.origemFinanceira ?? (ordem.garantia ? 'GARANTIDOR/SEGURADORA' : 'CLIENTE')}</td>
                  <td className="p-3 text-right font-bold">{formatCurrency(ordem.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'slate',
  destaque = false,
}: {
  label: string
  value: string
  tone?: 'slate' | 'green' | 'blue' | 'amber' | 'red'
  destaque?: boolean
}) {
  const tones = {
    slate: 'border-slate-200 text-slate-950',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  }

  return (
    <div className={`min-w-0 rounded-lg border bg-white px-3 py-2.5 shadow-sm ${destaque ? 'sm:py-3' : ''} ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase leading-tight opacity-70 sm:text-xs">{label}</p>
      <p className={`${destaque ? 'text-lg sm:text-2xl' : 'text-base sm:text-xl'} mt-1 break-words font-black leading-tight`}>
        {value}
      </p>
    </div>
  )
}

function SlaMetric({ title, item, loading }: { title: string; item?: SlaResumo; loading: boolean }) {
  const foraPrazo = item?.foraPrazo ?? 0
  const tone = foraPrazo > 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'

  return (
    <div className={`min-w-0 rounded-lg border px-3 py-2.5 shadow-sm ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase leading-tight opacity-70 sm:text-xs">{title}</p>
          <p className="mt-1 text-base font-black leading-tight sm:text-xl">
            {loading ? '...' : `${item?.percentualDentro ?? 0}%`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 text-[10px] font-black">
          {item?.limiteDias ?? 0} dias
        </span>
      </div>
      <p className="mt-1 text-[11px] font-bold leading-tight opacity-80 sm:text-xs">
        {loading
          ? 'Calculando...'
          : `${item?.dentroPrazo ?? 0} dentro • ${foraPrazo} fora • media ${item?.mediaDias ?? 0}d`}
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-black text-slate-950">{title}</h2>
      {children}
    </section>
  )
}

function SlaGarantidorList({ items }: { items: Array<SlaResumo & { garantidor: string }> }) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhuma OS em garantia no periodo.</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const alerta = item.foraPrazo > 0
        return (
          <div
            key={item.garantidor}
            className={`rounded-lg px-3 py-2 ${alerta ? 'border border-red-200 bg-red-50' : 'bg-slate-50'}`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className={`truncate text-sm font-black ${alerta ? 'text-red-700' : 'text-slate-950'}`}>
                  {item.garantidor}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {item.total} OS • limite {item.limiteDias} dias • media {item.mediaDias}d
                </p>
              </div>
              <span className={`shrink-0 text-sm font-black ${alerta ? 'text-red-700' : 'text-emerald-700'}`}>
                {item.percentualDentro}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
              <div
                className={`h-full rounded-full ${alerta ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, Math.max(0, item.percentualDentro))}%` }}
              />
            </div>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {item.dentroPrazo} dentro SLA • {item.foraPrazo} fora SLA
            </p>
          </div>
        )
      })}
    </div>
  )
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="text-base font-black text-slate-950">{value}</p>
    </div>
  )
}

function FilterInput({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-black text-slate-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function VerticalBarChart({ items, empty }: { items: Array<{ label: string; value: number; display: string }>; empty: string }) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>
  }

  const max = Math.max(...items.map((item) => item.value), 1)

  return (
    <div className="flex h-52 items-end gap-3 rounded-lg bg-slate-50 px-4 pb-3 pt-4">
      {items.map((item) => {
        const height = Math.max(8, (item.value / max) * 100)
        return (
          <div key={`${item.label}-${item.display}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-xs font-black text-slate-800">{item.value}</span>
            <div className="flex h-32 w-full max-w-12 items-end rounded-lg bg-white shadow-inner">
              <div className="w-full rounded-b-lg rounded-t-sm bg-orange-500" style={{ height: `${height}%` }} />
            </div>
            <span className="w-full truncate text-center text-[11px] font-bold text-slate-600" title={item.display}>
              {item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PieChart({ items, empty }: { items: Array<{ label: string; value: number; display: string }>; empty: string }) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>
  }

  const total = items.reduce((acc, item) => acc + item.value, 0)
  const colors = ['#f97316', '#2563eb', '#10b981', '#a855f7', '#ef4444', '#64748b']
  const gradient = items
    .map((item, index) => {
      const anterior = items.slice(0, index).reduce((acc, atual) => acc + atual.value, 0)
      const inicio = (anterior / total) * 100
      const fim = ((anterior + item.value) / total) * 100
      return `${colors[index % colors.length]} ${inicio}% ${fim}%`
    })
    .join(', ')

  return (
    <div className="grid gap-4 rounded-lg bg-slate-50 p-4 md:grid-cols-[170px_1fr] md:items-center">
      <div className="relative mx-auto h-40 w-40 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
          <span className="text-2xl font-black text-slate-950">{total}</span>
          <span className="text-xs font-bold text-slate-500">OS</span>
        </div>
      </div>

      <div className="grid gap-2">
        {items.map((item, index) => {
          const percentual = total > 0 ? (item.value / total) * 100 : 0
          return (
            <div key={`${item.label}-${item.display}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="truncate text-xs font-black text-slate-800">{item.label}</span>
              </div>
              <span className="shrink-0 text-xs font-bold text-slate-500">
                {item.value} • {percentual.toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ExpenseCategoryChart({ items }: { items: Array<{ categoria: string; valor: number }> }) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhuma conta paga no periodo.</p>
  }

  const max = Math.max(...items.map((item) => item.valor), 1)

  return (
    <div className="space-y-2">
      {items.slice(0, 10).map((item) => (
        <div key={item.categoria} className="rounded-lg bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="truncate text-xs font-black uppercase text-slate-600">{formatarCategoriaConta(item.categoria)}</p>
            <p className="text-sm font-black text-slate-950">{formatCurrency(item.valor)}</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-orange-500"
              style={{ width: `${Math.max(5, (item.valor / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function MonthlyResultChart({ items }: { items: RelatoriosData['resumoMensal'] }) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Sem resultado mensal.</p>
  }

  const max = Math.max(...items.map((item) => Math.abs(item.resultadoLiquido ?? 0)), 1)

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex h-52 items-end gap-3">
        {items.map((item) => {
          const resultado = item.resultadoLiquido ?? 0
          const altura = Math.max(4, (Math.abs(resultado) / max) * 100)
          return (
            <div key={item.chave} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-36 w-full max-w-12 items-end rounded-lg bg-white">
                <div
                  className={`w-full rounded-b-lg rounded-t-sm ${resultado >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                  style={{ height: `${altura}%` }}
                />
              </div>
              <span className="text-[10px] font-black uppercase text-slate-600">{item.label}</span>
              <span className="text-[10px] font-bold text-slate-500">{formatCurrency(resultado)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 grid gap-2 text-xs font-bold text-slate-500 sm:grid-cols-3">
        <span>Verde: lucro</span>
        <span>Vermelho: prejuizo</span>
        <span>Base: recebido - tecnico - contas</span>
      </div>
    </div>
  )
}

function MonthlyChart({ items, meta }: { items: RelatoriosData['resumoMensal']; meta: number }) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Sem dados mensais.</p>
  }

  const max = Math.max(...items.map((item) => item.valor), meta, 1)

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex h-52 items-end gap-3">
        {items.map((item) => {
          const alturaValor = Math.max(4, (item.valor / max) * 100)
          const alturaMeta = meta > 0 ? Math.max(2, (meta / max) * 100) : 0
          return (
            <div key={item.chave} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="relative flex h-36 w-full max-w-12 items-end rounded-lg bg-white">
                {meta > 0 && (
                  <span
                    className="absolute left-0 right-0 border-t-2 border-dashed border-red-400"
                    style={{ bottom: `${alturaMeta}%` }}
                  />
                )}
                <div className="w-full rounded-b-lg rounded-t-sm bg-blue-500" style={{ height: `${alturaValor}%` }} />
              </div>
              <span className="text-[10px] font-black uppercase text-slate-600">{item.label}</span>
              <span className="text-[10px] font-bold text-slate-500">{formatCurrency(item.valor)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs font-bold text-slate-500">
        <span className="inline-flex items-center gap-1"><i className="h-2 w-4 rounded bg-blue-500" /> Realizado</span>
        <span className="inline-flex items-center gap-1"><i className="h-0 w-4 border-t-2 border-dashed border-red-400" /> Meta</span>
      </div>
    </div>
  )
}

function FinanceBar({
  label,
  value,
  total,
  tone,
}: {
  label: string
  value: number
  total: number
  tone: 'green' | 'amber' | 'red'
}) {
  const colors = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }
  const percentual = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase text-slate-500">{label}</p>
        <p className="text-sm font-black text-slate-950">{percentual.toFixed(0)}%</p>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${percentual}%` }} />
      </div>
      <p className="mt-2 text-lg font-black text-slate-950">{formatCurrency(value)}</p>
    </div>
  )
}

function SimpleList({ items, empty }: { items: Array<{ title: string; meta: string; value: string }>; empty: string }) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={`${item.title}-${item.meta}`} className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{item.title}</p>
            <p className="truncate text-xs text-slate-500">{item.meta}</p>
          </div>
          <span className="shrink-0 text-sm font-black text-slate-900">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function TableMessage({ text, colSpan = 6 }: { text: string; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-5 text-sm text-slate-500">{text}</td>
    </tr>
  )
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDurationHours(value: number) {
  const hours = Number(value || 0)
  if (hours <= 0) return '-'
  if (hours < 24) return `${Math.round(hours)}h`

  const days = Math.floor(hours / 24)
  const remainingHours = Math.round(hours % 24)
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

function formatCsvCell(value: string) {
  const escaped = String(value ?? '').replace(/"/g, '""')
  return `"${escaped}"`
}

function formatStatus(status?: string | null) {
  const map: Record<string, string> = {
    NOVA: 'Nova',
    EM_TRIAGEM: 'Em triagem',
    EM_ATENDIMENTO: 'Em atendimento',
    PRONTO_AGUARDANDO_ENTREGA: 'Pronto aguardando entrega',
    AGUARDANDO_APROVACAO: 'Aguard. aprovacao',
    AGUARDANDO_PECA: 'Aguard. peca',
    CRITICA: 'Critica',
    FINALIZADA: 'Finalizada',
  }

  return map[String(status ?? '')] ?? String(status ?? '-')
}

function formatarCategoriaConta(categoria?: string | null) {
  const value = String(categoria ?? '').toUpperCase()
  const labels: Record<string, string> = {
    OPERACIONAL: 'Operacional',
    ADMINISTRATIVO: 'Administrativo',
    IMPOSTOS: 'Impostos',
    FORNECEDOR: 'Fornecedor',
    PECAS_ESTOQUE: 'Pecas/estoque',
    DESLOCAMENTO: 'Deslocamento',
    COMBUSTIVEL: 'Combustivel',
    SISTEMAS: 'Sistemas',
    MARKETING: 'Marketing',
    ALUGUEL: 'Aluguel',
    CONTABILIDADE: 'Contabilidade',
    TAXAS_BANCARIAS: 'Taxas bancarias',
    ESTOQUE: 'Estoque',
    OUTROS: 'Outros',
  }

  return labels[value] ?? (value || '-')
}

function formatFilterLabel(value: string) {
  if (value === 'TODOS') return 'Todos'
  if (value === 'CLIENTE') return 'Cliente'
  if (value === 'GARANTIDOR') return 'Garantidor/Seguradora'
  return formatStatus(value)
}
