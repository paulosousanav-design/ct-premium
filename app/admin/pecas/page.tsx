'use client'

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Peca = {
  id: number
  codigo: string | null
  descricao: string
  categoria: string | null
  marca: string | null
  valor_custo: number | string | null
  valor_venda: number | string | null
  estoque: number | string | null
  estoque_minimo: number | string | null
  localizacao: string | null
  ativo: boolean | null
}

const novaPecaInicial = {
  codigo: '',
  descricao: '',
  categoria: '',
  marca: '',
  valor_custo: '',
  valor_venda: '',
  estoque: '',
  estoque_minimo: '',
  localizacao: '',
  ativo: true,
}

export default function PecasPage() {
  const [pecas, setPecas] = useState<Peca[]>([])
  const [form, setForm] = useState(novaPecaInicial)
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [tabelaPendente, setTabelaPendente] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)

  useEffect(() => {
    void carregarPecas()
  }, [])

  const pecasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return pecas

    return pecas.filter((peca) =>
      [peca.codigo, peca.descricao, peca.categoria, peca.marca, peca.localizacao]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(termo))
    )
  }, [pecas, busca])

  const resumo = useMemo(() => {
    return {
      total: pecas.length,
      ativas: pecas.filter((peca) => peca.ativo !== false).length,
      baixo: pecas.filter((peca) => toNumber(peca.estoque) <= toNumber(peca.estoque_minimo)).length,
      valorCustoEstoque: pecas.reduce((acc, peca) => acc + toNumber(peca.estoque) * toNumber(peca.valor_custo), 0),
      valorVendaEstoque: pecas.reduce((acc, peca) => acc + toNumber(peca.estoque) * toNumber(peca.valor_venda), 0),
    }
  }, [pecas])
  const lucroPotencial = resumo.valorVendaEstoque - resumo.valorCustoEstoque
  const margemPotencial = resumo.valorVendaEstoque > 0 ? (lucroPotencial / resumo.valorVendaEstoque) * 100 : 0

  async function carregarPecas() {
    setLoading(true)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/pecas')
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar pecas.')

      setPecas((payload?.data ?? []) as Peca[])
      setTabelaPendente(Boolean(payload?.tabelaPendente))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar pecas.')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value, checked, type } = event.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  async function salvarPeca(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSalvando(true)
    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/pecas', {
        method: editandoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editandoId ? { ...form, id: editandoId } : form),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao salvar peca.')

      setMensagem(editandoId ? 'Peca atualizada com sucesso.' : 'Peca cadastrada com sucesso.')
      setForm(novaPecaInicial)
      setEditandoId(null)
      await carregarPecas()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar peca.')
    } finally {
      setSalvando(false)
    }
  }

  function editarPeca(peca: Peca) {
    setEditandoId(peca.id)
    setMensagem('')
    setErro('')
    setForm({
      codigo: peca.codigo ?? '',
      descricao: peca.descricao ?? '',
      categoria: peca.categoria ?? '',
      marca: peca.marca ?? '',
      valor_custo: String(peca.valor_custo ?? ''),
      valor_venda: String(peca.valor_venda ?? ''),
      estoque: String(peca.estoque ?? ''),
      estoque_minimo: String(peca.estoque_minimo ?? ''),
      localizacao: peca.localizacao ?? '',
      ativo: peca.ativo !== false,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setForm(novaPecaInicial)
    setMensagem('')
    setErro('')
  }

  function exportarRelatorio() {
    const linhas = [
      ['Relatorio de pecas'],
      [],
      ['Resumo', 'Valor'],
      ['Total de pecas', String(resumo.total)],
      ['Custo em estoque', formatCurrency(resumo.valorCustoEstoque)],
      ['Venda potencial', formatCurrency(resumo.valorVendaEstoque)],
      ['Lucro potencial', formatCurrency(lucroPotencial)],
      ['Margem potencial', `${margemPotencial.toFixed(1)}%`],
      [],
      ['Codigo', 'Descricao', 'Categoria', 'Marca', 'Estoque', 'Custo unitario', 'Venda unitaria', 'Lucro unitario', 'Margem %', 'Custo estoque', 'Venda estoque', 'Localizacao', 'Ativo'],
      ...pecasFiltradas.map((peca) => {
        const custo = toNumber(peca.valor_custo)
        const venda = toNumber(peca.valor_venda)
        const estoque = toNumber(peca.estoque)
        const lucro = venda - custo
        const margem = venda > 0 ? (lucro / venda) * 100 : 0
        return [
          peca.codigo ?? '',
          peca.descricao,
          peca.categoria ?? '',
          peca.marca ?? '',
          String(estoque),
          formatCurrency(custo),
          formatCurrency(venda),
          formatCurrency(lucro),
          `${margem.toFixed(1)}%`,
          formatCurrency(custo * estoque),
          formatCurrency(venda * estoque),
          peca.localizacao ?? '',
          peca.ativo === false ? 'NAO' : 'SIM',
        ]
      }),
    ]

    const csv = linhas.map((linha) => linha.map(formatCsvCell).join(';')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'relatorio-pecas.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-orange-600">Estoque interno</p>
          <h1 className="text-2xl font-black text-slate-950">Cadastro de Pecas</h1>
          <p className="text-sm text-slate-500">Pecas cadastradas ficam disponiveis para uso nas ordens de servico pelo admin.</p>
        </div>
        <button type="button" onClick={carregarPecas} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">
          Atualizar
        </button>
      </header>

      {erro && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{mensagem}</div>}
      {tabelaPendente && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          Rode o SQL atualizado para criar a tabela pecas.
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-4">
        <Card label="Total" value={String(resumo.total)} />
        <Card label="Ativas" value={String(resumo.ativas)} />
        <Card label="Estoque baixo" value={String(resumo.baixo)} alert={resumo.baixo > 0} />
        <Card label="Custo em estoque" value={formatCurrency(resumo.valorCustoEstoque)} />
        <Card label="Venda potencial" value={formatCurrency(resumo.valorVendaEstoque)} />
        <Card label="Lucro potencial" value={formatCurrency(lucroPotencial)} alert={lucroPotencial < 0} />
        <Card label="Margem media" value={`${margemPotencial.toFixed(1)}%`} alert={margemPotencial < 0} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <form onSubmit={salvarPeca} className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-950">{editandoId ? 'Editar peca' : 'Nova peca'}</h2>
            {editandoId && (
              <button type="button" onClick={cancelarEdicao} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-black text-slate-600">
                Cancelar
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input label="Codigo" name="codigo" value={form.codigo} onChange={handleChange} />
            <Input label="Descricao" name="descricao" value={form.descricao} onChange={handleChange} required />
            <Input label="Categoria" name="categoria" value={form.categoria} onChange={handleChange} />
            <Input label="Marca" name="marca" value={form.marca} onChange={handleChange} />
            <Input label="Custo" name="valor_custo" value={form.valor_custo} onChange={handleChange} type="number" step="0.01" />
            <Input label="Venda" name="valor_venda" value={form.valor_venda} onChange={handleChange} type="number" step="0.01" />
            <Input label="Estoque" name="estoque" value={form.estoque} onChange={handleChange} type="number" step="1" />
            <Input label="Estoque minimo" name="estoque_minimo" value={form.estoque_minimo} onChange={handleChange} type="number" step="1" />
            <Input label="Localizacao" name="localizacao" value={form.localizacao} onChange={handleChange} className="sm:col-span-2" />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 sm:col-span-2">
              <input type="checkbox" name="ativo" checked={form.ativo} onChange={handleChange} />
              Peca ativa
            </label>
          </div>
          <button
            type="submit"
            disabled={salvando || tabelaPendente}
            className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? 'Salvando...' : editandoId ? 'Salvar alteracoes' : 'Salvar peca'}
          </button>
        </form>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Pecas cadastradas</h2>
              <p className="text-xs text-slate-500">{pecasFiltradas.length} registros visiveis.</p>
            </div>
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar codigo, descricao, marca..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 md:max-w-sm"
            />
            <button
              type="button"
              onClick={exportarRelatorio}
              disabled={loading || pecasFiltradas.length === 0}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Exportar relatório
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Peca</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Estoque</th>
                  <th className="p-3">Custo</th>
                  <th className="p-3">Venda</th>
                  <th className="p-3">Lucro</th>
                  <th className="p-3">Margem</th>
                  <th className="p-3">Local</th>
                  <th className="p-3">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {loading && <LinhaMensagem texto="Carregando..." />}
                {!loading && pecasFiltradas.length === 0 && <LinhaMensagem texto="Nenhuma peca cadastrada." />}
                {!loading && pecasFiltradas.map((peca) => {
                  const estoqueBaixo = toNumber(peca.estoque) <= toNumber(peca.estoque_minimo)
                  const custo = toNumber(peca.valor_custo)
                  const venda = toNumber(peca.valor_venda)
                  const lucro = venda - custo
                  const margem = venda > 0 ? (lucro / venda) * 100 : 0
                  return (
                    <tr key={peca.id} className="border-t border-slate-200">
                      <td className="p-3">
                        <div className="font-black text-slate-950">{peca.descricao}</div>
                        <div className="text-xs text-slate-500">{peca.codigo || 'Sem codigo'} • {peca.marca || 'Sem marca'}</div>
                      </td>
                      <td className="p-3 text-slate-600">{peca.categoria || '-'}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${estoqueBaixo ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {toNumber(peca.estoque)}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-700">{formatCurrency(custo)}</td>
                      <td className="p-3 font-bold text-slate-900">{formatCurrency(venda)}</td>
                      <td className={`p-3 font-black ${lucro < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatCurrency(lucro)}</td>
                      <td className={`p-3 font-black ${margem < 0 ? 'text-red-600' : 'text-slate-900'}`}>{margem.toFixed(1)}%</td>
                      <td className="p-3 text-slate-600">{peca.localizacao || '-'}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => editarPeca(peca)}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-black text-white"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}

function Card({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${alert ? 'border-red-300' : 'border-slate-200'}`}>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${alert ? 'text-red-600' : 'text-slate-950'}`}>{value}</p>
    </div>
  )
}

function Input({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = false,
  step,
  className = '',
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  type?: string
  required?: boolean
  step?: string
  className?: string
}) {
  return (
    <label className={`block text-sm font-bold text-slate-700 ${className}`}>
      {label}{required ? ' *' : ''}
      <input
        name={name}
        value={value}
        onChange={onChange}
        type={type}
        required={required}
        step={step}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500"
      />
    </label>
  )
}

function LinhaMensagem({ texto }: { texto: string }) {
  return (
    <tr>
      <td colSpan={9} className="p-5 text-sm text-slate-500">{texto}</td>
    </tr>
  )
}

function formatCsvCell(value: string) {
  const escaped = String(value ?? '').replace(/"/g, '""')
  return `"${escaped}"`
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}
