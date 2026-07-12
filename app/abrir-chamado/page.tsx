'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ChangeEvent, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { prepararCategoriasPublicas, prepararMarcasPublicas } from '@/lib/public-equipment'

type Categoria = { id: number; nome: string; key?: string }
type Marca = { id: number; nome: string; categoria_id: number | null }

type FormState = {
  nomeCliente: string
  cpfCnpj: string
  whatsapp: string
  email: string
  cep: string
  rua: string
  numero: string
  bairro: string
  cidade: string
  estado: string
  categoriaId: string
  marcaId: string
  modelo: string
  numeroSerie: string
  garantia: 'SIM' | 'NAO'
  dataCompra: string
  numeroNf: string
  localCompra: string
  defeito: string
  observacao: string
}

const aberturaChamadosAtiva = process.env.NEXT_PUBLIC_ABERTURA_CHAMADOS_ATIVA === 'true'
const estadoAtendido = 'MS'
const whatsappAtendimento = '5567992058808'

const formInicial: FormState = {
  nomeCliente: '',
  cpfCnpj: '',
  whatsapp: '',
  email: '',
  cep: '',
  rua: '',
  numero: '',
  bairro: '',
  cidade: '',
  estado: '',
  categoriaId: '',
  marcaId: '',
  modelo: '',
  numeroSerie: '',
  garantia: 'NAO',
  dataCompra: '',
  numeroNf: '',
  localCompra: '',
  defeito: '',
  observacao: '',
}

const categoriasPadrao: Categoria[] = [
  { id: 19, nome: 'Ar Condicionado' },
  { id: 16, nome: 'Eletronicos em Geral' },
  { id: 22, nome: 'Inversores Solares' },
  { id: 17, nome: 'Lavadoras' },
  { id: 20, nome: 'Maquinas de Lavar' },
  { id: 14, nome: 'Nobreaks' },
  { id: 18, nome: 'Refrigeradores' },
  { id: 15, nome: 'Som e Audio' },
  { id: 21, nome: 'Televisores' },
]

const marcasPadrao: Marca[] = [
  { id: 68, nome: 'AOC', categoria_id: 21 },
  { id: 84, nome: 'Carrier', categoria_id: 19 },
  { id: 72, nome: 'Brastemp', categoria_id: 17 },
  { id: 74, nome: 'Brastemp', categoria_id: 20 },
  { id: 65, nome: 'Brastemp', categoria_id: 18 },
  { id: 50, nome: 'Consul', categoria_id: 18 },
  { id: 51, nome: 'Consul', categoria_id: 17 },
  { id: 83, nome: 'APC', categoria_id: 14 },
  { id: 62, nome: 'CCE', categoria_id: 16 },
]

