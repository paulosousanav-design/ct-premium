'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type ClienteResumo = {
  id: number
  ids: number[]
  nome: string
  cpf_cnpj: string | null
  whatsapp: string | null
  email: string | null
  cep: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  total_os: number
  os_garantia: number
  os_particular: number
  valor_total: number
  ticket_medio: number
  ultimo_status: string | null
  ultima_os: string | null
  ultimo_atendimento: string | null
}

type ClientesResponse = {
  filtros: {
    inicio: string | null
    fim: string | null
    busca: string
    estado: string
    cidade: string
    opcoes: {
      estados: string[]
      cidades: string[]
    }
  }
  resumo: {
    total: number
    comOs: number
    garantia: number
    particulares: number
    faturamento: number
  }
  clientes: ClienteResumo[]
}

function getPeriodoInicial() {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: hoje.toISOString().slice(0, 10),
  }
}

export default function ClientesPage() {
  const periodoInicial = useMemo(() => getPeriodoInicial(), [])
  const [inicio, setInicio] = useState(periodoInicial.inicio)
  const [fim, setFim] = useState(periodoInicial.fim)
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('')
  const [cidade, setCidade] = useState('')
  const [data, setData] = useState<ClientesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setLoading(true)
    setErro('')

    try {
      const params = new URLSearchParams({
        inicio,
        fim,
        busca,
        estado,
        cidade,
      })
      const response = await adminFetch(`/api/admin/clientes?${params.toString()}`)
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar clientes.')

      setData(payload as ClientesResponse)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }, [busca, cidade, estado, fim, inicio])

  useEffect(() => {
    void Promise.resolve().then(() => carregar())
  }, [carregar])

  const resumo = data?.resumo
  const clientes = data?.clientes ?? []
  const opcoes = data?.filtros.opcoes

  function limparFiltros() {
    setBusca('')
    setEstado('')
    setCidade('')
    setInicio(periodoInicial.inicio)
    setFim(periodoInicial.fim)
  }

  function exportarCsv() {
    if (!data) return

    const linhas = [
      ['Relatorio de clientes'],
      [`Periodo: ${inicio} ate ${fim}`],
      [],
      ['Nome', 'CPF/CNPJ', 'WhatsApp', 'E-mail', 'Cidade', 'UF', 'Total OS', 'Garantia', 'Particular', 'Valor total', 'Ticket medio', 'Ultima OS', 'Ultimo status', 'Ultimo atendimento', 'Endereco'],
      ...clientes.map((cliente) => [
        cliente.nome,
        cliente.cpf_cnpj ?? '',
        cliente.whatsapp ?? '',
        cliente.email ?? '',
        cliente.cidade ?? '',
        cliente.estado ?? '',
        String(cliente.total_os),
        String(cliente.os_garantia),
        String(cliente.os_particular),
        formatCurrency(cliente.valor_total),
        formatCurrency(cliente.ticket_medio),
        cliente.ultima_os ?? '',
        formatStatus(cliente.ultimo_status),
        formatDate(cliente.ultimo_atendimento),
        cliente.endereco ?? '',
      ]),
    ]

    const csv = linhas.map((linha) => linha.map(formatCsvCell).join(';')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `clientes-${inicio}-${fim}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <header className="rounded-xl bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase text-orange-600">Base de clientes</p>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950">Clientes</h1>
            <p className="text-sm text-slate-500">Consulte clientes cadastrados automaticamente pelas OS e exporte a base.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void carregar()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={exportarCsv}
              disabled={!data}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              Exportar CSV
            </button>
          </div>
        </div>
      </header>

      {erro && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Clientes" value={String(resumo?.total ?? 0)} />
        <Metric label="Com OS" value={String(resumo?.comOs ?? 0)} />
        <Metric label="Garantia" value={String(resumo?.garantia ?? 0)} tone="blue" />
        <Metric label="Particular" value={String(resumo?.particulares ?? 0)} tone="orange" />
        <Metric label="Valor total" value={formatCurrency(resumo?.faturamento ?? 0)} tone="green" />
      </section>

      <form onSubmit={carregar} className="rounded-xl bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Inicio">
            <input
              type="date"
              value={inicio}
              onChange={(event) => setInicio(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
            />
          </Field>
          <Field label="Fim">
            <input
              type="date"
              value={fim}
              onChange={(event) => setFim(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
            />
          </Field>
          <Field label="Estado">
            <select
              value={estado}
              onChange={(event) => {
                setEstado(event.target.value)
                setCidade('')
              }}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
            >
              <option value="">Todos</option>
              {(opcoes?.estados ?? []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Cidade">
            <select
              value={cidade}
              onChange={(event) => setCidade(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
            >
              <option value="">Todas</option>
              {(opcoes?.cidades ?? []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Busca" className="xl:col-span-2">
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Nome, CPF, WhatsApp, cidade ou OS..."
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={limparFiltros}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 hover:border-orange-400 hover:text-orange-600"
          >
            Limpar
          </button>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white"
          >
            Filtrar
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-base font-black text-slate-950">Clientes cadastrados</h2>
            <p className="text-xs text-slate-500">{clientes.length} registros visiveis.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Cidade/UF</th>
                <th className="px-3 py-2 text-center">OS</th>
                <th className="px-3 py-2 text-center">Garantia</th>
                <th className="px-3 py-2 text-center">Particular</th>
                <th className="px-3 py-2">Valor total</th>
                <th className="px-3 py-2">Ticket medio</th>
                <th className="px-3 py-2">Ultima OS</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <LinhaMensagem texto="Carregando clientes..." />}
              {!loading && clientes.length === 0 && <LinhaMensagem texto="Nenhum cliente encontrado." />}
              {!loading && clientes.map((cliente) => (
                <tr key={`${cliente.id}-${cliente.ids.join('-')}`} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-black text-slate-950">{cliente.nome}</div>
                    <div className="text-xs text-slate-500">{cliente.cpf_cnpj || 'Sem CPF/CNPJ'}</div>
                    <div className="mt-1 max-w-[320px] text-xs text-slate-500">{cliente.endereco || '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    <div>{cliente.whatsapp || '-'}</div>
                    <div className="text-xs text-slate-500">{cliente.email || '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{[cliente.cidade, cliente.estado].filter(Boolean).join(' / ') || '-'}</td>
                  <td className="px-3 py-2 text-center font-black text-slate-950">{cliente.total_os}</td>
                  <td className="px-3 py-2 text-center">{cliente.os_garantia}</td>
                  <td className="px-3 py-2 text-center">{cliente.os_particular}</td>
                  <td className="px-3 py-2 font-black text-slate-950">{formatCurrency(cliente.valor_total)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatCurrency(cliente.ticket_medio)}</td>
                  <td className="px-3 py-2">
                    <div className="font-bold text-slate-800">{cliente.ultima_os || '-'}</div>
                    <div className="text-xs text-slate-500">{formatDate(cliente.ultimo_atendimento)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                      {formatStatus(cliente.ultimo_status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'blue' | 'orange' | 'green' }) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-950',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    orange: 'border-orange-200 bg-orange-50 text-orange-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-black uppercase opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-xs font-black text-slate-600 ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function LinhaMensagem({ texto }: { texto: string }) {
  return (
    <tr>
      <td colSpan={10} className="px-3 py-6 text-center text-sm font-bold text-slate-500">
        {texto}
      </td>
    </tr>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatStatus(status?: string | null) {
  if (!status) return '-'
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatCsvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}
