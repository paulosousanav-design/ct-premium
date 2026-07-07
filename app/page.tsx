'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ChangeEvent, type FocusEvent, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { prepararCategoriasPublicas, prepararMarcasPublicas } from '@/lib/public-equipment'

type Categoria = { id: number; nome: string; key?: string }
type Marca = { id: number; nome: string; categoria_id: number | null }

type FormState = {
  nomeCliente: string
  whatsapp: string
  email: string
  cpfCnpj: string
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
  defeito: string
}

const aberturaChamadosAtiva = process.env.NEXT_PUBLIC_ABERTURA_CHAMADOS_ATIVA === 'true'

const formInicial: FormState = {
  nomeCliente: '',
  whatsapp: '',
  email: '',
  cpfCnpj: '',
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
  defeito: '',
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

const categoriasVisuais = [
  { nome: 'Smart TV', imagem: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=400&q=80' },
  { nome: 'Ar Condicionado', imagem: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=400&q=80' },
  { nome: 'Refrigerador', imagem: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=400&q=80' },
  { nome: 'Lavadora', imagem: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=400&q=80' },
  { nome: 'Inversor Solar', imagem: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=400&q=80' },
  { nome: 'Informatica', imagem: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=400&q=80' },
  { nome: 'Outros Servicos', imagem: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80' },
]

const passos = [
  { numero: '1', titulo: 'Abra o chamado', texto: 'Informe seus dados e o problema.' },
  { numero: '2', titulo: 'Envie fotos', texto: 'Fotos ajudam a equipe a entender melhor.' },
  { numero: '3', titulo: 'Receba atendimento', texto: 'A equipe direciona o chamado.' },
  { numero: '4', titulo: 'Acompanhe online', texto: 'Veja andamento, orçamento e finalização.' },
]

export default function Home() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(formInicial)
  const [categorias, setCategorias] = useState<Categoria[]>(prepararCategoriasPublicas(categoriasPadrao))
  const [marcas, setMarcas] = useState<Marca[]>(prepararMarcasPublicas(marcasPadrao, categoriasPadrao))
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [anexos, setAnexos] = useState<File[]>([])
  const [salvando, setSalvando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [cookiesAceitos, setCookiesAceitos] = useState<boolean | null>(null)

  const carregarDados = useCallback(async () => {
    try {
      const response = await fetch('/api/chamados')
      const data = await response.json().catch(() => null)
      if (!response.ok) return

      const categoriasApi = ((data?.categorias?.length ? data.categorias : categoriasPadrao) ?? categoriasPadrao) as Categoria[]
      const marcasApi = ((data?.marcas?.length ? data.marcas : marcasPadrao) ?? marcasPadrao) as Marca[]
      setCategorias(prepararCategoriasPublicas(categoriasApi))
      setMarcas(prepararMarcasPublicas(marcasApi, categoriasApi))
    } catch {
      // Mantem a home navegavel mesmo se os combos falharem.
    }
  }, [])

  useEffect(() => {
    // Carregamento inicial das categorias e marcas do formulario da home.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregarDados()
  }, [carregarDados])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCookiesAceitos(window.localStorage.getItem('ct_cookies_aceitos') === 'SIM')
  }, [])

  useEffect(() => {
    const cepLimpo = form.cep.replace(/\D/g, '')
    if (cepLimpo.length !== 8) return

    const timer = setTimeout(() => {
      void buscarCep(cepLimpo)
    }, 450)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cep])

  const marcasFiltradas = useMemo(() => {
    if (!form.categoriaId) return []
    return marcas.filter((marca) => String(marca.categoria_id) === form.categoriaId)
  }, [form.categoriaId, marcas])

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target

    if (name === 'whatsapp') {
      setForm((prev) => ({ ...prev, whatsapp: formatarTelefone(value) }))
      return
    }

    if (name === 'cpfCnpj') {
      setForm((prev) => ({ ...prev, cpfCnpj: formatarCpfCnpj(value) }))
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

    setForm((prev) => ({ ...prev, [name]: name === 'estado' ? value.toUpperCase().slice(0, 2) : value }))
  }

  function handleMaskedInput(event: FormEvent<HTMLInputElement>) {
    const { name, value } = event.currentTarget
    const formatted = formatarCampoMascarado(name, value)
    if (formatted === null) return

    event.currentTarget.value = formatted
    setForm((prev) => ({ ...prev, [name]: formatted }))
  }

  function handleMaskedBlur(event: FocusEvent<HTMLInputElement>) {
    const { name, value } = event.currentTarget
    const formatted = formatarCampoMascarado(name, value)
    if (formatted === null) return

    event.currentTarget.value = formatted
    setForm((prev) => ({ ...prev, [name]: formatted }))
  }

  function handleAnexos(event: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(event.target.files ?? [])
    setAnexos(arquivos.slice(0, 6))
  }

  async function buscarCep(cepInformado = form.cep) {
    const cepLimpo = cepInformado.replace(/\D/g, '')
    if (cepLimpo.length !== 8) return

    setBuscandoCep(true)
    try {
      const data = await buscarEnderecoPorCep(cepLimpo)
      if (!data) return

      setForm((prev) => ({
        ...prev,
        rua: data.rua || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.cidade || prev.cidade,
        estado: data.estado || prev.estado,
      }))
    } finally {
      setBuscandoCep(false)
    }
  }

  async function enviarChamado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setSucesso('')

    if (!aberturaChamadosAtiva) {
      setErro('A abertura online de chamados estara disponivel em breve. No momento, estamos credenciando tecnicos parceiros.')
      return
    }

    setSalvando(true)

    try {
      const formData = new FormData(event.currentTarget)
      formData.set('garantia', 'NAO')
      formData.set('dataCompra', '')
      formData.set('numeroNf', '')
      formData.set('localCompra', '')
      formData.set('observacao', '')
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
      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel abrir o chamado.')

      setSucesso(`Chamado aberto com sucesso: ${data.numeroOS}`)
      router.push(`/consulta?os=${encodeURIComponent(String(data.numeroOS))}&whatsapp=${encodeURIComponent(String(payload.whatsapp ?? ''))}`)
      setForm(formInicial)
      setAnexos([])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao abrir chamado.')
    } finally {
      setSalvando(false)
    }
  }

  function aceitarCookies() {
    window.localStorage.setItem('ct_cookies_aceitos', 'SIM')
    setCookiesAceitos(true)
  }

  return (
    <main className="home-page">
      <header className="home-shell home-header">
        <Link href="/" aria-label="Chame o Tecnico">
          <Image src="/logo-chame-o-tecnico.png" alt="Chame o Tecnico" width={360} height={95} className="home-logo h-auto w-[260px]" priority />
        </Link>

        <nav className="home-nav">
          <Link href="/">Inicio</Link>
          <Link href="/abrir-chamado" className="active">Abrir Chamado</Link>
          <Link href="/consulta">Acompanhar OS</Link>
          <Link href="/cadastro-tecnico">Seja Parceiro</Link>
          <Link href="/abrir-chamado" className="top-cta">Abrir chamado</Link>
        </nav>
      </header>

      <section className="home-shell hero-grid">
        <div className="hero-card">
          <div className="hero-orbit" />
          <div className="hero-image" />

          <div className="hero-copy">
            <h1 className="hero-title">
              Seu equipamento merece <span>cuidado</span> especializado!
            </h1>
            <p>Abra seu chamado online de forma rápida e encontre atendimento qualificado perto de você.</p>

            <div className="check-list">
              <Check text="Atendimento rápido e seguro" />
              <Check text="Acompanhamento online" />
              <Check text="Técnicos parceiros verificados" />
              <Check text="Orçamento transparente" />
            </div>

            <div className="hero-actions">
              <Link href="/abrir-chamado" className="primary-action">Abrir chamado agora</Link>
              <Link href="/consulta" className="secondary-action">Acompanhar OS</Link>
            </div>
          </div>

          <div className="stats-row">
            <Stat value="Abrir chamado" label="Solicite atendimento agora" />
            <Stat value="Seja parceiro" label="Cadastre-se como técnico" />
            <Stat value="Assistência Premium" label="Atendimento especializado" />
            <Stat value="30 anos" label="de experiência" />
          </div>
        </div>

        <form onSubmit={enviarChamado} action="/api/chamados" method="post" encType="multipart/form-data" data-public-os-form className="call-form">
          <div className="form-title">
            <span className="form-title-icon">▤</span>
            <div>
              <h2>Abra seu chamado</h2>
              <p>É rápido, fácil e seguro</p>
            </div>
          </div>

          {erro && <div className="alert alert-error">{erro}</div>}
          {sucesso && <div className="alert alert-success">{sucesso}</div>}
          {!aberturaChamadosAtiva && (
            <div className="alert alert-warning">
              A abertura de chamados pelo cliente sera liberada em breve. Estamos formando nossa rede de tecnicos parceiros.
            </div>
          )}
          <div data-public-form-status className="hidden" />

          <div className="form-grid">
            <Input placeholder="Nome completo" name="nomeCliente" value={form.nomeCliente} onChange={handleChange} required />
            <Input placeholder="WhatsApp" name="whatsapp" value={form.whatsapp} onChange={handleChange} onInput={handleMaskedInput} onBlur={handleMaskedBlur} required maxLength={15} inputMode="numeric" autoComplete="off" />
            <Input placeholder="E-mail" name="email" value={form.email} onChange={handleChange} type="email" />
            <Input placeholder="CPF/CNPJ" name="cpfCnpj" value={form.cpfCnpj} onChange={handleChange} onInput={handleMaskedInput} onBlur={handleMaskedBlur} required maxLength={18} inputMode="numeric" autoComplete="off" />
          </div>

          <p className="form-label">Endereço</p>
          <div className="cep-row">
            <Input placeholder="CEP" name="cep" value={form.cep} onChange={handleChange} onInput={handleMaskedInput} onBlur={handleMaskedBlur} required maxLength={9} inputMode="numeric" autoComplete="off" />
            <button type="button" onClick={() => buscarCep()} className="cep-button">{buscandoCep ? 'Buscando' : 'Buscar CEP'}</button>
          </div>
          <div className="street-row" style={{ marginTop: 10 }}>
            <Input placeholder="Rua" name="rua" value={form.rua} onChange={handleChange} />
            <Input placeholder="Número" name="numero" value={form.numero} onChange={handleChange} />
          </div>
          <div className="city-row" style={{ marginTop: 10 }}>
            <Input placeholder="Bairro" name="bairro" value={form.bairro} onChange={handleChange} />
            <Input placeholder="Cidade" name="cidade" value={form.cidade} onChange={handleChange} />
            <Input placeholder="UF" name="estado" value={form.estado} onChange={handleChange} maxLength={2} />
          </div>

          <p className="form-label">Equipamento</p>
          <div className="form-grid">
            <Select name="categoriaId" value={form.categoriaId} onChange={handleChange} required>
              <option value="">Categoria</option>
              {categorias.map((categoria) => (
                <option key={categoria.key ?? categoria.id} value={categoria.id}>{categoria.nome}</option>
              ))}
            </Select>
            <Select name="marcaId" value={form.marcaId} onChange={handleChange} required>
              <option value="">Marca</option>
              {(form.categoriaId ? marcasFiltradas : marcas).map((marca) => (
                <option key={marca.id} value={marca.id} data-categoria-id={marca.categoria_id ?? ''}>
                  {marca.nome}
                </option>
              ))}
            </Select>
            <Input placeholder="Modelo" name="modelo" value={form.modelo} onChange={handleChange} required />
            <Input placeholder="Nº de série (opcional)" name="numeroSerie" value={form.numeroSerie} onChange={handleChange} />
          </div>

          <p className="form-label">Defeito</p>
          <textarea
            name="defeito"
            value={form.defeito}
            onChange={handleChange}
            placeholder="Descreva o problema"
            required
            className="textarea"
          />

          <p className="form-label">Fotos ou arquivo</p>
          <div className="file-box">
            <input
              name="anexos"
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={handleAnexos}
              className="file-input"
            />
            <p>Fotos do produto, defeito ou NF em PDF. Maximo 6 arquivos.</p>
            {anexos.length > 0 && (
              <div className="file-list">
                {anexos.map((arquivo) => (
                  <span key={`${arquivo.name}-${arquivo.size}`}>{arquivo.name}</span>
                ))}
              </div>
            )}
          </div>

          <label className="lgpd-check">
            <input type="checkbox" name="lgpdConsentimento" value="SIM" required />
            <span>Autorizo o uso dos meus dados para abertura, atendimento e acompanhamento deste chamado, conforme a LGPD.</span>
          </label>

          <button type="submit" disabled={salvando || !aberturaChamadosAtiva} className="submit-button">
            {!aberturaChamadosAtiva ? 'Abertura em breve' : salvando ? 'Enviando...' : 'Enviar chamado'}
          </button>
        </form>
      </section>

      {cookiesAceitos === false && (
        <div className="cookie-banner">
          <p>Usamos cookies essenciais para melhorar sua navegacao e manter o funcionamento do portal.</p>
          <button type="button" onClick={aceitarCookies}>Aceitar</button>
        </div>
      )}

      {cookiesAceitos === true && (
        <button type="button" onClick={() => setCookiesAceitos(false)} className="cookie-reopen">
          Cookies
        </button>
      )}

      <section className="home-shell">
        <h2 className="section-title">Categorias atendidas</h2>
        <div className="categories">
          {categoriasVisuais.map((item) => (
            <div key={item.nome} className="category-card">
              <div className="category-img" style={{ backgroundImage: `url(${item.imagem})` }} />
              <p>{item.nome}</p>
            </div>
          ))}
        </div>

        <div className="steps-wrap">
          <div className="steps-title">
            <h2>Como funciona?</h2>
          </div>
          <div className="steps">
            {passos.map((passo) => (
              <div key={passo.numero} className="step-card">
                <span className="step-num">{passo.numero}</span>
                <h3>{passo.titulo}</h3>
                <p>{passo.texto}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="partner">
          <div className="partner-card">
            <div>
              <h2>Você é técnico?<br /><span>Seja um parceiro!</span></h2>
              <p>Receba chamados na sua região e acompanhe seus atendimentos.</p>
            </div>
            <Link href="/cadastro-tecnico">Quero ser parceiro</Link>
          </div>

        </div>
      </section>
    </main>
  )
}

function Check({ text }: { text: string }) {
  return (
    <div className="check-item">
      <i>✓</i>
      <span>{text}</span>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-card">
      <div>
        <div className="stat-number">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

function Input(props: {
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onInput?: (event: FormEvent<HTMLInputElement>) => void
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  placeholder: string
  type?: string
  required?: boolean
  maxLength?: number
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
  autoComplete?: string
}) {
  return <input {...props} className="input" />
}

function Select(props: {
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  children: ReactNode
  required?: boolean
  disabled?: boolean
}) {
  return <select {...props} className="select" />
}

function apenasNumeros(value: string) {
  return value.replace(/\D/g, '')
}

function formatarCampoMascarado(name: string, value: string) {
  if (name === 'whatsapp') return formatarTelefone(value)
  if (name === 'cpfCnpj') return formatarCpfCnpj(value)
  if (name === 'cep') return formatarCep(value)
  return null
}

function formatarCep(value: string) {
  return apenasNumeros(value)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, '$1-$2')
}

function formatarTelefone(value: string) {
  const numeros = apenasNumeros(value).slice(0, 11)

  if (numeros.length <= 10) {
    return numeros
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }

  return numeros
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

function formatarCpfCnpj(value: string) {
  const numeros = apenasNumeros(value).slice(0, 14)

  if (numeros.length <= 11) {
    return numeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  return numeros
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
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