export default function AbrirChamadoPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(formInicial)
  const [categorias, setCategorias] = useState<Categoria[]>(prepararCategoriasPublicas(categoriasPadrao))
  const [marcas, setMarcas] = useState<Marca[]>(prepararMarcasPublicas(marcasPadrao, categoriasPadrao))
  const [anexos, setAnexos] = useState<File[]>([])
  const [salvando, setSalvando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erro, setErro] = useState('')
  const [whatsRegiaoUrl, setWhatsRegiaoUrl] = useState('')
  const [sucesso, setSucesso] = useState<{ id: number; numeroOS: string } | null>(null)

  const carregarDados = useCallback(async () => {
    setErro('')

    try {
      const response = await fetch('/api/chamados')
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel carregar os dados.')

      const categoriasApi = ((data?.categorias?.length ? data.categorias : categoriasPadrao) ?? categoriasPadrao) as Categoria[]
      const marcasApi = ((data?.marcas?.length ? data.marcas : marcasPadrao) ?? marcasPadrao) as Marca[]
      setCategorias(prepararCategoriasPublicas(categoriasApi))
      setMarcas(prepararMarcasPublicas(marcasApi, categoriasApi))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar dados.')
    }
  }, [])

  const buscarCep = useCallback(async (cep: string) => {
    setBuscandoCep(true)
    try {
      const data = await buscarEnderecoPorCep(cep)
      if (!data) return

      setForm((prev) => ({
        ...prev,
        rua: data.rua || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.cidade || prev.cidade,
        estado: data.estado || prev.estado,
      }))
    } catch {
      // CEP automatico e opcional; se falhar, cliente preenche manualmente.
    } finally {
      setBuscandoCep(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(carregarDados)
  }, [carregarDados])

  useEffect(() => {
    const cep = form.cep.replace(/\D/g, '')
    if (cep.length !== 8) return

    const timer = setTimeout(() => {
      void buscarCep(cep)
    }, 450)

    return () => clearTimeout(timer)
  }, [buscarCep, form.cep])

  const marcasFiltradas = useMemo(() => {
    if (!form.categoriaId) return []
    return marcas.filter((marca) => String(marca.categoria_id) === form.categoriaId)
  }, [form.categoriaId, marcas])

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target

    if (name === 'cpfCnpj') {
      setForm((prev) => ({ ...prev, cpfCnpj: formatarCpfCnpj(value) }))
      return
    }

    if (name === 'whatsapp') {
      setForm((prev) => ({ ...prev, whatsapp: formatarTelefone(value) }))
      return
    }

    if (name === 'cep') {
      setForm((prev) => ({ ...prev, cep: formatarCep(value) }))
      return
    }

    if (name === 'categoriaId') {
      setForm((prev) => ({ ...prev, categoriaId: value, marcaId: '' }))
      return
    }

    if (name === 'garantia' && value === 'NAO') {
      setForm((prev) => ({
        ...prev,
        garantia: 'NAO',
        dataCompra: '',
        numeroNf: '',
        localCompra: '',
      }))
      return
    }

    setForm((prev) => ({ ...prev, [name]: name === 'estado' ? value.toUpperCase().slice(0, 2) : value }))
  }

  function handleAnexos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    setAnexos(files.slice(0, 6))
  }

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setWhatsRegiaoUrl('')
    setSucesso(null)

    if (!aberturaChamadosAtiva) {
      setErro('A abertura online de chamados estara disponivel em breve. No momento, estamos credenciando tecnicos parceiros.')
      return
    }

    setSalvando(true)

    try {
      const formData = new FormData(event.currentTarget)
      const validacaoArea = validarAreaAtendimento(String(formData.get('cidade') ?? ''), String(formData.get('estado') ?? ''))
      if (!validacaoArea.ok) {
        setErro(validacaoArea.mensagem)
        setWhatsRegiaoUrl(validacaoArea.whatsappUrl)
        return
      }

      if (!formData.get('garantia')) formData.set('garantia', 'NAO')
      const temAnexos = anexos.some((arquivo) => arquivo.size > 0)
      const payload = Object.fromEntries(formData.entries())

      const response = await fetch('/api/chamados', {
        method: 'POST',
        ...(temAnexos
          ? { body: formData }
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        if (data?.whatsappUrl) setWhatsRegiaoUrl(String(data.whatsappUrl))
        throw new Error(data?.error ?? 'Nao foi possivel abrir o chamado.')
      }

      setSucesso({ id: Number(data.id), numeroOS: String(data.numeroOS) })
      router.push(`/consulta?os=${encodeURIComponent(String(data.numeroOS))}&whatsapp=${encodeURIComponent(String(formData.get('whatsapp') ?? ''))}`)
      setForm(formInicial)
      setAnexos([])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao abrir chamado.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#c7d3cf] px-3 py-3 sm:px-4 sm:py-5">
      <div className="mx-auto max-w-6xl space-y-3 sm:space-y-4">
        <header className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <Image src="/logo-ct.png" alt="Chame o Tecnico" width={150} height={65} className="h-auto w-[96px] sm:w-[120px]" />
              <div>
                <p className="text-xs font-bold uppercase text-orange-600">Portal do cliente</p>
                <h1 className="text-xl font-black text-slate-950 sm:text-2xl">Abertura de chamado</h1>
                <p className="text-xs text-slate-600 sm:text-sm">Preencha os dados para nossa equipe iniciar a triagem.</p>
              </div>
            </div>
            <Link href="/consulta" className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-bold text-slate-700">
              Consultar OS
            </Link>
          </div>
        </header>

        {erro && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            <p>{erro}</p>
            {whatsRegiaoUrl && (
              <a href={whatsRegiaoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-green-600 px-4 py-2 text-white transition hover:bg-green-700">
                Falar no WhatsApp
              </a>
            )}
          </div>
        )}
        {!aberturaChamadosAtiva && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">
            A abertura de chamados pelo cliente sera liberada em breve. Enquanto isso, estamos cadastrando tecnicos parceiros para ampliar a rede de atendimento.
          </div>
        )}
        {sucesso && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-black">Chamado aberto com sucesso: {sucesso.numeroOS}</p>
            <p className="mt-1">Nossa equipe recebeu sua solicitação. Guarde este número para consulta.</p>
          </div>
        )}
        <div data-public-form-status className="hidden rounded-xl px-4 py-3 text-sm font-bold" />

        <form onSubmit={enviar} action="/api/chamados" method="post" encType="multipart/form-data" data-public-os-form className="grid gap-3 sm:gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm sm:space-y-4 sm:p-5">
            <AvisoExpansao />

            <Bloco titulo="Dados do cliente">
              <Field label="Nome completo" name="nomeCliente" value={form.nomeCliente} onChange={handleChange} required />
              <Field label="CPF/CNPJ" name="cpfCnpj" value={form.cpfCnpj} onChange={handleChange} required inputMode="numeric" maxLength={18} />
              <Field label="WhatsApp" name="whatsapp" value={form.whatsapp} onChange={handleChange} required inputMode="numeric" maxLength={15} />
              <Field label="E-mail" name="email" value={form.email} onChange={handleChange} type="email" />
            </Bloco>

            <Bloco titulo="Endereco do atendimento">
              <div>
                <Field label="CEP" name="cep" value={form.cep} onChange={handleChange} inputMode="numeric" maxLength={9} />
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {buscandoCep ? 'Buscando endereco...' : 'Digite o CEP para preencher rua, bairro, cidade e UF.'}
                </p>
              </div>
              <Field label="Rua" name="rua" value={form.rua} onChange={handleChange} />
              <Field label="Numero" name="numero" value={form.numero} onChange={handleChange} />
              <Field label="Bairro" name="bairro" value={form.bairro} onChange={handleChange} />
              <Field label="Cidade" name="cidade" value={form.cidade} onChange={handleChange} />
              <Field label="UF" name="estado" value={form.estado} onChange={handleChange} maxLength={2} required />
            </Bloco>

            <Bloco titulo="Equipamento">
              <Select label="Tipo de equipamento" name="categoriaId" value={form.categoriaId} onChange={handleChange} required>
                <option value="">Selecione</option>
                {categorias.map((categoria) => (
                  <option key={categoria.key ?? categoria.id} value={categoria.id}>{categoria.nome}</option>
                ))}
              </Select>
              <Select label="Marca" name="marcaId" value={form.marcaId} onChange={handleChange} required>
                <option value="">Selecione</option>
                {(form.categoriaId ? marcasFiltradas : marcas).map((marca) => (
                  <option key={marca.id} value={marca.id} data-categoria-id={marca.categoria_id ?? ''}>
                    {marca.nome}
                  </option>
                ))}
              </Select>
              <Field label="Modelo" name="modelo" value={form.modelo} onChange={handleChange} required />
              <Field label="Numero de serie" name="numeroSerie" value={form.numeroSerie} onChange={handleChange} />
            </Bloco>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Defeito informado</label>
              <textarea
                name="defeito"
                value={form.defeito}
                onChange={handleChange}
                required
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-orange-500 sm:text-sm"
                placeholder="Descreva o problema apresentado..."
              />
            </div>
          </section>

          <aside className="space-y-3 sm:space-y-4">
            <section className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-black text-slate-950 sm:text-lg">Garantia</h2>
              <div className="garantia-toggle mt-3 grid grid-cols-2 gap-2">
                {(['NAO', 'SIM'] as const).map((valor) => (
                  <label
                    key={valor}
                    className="garantia-option flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-black text-slate-600"
                  >
                    <input
                      type="radio"
                      name="garantia"
                      value={valor}
                      defaultChecked={valor === 'NAO'}
                      onChange={() => {
                      setForm((prev) => ({
                        ...prev,
                        garantia: valor,
                        dataCompra: valor === 'SIM' ? prev.dataCompra : '',
                        numeroNf: valor === 'SIM' ? prev.numeroNf : '',
                        localCompra: valor === 'SIM' ? prev.localCompra : '',
                      }))
                    }}
                      className="h-4 w-4 accent-orange-500"
                    />
                    <span>{valor === 'SIM' ? 'Sim' : 'Nao'}</span>
                  </label>
                ))}
              </div>

              <div className="garantia-campos is-hidden mt-4 space-y-3" data-garantia-campos>
                  <Field label="Data da compra" name="dataCompra" value={form.dataCompra} onChange={handleChange} type="date" />
                  <Field label="Numero da NF" name="numeroNf" value={form.numeroNf} onChange={handleChange} />
                  <Field label="Local da compra" name="localCompra" value={form.localCompra} onChange={handleChange} />
              </div>
            </section>

            <section className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-black text-slate-950 sm:text-lg">Anexos</h2>
              <p className="mt-1 text-xs text-slate-500">Envie fotos do produto, defeito ou nota fiscal. Maximo 6 arquivos.</p>
              <input
                name="anexos"
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleAnexos}
                className="mt-3 block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[13px] text-slate-600 sm:py-3 sm:text-sm"
              />
              {anexos.length > 0 && (
                <div className="mt-3 space-y-1">
                  {anexos.map((arquivo) => (
                    <p key={`${arquivo.name}-${arquivo.size}`} className="truncate rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                      {arquivo.name}
                    </p>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <label className="mb-1 block text-sm font-bold text-slate-700">Observacao adicional</label>
              <textarea
                name="observacao"
                value={form.observacao}
                onChange={handleChange}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-orange-500 sm:text-sm"
                placeholder="Ex.: melhor horario, ponto de referencia..."
              />

              <label className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold leading-snug text-slate-600 sm:mt-4">
                <input type="checkbox" name="lgpdConsentimento" value="SIM" required className="mt-0.5 h-4 w-4 accent-orange-500" />
                <span>Autorizo o uso dos meus dados para abertura, atendimento e acompanhamento deste chamado, conforme a LGPD.</span>
              </label>

              <button
                type="submit"
                disabled={salvando || !aberturaChamadosAtiva}
                className="mt-3 w-full rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-4 sm:py-3 sm:text-base"
              >
                {!aberturaChamadosAtiva ? 'Abertura em breve' : salvando ? 'Enviando...' : 'Abrir chamado'}
              </button>
            </section>
          </aside>
        </form>
      </div>
    </main>
  )
}

function AvisoExpansao() {
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs leading-relaxed text-orange-900 sm:px-4 sm:py-3 sm:text-sm">
      <p className="font-black">Atendimento em expansao</p>
      <p className="mt-1 font-semibold">
        O Chame o Tecnico esta ampliando gradativamente sua rede de atendimento em Mato Grosso do Sul.
      </p>
      <p className="mt-1 text-orange-800">
        Apos o envio, nossa equipe fara uma triagem para verificar a disponibilidade na sua regiao e direcionar o servico ao tecnico parceiro mais qualificado.
      </p>
      <a href={criarWhatsAppRegiaoUrl('', '')} target="_blank" rel="noreferrer" className="mt-2 inline-flex font-black text-orange-800 underline decoration-orange-400 underline-offset-4">
        Falar no WhatsApp
      </a>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-black text-slate-950 sm:mb-3 sm:text-lg">{titulo}</h2>
      <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = false,
  maxLength,
  inputMode,
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  type?: string
  required?: boolean
  maxLength?: number
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
}) {
  return (
    <label className="block text-[13px] font-bold text-slate-700 sm:text-sm">
      {label}{required ? ' *' : ''}
      <input
        name={name}
        value={value}
        onChange={onChange}
        type={type}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-orange-500 sm:text-sm"
      />
    </label>
  )
}

function Select({
  label,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  children,
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  required?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <label className="block text-[13px] font-bold text-slate-700 sm:text-sm">
      {label}{required ? ' *' : ''}
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100 sm:text-sm"
      >
        {children}
      </select>
    </label>
  )
}

function apenasNumeros(value: string) {
  return value.replace(/\D/g, '')
}

function formatarCpfCnpj(value: string) {
  const numeros = apenasNumeros(value).slice(0, 14)

  if (numeros.length <= 11) {
    return numeros
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
  }

  return numeros
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
}

function formatarTelefone(value: string) {
  const numeros = apenasNumeros(value).slice(0, 11)

  if (numeros.length <= 10) {
    return numeros
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/^(\(\d{2}\) \d{4})(\d)/, '$1-$2')
  }

  return numeros
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/^(\(\d{2}\) \d{5})(\d)/, '$1-$2')
}

