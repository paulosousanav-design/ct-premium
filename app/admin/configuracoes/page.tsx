'use client'

import Image from 'next/image'
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type EmpresaConfig = {
  id: number | null
  nome_fantasia: string
  razao_social: string
  cnpj: string
  whatsapp: string
  telefone: string
  email: string
  site: string
  cep: string
  logradouro: string
  numero: string
  bairro: string
  cidade: string
  estado: string
  complemento: string
  chave_pix: string
  logo_principal_url: string
  logo_reduzida_url: string
  cor_principal: string
  cor_secundaria: string
  texto_garantia: string
  texto_entrega: string
  ativa: boolean
}

type CategoriaEquipamento = {
  id: number
  nome: string | null
}

type MarcaEquipamento = {
  id: number
  nome: string | null
  categoria_id: number | null
}

type MarcaForm = {
  nome: string
  categoriaId: string
}

const empresaInicial: EmpresaConfig = {
  id: null,
  nome_fantasia: 'Chame o Tecnico',
  razao_social: '',
  cnpj: '',
  whatsapp: '',
  telefone: '',
  email: '',
  site: 'www.chameotecnico.com.br',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  cidade: '',
  estado: '',
  complemento: '',
  chave_pix: '',
  logo_principal_url: '/logo-chame-o-tecnico.png',
  logo_reduzida_url: '/logo-ct.png',
  cor_principal: '#ff6b00',
  cor_secundaria: '#031226',
  texto_garantia:
    'Garantia legal de 90 dias sobre o servico executado e pecas substituidas, conforme condicoes informadas na ordem de servico.',
  texto_entrega:
    'Declaro ter recebido o equipamento/servico nas condicoes descritas nesta ordem de servico.',
  ativa: true,
}

const marcaInicial: MarcaForm = {
  nome: '',
  categoriaId: '',
}

