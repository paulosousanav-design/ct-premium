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
  ticketCategorias: Array<{
    categoria: string
    totalOs: number
    faturamento: number
    tecnico: number
    margem: number
    ticketBruto: number
    ticketMargem: number
  }>
  resumoMensal: Array<{ chave: string; label: string; totalOs: number; valor: number; recebido: number }>
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
  }, [fim, garantidor, inicio, origemFinanceira, statusFinanceiro, statusOs, tecnico])

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
      [],
      ['Indicador', 'Valor'],
      ['OS no periodo', String(cards.totalOs ?? 0)],
      ['Novas', String(cards.novas ?? 0)],
      ['Em tratamento', String(cards.emAndamento ?? 0)],
      ['Finalizadas', String(cards.finalizadas ?? 0)],
      ['Garantia', String(cards.garantia ?? 0)],
      ['Valor cliente', formatCurrency(cards.valorCliente ?? 0)],
      ['Recebido cliente', formatCurrency(cards.recebidoCliente ?? 0)],
      ['A receber cliente', formatCurrency(cards.aReceberCliente ?? 0)],
      ['Valor garantidor/seguradora', formatCurrency(cards.valorGarantidor ?? 0)],
      ['Recebido garantidor/seguradora', formatCurrency(cards.recebidoGarantidor ?? 0)],
      ['A receber garantidor/seguradora', formatCurrency(cards.aReceberGarantidor ?? 0)],
      ['Faturamento total', formatCurrency(cards.valorFaturamento ?? 0)],
      ['Recebido total', formatCurrency(cards.recebidoTotal ?? 0)],
      ['A pagar tecnico', formatCurrency(cards.aPagarTecnico ?? 0)],
      ['Pago tecnico', formatCurrency(cards.pagoTecnico ?? 0)],
      ['Margem total', formatCurrency(cards.margemTotal ?? 0)],
      ['Ticket medio bruto', formatCurrency(cards.ticketMedioBruto ?? 0)],
      ['Ticket medio margem', formatCurrency(cards.ticketMedioMargem ?? 0)],
      [],
      ['Ticket por categoria'],
      ['Categoria', 'OS', 'Faturamento', 'Tecnico', 'Margem', 'Ticket bruto', 'Ticket margem'],
      ...data.ticketCategorias.map((item) => [
        item.categoria,
        String(item.totalOs),
        formatCurrency(item.faturamento),
        formatCurrency(item.tecnico),
        formatCurrency(item.margem),
        formatCurrency(item.ticketBruto),
        formatCurrency(item.ticketMargem),
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

      <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="OS no periodo" value={loading ? '...' : String(cards.totalOs ?? 0)} />
        <Metric label="Novas" value={loading ? '...' : String(cards.novas ?? 0)} tone="green" />
        <Metric label="Em tratamento" value={loading ? '...' : String(cards.emAndamento ?? 0)} tone="blue" />
        <Metric label="Finalizadas" value={loading ? '...' : String(cards.finalizadas ?? 0)} />
        <Metric label="Garantia" value={loading ? '...' : String(cards.garantia ?? 0)} tone="amber" />
        <Metric label="Estoque baixo" value={loading ? '...' : String(cards.estoqueBaixo ?? 0)} tone={(cards.estoqueBaixo ?? 0) > 0 ? 'red' : 'green'} />
      </section>

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Faturamento total" value={formatCurrency(cards.valorFaturamento ?? 0)} />
        <Metric label="Total recebido" value={formatCurrency(cards.recebidoTotal ?? 0)} tone="green" />
        <Metric label="Recebido cliente" value={formatCurrency(cards.recebidoCliente ?? 0)} tone="green" />
        <Metric label="A receber cliente" value={formatCurrency(cards.aReceberCliente ?? 0)} tone="amber" />
        <Metric label="Recebido garantidor/seguradora" value={formatCurrency(cards.recebidoGarantidor ?? 0)} tone="green" />
        <Metric label="A receber garantidor/seguradora" value={formatCurrency(cards.aReceberGarantidor ?? 0)} tone="amber" />
        <Metric label="A pagar tecnico" value={formatCurrency(cards.aPagarTecnico ?? 0)} tone="red" />
        <Metric label="Pago tecnico" value={formatCurrency(cards.pagoTecnico ?? 0)} tone="blue" />
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FinanceBar label="Recebido cliente" value={cards.recebidoCliente ?? 0} total={cards.valorCliente ?? 0} tone="green" />
          <FinanceBar label="A receber cliente" value={cards.aReceberCliente ?? 0} total={cards.valorCliente ?? 0} tone="amber" />
          <FinanceBar label="Recebido garantidor" value={cards.recebidoGarantidor ?? 0} total={cards.valorGarantidor ?? 0} tone="green" />
          <FinanceBar label="A receber garantidor" value={cards.aReceberGarantidor ?? 0} total={cards.valorGarantidor ?? 0} tone="amber" />
          <FinanceBar label="A pagar tecnico" value={cards.aPagarTecnico ?? 0} total={Math.max(cards.aPagarTecnico ?? 0, cards.pagoTecnico ?? 0)} tone="red" />
        </div>
      </Panel>

      <Panel title="Ticket medio por categoria">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">Categoria</th>
                <th className="p-3 text-right">OS</th>
                <th className="p-3 text-right">Faturamento</th>
                <th className="p-3 text-right">Tecnico</th>
                <th className="p-3 text-right">Margem</th>
                <th className="p-3 text-right">Ticket bruto</th>
                <th className="p-3 text-right">Ticket margem</th>
              </tr>
            </thead>
            <tbody>
              {!loading && (data?.ticketCategorias ?? []).length === 0 && <TableMessage text="Nenhuma categoria com valor no periodo." colSpan={7} />}
              {!loading && (data?.ticketCategorias ?? []).map((item) => (
                <tr key={item.categoria} className="border-t border-slate-200">
                  <td className="p-3 font-black text-slate-950">{item.categoria}</td>
                  <td className="p-3 text-right">{item.totalOs}</td>
                  <td className="p-3 text-right">{formatCurrency(item.faturamento)}</td>
                  <td className="p-3 text-right">{formatCurrency(item.tecnico)}</td>
                  <td className="p-3 text-right font-black text-emerald-700">{formatCurrency(item.margem)}</td>
                  <td className="p-3 text-right">{formatCurrency(item.ticketBruto)}</td>
                  <td className="p-3 text-right font-black text-slate-950">{formatCurrency(item.ticketMargem)}</td>
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

function Metric({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'green' | 'blue' | 'amber' | 'red' }) {
  const tones = {
    slate: 'border-slate-200 text-slate-950',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  }

  return (
    <div className={`rounded-lg border bg-white px-3 py-2.5 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-black uppercase opacity-70">{label}</p>
      <p className="mt-0.5 text-xl font-black leading-tight">{value}</p>
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

function formatCsvCell(value: string) {
  const escaped = String(value ?? '').replace(/"/g, '""')
  return `"${escaped}"`
}

function formatStatus(status?: string | null) {
  const map: Record<string, string> = {
    NOVA: 'Nova',
    EM_TRIAGEM: 'Em triagem',
    EM_ATENDIMENTO: 'Em atendimento',
    AGUARDANDO_APROVACAO: 'Aguard. aprovacao',
    AGUARDANDO_PECA: 'Aguard. peca',
    CRITICA: 'Critica',
    FINALIZADA: 'Finalizada',
  }

  return map[String(status ?? '')] ?? String(status ?? '-')
}

function formatFilterLabel(value: string) {
  if (value === 'TODOS') return 'Todos'
  if (value === 'CLIENTE') return 'Cliente'
  if (value === 'GARANTIDOR') return 'Garantidor/Seguradora'
  return formatStatus(value)
}
