'use client'

import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Garantidor = {
  id?: number
  nome: string
  cnpj: string
  inscricao_estadual: string
  tipo: string
  contato: string
  telefone: string
  email: string
  prazo_pagamento: number
  endereco: string
  observacoes: string
  ativo: boolean
}

const novoGarantidor: Garantidor = {
  nome: '',
  cnpj: '',
  inscricao_estadual: '',
  tipo: 'FABRICANTE',
  contato: '',
  telefone: '',
  email: '',
  prazo_pagamento: 30,
  endereco: '',
  observacoes: '',
  ativo: true,
}

export default function GarantidoresPage() {
  const [garantidores, setGarantidores] = useState<Garantidor[]>([])
  const [form, setForm] = useState<Garantidor>(novoGarantidor)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [busca, setBusca] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)

  useEffect(() => {
    void carregarGarantidores()
  }, [])

  const garantidoresFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return garantidores

    return garantidores.filter((item) =>
      [item.nome, item.cnpj, item.tipo, item.contato, item.telefone, item.email]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termo))
    )
  }, [busca, garantidores])

  const resumo = useMemo(() => {
    return {
      total: garantidores.length,
      ativos: garantidores.filter((item) => item.ativo).length,
      fabricantes: garantidores.filter((item) => item.tipo === 'FABRICANTE').length,
      seguradoras: garantidores.filter((item) => item.tipo === 'SEGURADORA').length,
    }
  }, [garantidores])

  async function carregarGarantidores() {
    setLoading(true)
    setErro('')

    const response = await adminFetch('/api/admin/garantidores')
    const payload = await response.json().catch(() => null)
    if (!response.ok) setErro(payload?.error ?? 'Erro ao carregar os garantidores.')
    setGarantidores((payload?.data || []) as Garantidor[])
    setLoading(false)
  }

  function atualizarCampo(name: keyof Garantidor, value: string | boolean | number) {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleInput(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target
    atualizarCampo(name as keyof Garantidor, name === 'prazo_pagamento' ? Number(value) : value)
  }

  async function salvarGarantidor() {
    if (!form.nome.trim()) {
      setErro('Informe o nome do garantidor.')
      return
    }

    setSalvando(true)
    setErro('')
    setMensagem('')

    const payload = {
      nome: form.nome,
      cnpj: form.cnpj,
      inscricao_estadual: form.inscricao_estadual,
      tipo: form.tipo,
      contato: form.contato,
      telefone: form.telefone,
      email: form.email,
      prazo_pagamento: form.prazo_pagamento,
      endereco: form.endereco,
      observacoes: form.observacoes,
      ativo: form.ativo,
    }

    const response = await adminFetch('/api/admin/garantidores', {
      method: editandoId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editandoId ? { ...payload, id: editandoId } : payload),
    })
    const result = await response.json().catch(() => null)

    setSalvando(false)

    if (!response.ok) {
      setErro(result?.error ?? 'Erro ao salvar o garantidor.')
      return
    }

    setMensagem(editandoId ? 'Garantidor atualizado com sucesso.' : 'Garantidor cadastrado com sucesso.')
    setForm(novoGarantidor)
    setEditandoId(null)
    await carregarGarantidores()
  }

  function editarGarantidor(item: Garantidor) {
    setForm({
      id: item.id,
      nome: item.nome ?? '',
      cnpj: item.cnpj ?? '',
      inscricao_estadual: item.inscricao_estadual ?? '',
      tipo: item.tipo ?? 'FABRICANTE',
      contato: item.contato ?? '',
      telefone: item.telefone ?? '',
      email: item.email ?? '',
      prazo_pagamento: Number(item.prazo_pagamento ?? 30),
      endereco: item.endereco ?? '',
      observacoes: item.observacoes ?? '',
      ativo: item.ativo !== false,
    })
    setEditandoId(item.id ?? null)
    setErro('')
    setMensagem('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicao() {
    setForm(novoGarantidor)
    setEditandoId(null)
    setErro('')
    setMensagem('')
  }

  async function alternarStatus(item: Garantidor) {
    const response = await adminFetch('/api/admin/garantidores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, ativo: !item.ativo, somenteStatus: true }),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setErro(result?.error ?? 'Erro ao alterar o status do garantidor.')
      return
    }

    await carregarGarantidores()
  }

  return (
    <div className="space-y-4">
      <header className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-xs font-black uppercase text-orange-600">Garantia e seguradoras</p>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950">Garantidores</h1>
            <p className="text-sm text-slate-500">Fabricantes, seguradoras e parceiros financeiros.</p>
          </div>
          <button
            type="button"
            onClick={() => void carregarGarantidores()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white"
          >
            Atualizar
          </button>
        </div>
      </header>

      {erro && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{mensagem}</div>}

      <section className="grid gap-2 md:grid-cols-4">
        <Card titulo="Total" valor={String(resumo.total)} />
        <Card titulo="Fabricantes" valor={String(resumo.fabricantes)} />
        <Card titulo="Seguradoras" valor={String(resumo.seguradoras)} />
        <Card titulo="Ativos" valor={String(resumo.ativos)} />
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">
              {editandoId ? 'Editar garantidor' : 'Novo garantidor'}
            </h2>
            <p className="text-xs text-slate-500">
              {editandoId ? 'Atualize os dados do garantidor selecionado.' : 'Cadastre fabricantes, seguradoras e parceiros.'}
            </p>
          </div>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicao}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:border-orange-400 hover:text-orange-600"
            >
              Cancelar edição
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Input label="Nome" name="nome" value={form.nome} onChange={handleInput} required />
          <Input label="CNPJ" name="cnpj" value={form.cnpj} onChange={handleInput} />
          <Input label="Inscricao estadual" name="inscricao_estadual" value={form.inscricao_estadual} onChange={handleInput} />

          <label className="block text-xs font-bold text-slate-600">
            Tipo
            <select
              name="tipo"
              value={form.tipo}
              onChange={handleInput}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
            >
              <option>FABRICANTE</option>
              <option>SEGURADORA</option>
              <option>FORNECEDOR</option>
              <option>OUTRO</option>
            </select>
          </label>

          <Input label="Contato" name="contato" value={form.contato} onChange={handleInput} />
          <Input label="Telefone" name="telefone" value={form.telefone} onChange={handleInput} />
          <Input label="E-mail" name="email" value={form.email} onChange={handleInput} type="email" />
          <Input label="Prazo (dias)" name="prazo_pagamento" value={String(form.prazo_pagamento)} onChange={handleInput} type="number" />
          <Input label="Endereco" name="endereco" value={form.endereco} onChange={handleInput} className="md:col-span-2" />

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(event) => atualizarCampo('ativo', event.target.checked)}
              className="accent-orange-500"
            />
            Garantidor ativo
          </label>
        </div>

        <label className="mt-3 block text-xs font-bold text-slate-600">
          Observacoes
          <textarea
            name="observacoes"
            value={form.observacoes}
            onChange={handleInput}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          />
        </label>

        <button
          type="button"
          onClick={salvarGarantidor}
          disabled={salvando}
          className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Salvar garantidor'}
        </button>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">Garantidores cadastrados</h2>
            <p className="text-xs text-slate-500">{garantidoresFiltrados.length} registros visiveis.</p>
          </div>
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar garantidor, CNPJ, contato..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 md:max-w-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Telefone</th>
                <th className="px-3 py-2">Prazo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading && <LinhaMensagem texto="Carregando..." />}
              {!loading && garantidoresFiltrados.length === 0 && <LinhaMensagem texto="Nenhum garantidor cadastrado." />}
              {!loading && garantidoresFiltrados.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-black text-slate-950">{item.nome}</div>
                    <div className="text-xs text-slate-500">{item.cnpj || 'Sem CNPJ'} {item.email ? `- ${item.email}` : ''}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{item.tipo}</td>
                  <td className="px-3 py-2 text-slate-600">{item.contato || '-'}</td>
                  <td className="px-3 py-2 text-slate-600">{item.telefone || '-'}</td>
                  <td className="px-3 py-2 text-slate-600">{item.prazo_pagamento} dias</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {item.ativo ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => editarGarantidor(item)}
                        className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        Editar
                      </button>
                    <button
                      type="button"
                      onClick={() => void alternarStatus(item)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700 hover:border-orange-400 hover:text-orange-600"
                    >
                      {item.ativo ? 'Inativar' : 'Ativar'}
                    </button>
                    </div>
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

function Card({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="text-xs font-black uppercase text-slate-500">{titulo}</div>
      <div className="mt-0.5 text-xl font-black text-slate-950">{valor}</div>
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
  className = '',
}: {
  label: string
  name: string
  value: string
  type?: string
  required?: boolean
  className?: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className={`block text-xs font-bold text-slate-600 ${className}`}>
      {label}{required ? ' *' : ''}
      <input
        type={type}
        name={name}
        value={value}
        required={required}
        onChange={onChange}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
      />
    </label>
  )
}

function LinhaMensagem({ texto }: { texto: string }) {
  return (
    <tr>
      <td colSpan={7} className="p-4 text-sm text-slate-500">{texto}</td>
    </tr>
  )
}