export default function ConfiguracoesPage() {
  const [form, setForm] = useState<EmpresaConfig>(empresaInicial)
  const [categoriasEquipamento, setCategoriasEquipamento] = useState<CategoriaEquipamento[]>([])
  const [marcasEquipamento, setMarcasEquipamento] = useState<MarcaEquipamento[]>([])
  const [categoriaForm, setCategoriaForm] = useState('')
  const [marcaForm, setMarcaForm] = useState<MarcaForm>(marcaInicial)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvandoEquipamento, setSalvandoEquipamento] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [tabelaPendente, setTabelaPendente] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)

  useEffect(() => {
    void carregar()
  }, [])

  const enderecoResumo = useMemo(() => {
    const partes = [form.logradouro, form.numero, form.bairro, form.cidade, form.estado].filter(Boolean)
    return partes.length > 0 ? partes.join(', ') : 'Endereco ainda nao informado'
  }, [form])

  async function carregar() {
    setLoading(true)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/configuracoes/empresa')
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar configuracoes.')

      setForm({ ...empresaInicial, ...(data?.data ?? {}) })
      setTabelaPendente(Boolean(data?.tabelaPendente))
      await carregarEquipamentos()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar configuracoes.')
    } finally {
      setLoading(false)
    }
  }

  async function carregarEquipamentos() {
    const response = await adminFetch('/api/admin/equipamentos')
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar tipos e marcas.')

    setCategoriasEquipamento((data?.categorias ?? []) as CategoriaEquipamento[])
    setMarcasEquipamento((data?.marcas ?? []) as MarcaEquipamento[])
  }

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = event.target
    const checked = 'checked' in event.target ? event.target.checked : false
    const maskedValue = aplicarMascara(name, value)

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : maskedValue,
    }))
  }

  async function buscarCep() {
    const cepLimpo = somenteNumeros(form.cep)
    if (cepLimpo.length !== 8) return

    setBuscandoCep(true)
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const data = await response.json()
      if (data?.erro) return

      setForm((prev) => ({
        ...prev,
        logradouro: data.logradouro ?? prev.logradouro,
        bairro: data.bairro ?? prev.bairro,
        cidade: data.localidade ?? prev.cidade,
        estado: data.uf ?? prev.estado,
      }))
    } finally {
      setBuscandoCep(false)
    }
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSalvando(true)
    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/configuracoes/empresa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao salvar configuracoes.')

      setForm({ ...empresaInicial, ...(data?.data ?? {}) })
      setTabelaPendente(false)
      setMensagem('Configuracoes da empresa salvas com sucesso.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar configuracoes.')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarCategoria() {
    setSalvandoEquipamento(true)
    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/equipamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'CATEGORIA', nome: categoriaForm }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao cadastrar tipo.')

      setCategoriaForm('')
      await carregarEquipamentos()
      setMensagem('Tipo de equipamento cadastrado com sucesso.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao cadastrar tipo.')
    } finally {
      setSalvandoEquipamento(false)
    }
  }

  async function salvarMarca() {
    setSalvandoEquipamento(true)
    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/equipamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'MARCA', nome: marcaForm.nome, categoriaId: marcaForm.categoriaId }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao cadastrar marca.')

      setMarcaForm(marcaInicial)
      await carregarEquipamentos()
      setMensagem('Marca cadastrada com sucesso.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao cadastrar marca.')
    } finally {
      setSalvandoEquipamento(false)
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <header className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-orange-600">Configuracoes</p>
          <h1 className="text-2xl font-black text-slate-950">Empresa e identidade</h1>
          <p className="text-sm text-slate-500">
            Edite os dados usados no painel, portal do cliente, impressao da OS e comunicacoes.
          </p>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={carregar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
            Atualizar
          </button>
          <button
            type="submit"
            disabled={salvando || tabelaPendente}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
        </div>
      </header>

      {erro && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{mensagem}</div>}
      {tabelaPendente && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          Rode o SQL atualizado para criar a tabela empresas antes de salvar.
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Dados da empresa</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Input label="Nome fantasia" name="nome_fantasia" value={form.nome_fantasia} onChange={handleChange} required />
              <Input label="Razao social" name="razao_social" value={form.razao_social} onChange={handleChange} />
              <Input label="CNPJ" name="cnpj" value={form.cnpj} onChange={handleChange} />
              <Input label="WhatsApp" name="whatsapp" value={form.whatsapp} onChange={handleChange} />
              <Input label="Telefone" name="telefone" value={form.telefone} onChange={handleChange} />
              <Input label="E-mail" name="email" type="email" value={form.email} onChange={handleChange} />
              <Input label="Site" name="site" value={form.site} onChange={handleChange} />
              <Input label="Chave Pix" name="chave_pix" value={form.chave_pix} onChange={handleChange} />
              <label className="flex items-end gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="ativa" checked={form.ativa} onChange={handleChange} />
                Empresa ativa
              </label>
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">Tipos e marcas de equipamento</h2>
                <p className="text-xs text-slate-500">
                  Cadastre tipos como Monitor e vincule as marcas usadas nos chamados.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                {categoriasEquipamento.length} tipos
              </span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
              <div className="rounded-lg border border-slate-200 p-3">
                <label className="block text-sm font-bold text-slate-700">
                  Novo tipo
                  <input
                    value={categoriaForm}
                    onChange={(event) => setCategoriaForm(event.target.value)}
                    placeholder="Ex.: Monitor"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={salvarCategoria}
                  disabled={salvandoEquipamento || !categoriaForm.trim()}
                  className="mt-3 w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cadastrar tipo
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                  <label className="block text-sm font-bold text-slate-700">
                    Tipo
                    <select
                      value={marcaForm.categoriaId}
                      onChange={(event) => setMarcaForm((prev) => ({ ...prev, categoriaId: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500"
                    >
                      <option value="">Selecione</option>
                      {categoriasEquipamento.map((categoria) => (
                        <option key={categoria.id} value={categoria.id}>
                          {categoria.nome ?? `Tipo ${categoria.id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-bold text-slate-700">
                    Nova marca
                    <input
                      value={marcaForm.nome}
                      onChange={(event) => setMarcaForm((prev) => ({ ...prev, nome: event.target.value }))}
                      placeholder="Ex.: LG, Dell, Samsung"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={salvarMarca}
                  disabled={salvandoEquipamento || !marcaForm.nome.trim() || !marcaForm.categoriaId}
                  className="mt-3 w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cadastrar marca
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {categoriasEquipamento.map((categoria) => {
                const marcasDaCategoria = marcasEquipamento.filter((marca) => marca.categoria_id === categoria.id)

                return (
                  <div key={categoria.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-black text-slate-900">{categoria.nome ?? `Tipo ${categoria.id}`}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">
                        {marcasDaCategoria.length} marcas
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {marcasDaCategoria.length > 0
                        ? marcasDaCategoria.map((marca) => marca.nome ?? `Marca ${marca.id}`).join(', ')
                        : 'Sem marcas cadastradas'}
                    </p>
                  </div>
                )
              })}
              {categoriasEquipamento.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-bold text-slate-500">
                  Nenhum tipo cadastrado ainda.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Endereco</h2>
                <p className="text-xs text-slate-500">{enderecoResumo}</p>
              </div>
              {buscandoCep && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">Buscando CEP</span>}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input label="CEP" name="cep" value={form.cep} onChange={handleChange} onBlur={buscarCep} />
              <Input label="Logradouro" name="logradouro" value={form.logradouro} onChange={handleChange} className="xl:col-span-2" />
              <Input label="Numero" name="numero" value={form.numero} onChange={handleChange} />
              <Input label="Bairro" name="bairro" value={form.bairro} onChange={handleChange} />
              <Input label="Cidade" name="cidade" value={form.cidade} onChange={handleChange} />
              <Input label="Estado" name="estado" value={form.estado} onChange={handleChange} />
              <Input label="Complemento" name="complemento" value={form.complemento} onChange={handleChange} />
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Textos da OS</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <Textarea label="Clausula de garantia" name="texto_garantia" value={form.texto_garantia} onChange={handleChange} />
              <Textarea label="Declaracao de entrega" name="texto_entrega" value={form.texto_entrega} onChange={handleChange} />
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Identidade visual</h2>
            <div className="mt-4 space-y-3">
              <Input label="Logo principal URL" name="logo_principal_url" value={form.logo_principal_url} onChange={handleChange} />
              <Input label="Logo reduzida URL" name="logo_reduzida_url" value={form.logo_reduzida_url} onChange={handleChange} />
              <div className="grid grid-cols-2 gap-3">
                <ColorInput label="Cor principal" name="cor_principal" value={form.cor_principal} onChange={handleChange} />
                <ColorInput label="Cor secundaria" name="cor_secundaria" value={form.cor_secundaria} onChange={handleChange} />
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Previa</h2>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white p-2">
                  <Image src={form.logo_reduzida_url || '/logo-ct.png'} alt="Logo reduzida" width={56} height={56} className="h-auto max-h-12 w-auto object-contain" />
                </div>
                <div>
                  <p className="text-lg font-black text-slate-950">{form.nome_fantasia || 'Empresa'}</p>
                  <p className="text-xs text-slate-500">{form.site || 'Site nao informado'}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className="h-4 w-10 rounded-full" style={{ backgroundColor: form.cor_principal }} />
                <span className="h-4 w-10 rounded-full" style={{ backgroundColor: form.cor_secundaria }} />
              </div>
            </div>
          </div>

          {loading && (
            <div className="rounded-xl bg-white p-4 text-sm font-bold text-slate-500 shadow-sm">
              Carregando configuracoes...
            </div>
          )}
        </aside>
      </section>
    </form>
  )
}

function Input({
  label,
  name,
  value,
  onChange,
  onBlur,
  type = 'text',
  required = false,
  className = '',
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onBlur?: () => void
  type?: string
  required?: boolean
  className?: string
}) {
  return (
    <label className={`block text-sm font-bold text-slate-700 ${className}`}>
      {label}{required ? ' *' : ''}
      <input
        name={name}
        value={value ?? ''}
        onChange={onChange}
        onBlur={onBlur}
        type={type}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500"
      />
    </label>
  )
}

function ColorInput({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}
      <input
        name={name}
        value={value ?? '#000000'}
        onChange={onChange}
        type="color"
        className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 outline-none"
      />
    </label>
  )
}

function Textarea({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
}) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}
      <textarea
        name={name}
        value={value ?? ''}
        onChange={onChange}
        rows={5}
        className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500"
      />
    </label>
  )
}

function aplicarMascara(name: string, value: string) {
  if (name === 'cnpj') return mascaraCpfCnpj(value)
  if (name === 'whatsapp' || name === 'telefone') return mascaraTelefone(value)
  if (name === 'cep') return mascaraCep(value)
  if (name === 'estado') return value.toUpperCase().slice(0, 2)
  return value
}

function somenteNumeros(value: string) {
  return value.replace(/\D/g, '')
}

function mascaraCep(value: string) {
  const digits = somenteNumeros(value).slice(0, 8)
  return digits.replace(/(\d{5})(\d{0,3})/, (_, a, b) => (b ? `${a}-${b}` : a))
}

function mascaraTelefone(value: string) {
  const digits = somenteNumeros(value).slice(0, 11)
  if (digits.length <= 10) {
    return digits.replace(/(\d{0,2})(\d{0,4})(\d{0,4})/, (_, ddd, parte1, parte2) => {
      if (!parte1) return ddd
      if (!parte2) return `(${ddd}) ${parte1}`
      return `(${ddd}) ${parte1}-${parte2}`
    })
  }

  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, ddd, parte1, parte2) => `(${ddd}) ${parte1}${parte2 ? `-${parte2}` : ''}`)
}

function mascaraCpfCnpj(value: string) {
  const digits = somenteNumeros(value).slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}