function formatarCep(value: string) {
  return apenasNumeros(value)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, '$1-$2')
}

function validarAreaAtendimento(cidade: string, estado: string) {
  const uf = estado.trim().toUpperCase()
  const whatsappUrl = criarWhatsAppRegiaoUrl(cidade, uf)

  if (!uf) {
    return {
      ok: false,
      mensagem: 'Informe a UF do atendimento. No momento a abertura online esta liberada somente para Mato Grosso do Sul (MS).',
      whatsappUrl,
    }
  }

  if (uf !== estadoAtendido) {
    return {
      ok: false,
      mensagem: 'No momento a abertura online esta liberada somente para Mato Grosso do Sul (MS). Para outras regioes, fale conosco pelo WhatsApp.',
      whatsappUrl,
    }
  }

  return { ok: true, mensagem: '', whatsappUrl: '' }
}

function criarWhatsAppRegiaoUrl(cidade: string, estado: string) {
  const uf = estado.trim().toUpperCase()
  const local = [cidade.trim(), uf].filter(Boolean).join('/')
  const texto = `Ola! Estou em ${local || 'minha regiao'} e gostaria de saber quando o atendimento da Chame o Tecnico estara disponivel na minha regiao.`
  return `https://wa.me/${whatsappAtendimento}?text=${encodeURIComponent(texto)}`
}

async function buscarEnderecoPorCep(cep: string) {
  const brasilApi = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`)
    .then(async (response) => {
      if (!response.ok) return null
      const data = await response.json()
      return {
        rua: String(data.street ?? ''),
        bairro: String(data.neighborhood ?? ''),
        cidade: String(data.city ?? ''),
        estado: String(data.state ?? ''),
      }
    })
    .catch(() => null)

  if (brasilApi?.cidade || brasilApi?.rua) return brasilApi

  return fetch(`https://viacep.com.br/ws/${cep}/json/`)
    .then(async (response) => {
      if (!response.ok) return null
      const data = await response.json()
      if (data?.erro) return null
      return {
        rua: String(data.logradouro ?? ''),
        bairro: String(data.bairro ?? ''),
        cidade: String(data.localidade ?? ''),
        estado: String(data.uf ?? ''),
      }
    })
    .catch(() => null)
}
