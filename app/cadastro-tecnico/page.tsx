'use client'

import Image from 'next/image'
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from 'react'

type FormState = {
  nome: string
  empresa: string
  cpfCnpj: string
  chavePix: string
  whatsapp: string
  email: string
  cep: string
  logradouro: string
  numero: string
  referencia: string
  bairro: string
  cidade: string
  estado: string
  especialidades: string[]
  experiencia: string
  aceiteLgpd: boolean
  aceitePrestador: boolean
}

const especialidadesDisponiveis = [
  'Ar-condicionado',
  'Refrigerador',
  'Lava e seca',
  'Televisor',
  'Cooktop',
  'Forno',
  'Micro-ondas',
  'Adega',
  'Outros',
]

const formInicial: FormState = {
  nome: '',
  empresa: '',
  cpfCnpj: '',
  chavePix: '',
  whatsapp: '',
  email: '',
  cep: '',
  logradouro: '',
  numero: '',
  referencia: '',
  bairro: '',
  cidade: '',
  estado: '',
  especialidades: [],
  experiencia: '',
  aceiteLgpd: false,
  aceitePrestador: false,
}

export default function CadastroTecnicoPage() {
  const [form, setForm] = useState<FormState>(formInicial)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)

  useEffect(() => {
    const sucesso = new URLSearchParams(window.location.search).get('sucesso')
    if (sucesso !== '1') return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMensagem('Cadastro recebido. Nossa equipe vai analisar e entrar em contato pelo WhatsApp.')
  }, [])

  const buscarCep = useCallback(async (cep: string) => {
    setBuscandoCep(true)
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
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
  }, [])

  useEffect(() => {
    const cepLimpo = form.cep.replace(/\D/g, '')
    if (cepLimpo.length !== 8) return

    const timer = window.setTimeout(() => {
      void buscarCep(cepLimpo)
    }, 350)

    return () => window.clearTimeout(timer)
  }, [buscarCep, form.cep])

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const target = event.currentTarget
    const { name, value } = target

    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      setForm((prev) => ({ ...prev, [name]: target.checked }))
      return
    }

    if (name === 'cpfCnpj') {
      setForm((prev) => ({ ...prev, cpfCnpj: formatarCpfCnpj(value) }))
      return
    }

    if (name === 'whatsapp') {
      setForm((prev) => ({ ...prev, whatsapp: formatarTelefone(value) }))
      return
    }

    if (name === 'cep') {
      setForm((prev) => ({ ...prev, cep: formatarCEP(value) }))
      return
    }

    if (name === 'estado') {
      setForm((prev) => ({ ...prev, estado: value.toUpperCase().slice(0, 2) }))
      return
    }

    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function alternarEspecialidade(especialidade: string) {
    setForm((prev) => {
      const jaSelecionada = prev.especialidades.includes(especialidade)

      return {
        ...prev,
        especialidades: jaSelecionada
          ? prev.especialidades.filter((item) => item !== especialidade)
          : [...prev.especialidades, especialidade],
      }
    })
  }

  async function enviarCadastro(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setMensagem('')

    if (!form.nome.trim() || !form.whatsapp.trim()) {
      setErro('Informe seu nome e WhatsApp para enviar o cadastro.')
      return
    }

    if (form.especialidades.length === 0) {
      setErro('Selecione pelo menos um tipo de aparelho atendido.')
      return
    }

    if (!form.aceiteLgpd) {
      setErro('Confirme a autorizacao de uso dos dados para enviar o cadastro.')
      return
    }

    if (!form.aceitePrestador) {
      setErro('Confirme o aceite de prestador de servico terceirizado para enviar o cadastro.')
      return
    }

    setEnviando(true)
    try {
      const response = await fetch('/api/tecnicos/autocadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel enviar seu cadastro.')

      const avisos = Array.isArray(data?.avisos) ? data.avisos.join(' ') : ''
      setMensagem(
        [
          'Cadastro recebido. Nossa equipe vai analisar e entrar em contato pelo WhatsApp.',
          avisos,
        ]
          .filter(Boolean)
          .join(' ')
      )
      setForm(formInicial)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao enviar cadastro.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-800 px-4 py-5">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-950 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-white px-3 py-2">
              <Image src="/logo-ct.png" alt="Chame o Tecnico" width={150} height={65} className="h-auto w-[130px]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Auto cadastro de tecnico</h1>
              <p className="text-sm text-slate-300">Preencha seus dados para atuar como parceiro credenciado.</p>
            </div>
          </div>
          <span className="w-fit rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white">
            Analise da equipe
          </span>
        </header>

        <form onSubmit={enviarCadastro} action="/api/tecnicos/autocadastro" method="post" className="rounded-xl bg-slate-50 p-4 shadow-sm md:p-5">
          {erro && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
          {mensagem && <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{mensagem}</div>}

          <section className="space-y-3">
            <SectionTitle title="Identificacao" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Input label="Nome do tecnico *" name="nome" value={form.nome} onChange={handleChange} required />
              <Input label="Empresa" name="empresa" value={form.empresa} onChange={handleChange} placeholder="Ex.: RCL Eletrica" />
              <Input label="CPF/CNPJ" name="cpfCnpj" value={form.cpfCnpj} onChange={handleChange} maxLength={18} inputMode="numeric" />
              <Input label="Chave PIX" name="chavePix" value={form.chavePix} onChange={handleChange} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatoria" />
              <Input label="WhatsApp *" name="whatsapp" value={form.whatsapp} onChange={handleChange} maxLength={15} inputMode="numeric" required />
              <Input label="E-mail" name="email" value={form.email} onChange={handleChange} />
            </div>
          </section>

          <section className="mt-5 space-y-3">
            <SectionTitle title="Endereco base" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input label={buscandoCep ? 'CEP buscando...' : 'CEP'} name="cep" value={form.cep} onChange={handleChange} maxLength={9} inputMode="numeric" />
              <Input label="Logradouro" name="logradouro" value={form.logradouro} onChange={handleChange} wide />
              <Input label="Numero" name="numero" value={form.numero} onChange={handleChange} />
              <Input label="Referencia" name="referencia" value={form.referencia} onChange={handleChange} wide />
              <Input label="Bairro" name="bairro" value={form.bairro} onChange={handleChange} />
              <Input label="Cidade base" name="cidade" value={form.cidade} onChange={handleChange} />
              <Input label="Estado" name="estado" value={form.estado} onChange={handleChange} maxLength={2} />
            </div>
          </section>

          <section className="mt-5 space-y-3">
            <SectionTitle title="Experiencia e atendimento" />
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {especialidadesDisponiveis.map((especialidade) => {
                const checked = form.especialidades.includes(especialidade)

                return (
                  <label
                    key={especialidade}
                    className={`tecnico-specialty flex min-h-14 cursor-pointer items-center justify-center rounded-lg border px-5 py-3.5 text-center text-base font-bold transition ${
                      checked
                        ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="especialidades"
                      value={especialidade}
                      checked={checked}
                      onChange={() => alternarEspecialidade(especialidade)}
                      className="sr-only"
                    />
                    <span>{especialidade}</span>
                  </label>
                )
              })}
            </div>
            <textarea
              name="experiencia"
              value={form.experiencia}
              onChange={handleChange}
              rows={5}
              className="w-full rounded-lg border border-slate-300 bg-white px-5 py-4 text-base outline-none focus:border-orange-500"
              placeholder="Conte quais equipamentos atende, regioes, disponibilidade e observacoes importantes..."
            />
          </section>

          <label className="mt-5 flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
            <input
              type="checkbox"
              name="aceiteLgpd"
              value="SIM"
              checked={form.aceiteLgpd}
              onChange={handleChange}
              required
              className="mt-1 h-4 w-4 accent-orange-500"
            />
            <span>Autorizo o uso dos meus dados para analise do cadastro, contato pelo WhatsApp e gestao de parceria, conforme a LGPD.</span>
          </label>

          <label className="mt-3 flex items-start gap-3 rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              name="aceitePrestador"
              value="SIM"
              checked={form.aceitePrestador}
              onChange={handleChange}
              required
              className="mt-1 h-4 w-4 accent-orange-500"
            />
            <span>
              Declaro ciência de que este cadastro é para atuação como prestador de serviço parceiro/terceirizado, sem gerar vínculo empregatício automático com a plataforma Chame o Técnico, ficando sujeito à análise e aprovação da equipe.
            </span>
          </label>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-orange-500 px-8 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {enviando ? 'Enviando...' : 'Enviar cadastro'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-base font-bold text-slate-900">{title}</h2>
}

function Input({
  label,
  name,
  value,
  onChange,
  maxLength,
  inputMode,
  required = false,
  placeholder,
  wide = false,
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  maxLength?: number
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
  required?: boolean
  placeholder?: string
  wide?: boolean
}) {
  return (
    <div className={wide ? 'xl:col-span-2' : ''}>
      <label className="mb-2 block text-xs font-bold uppercase text-slate-600">{label}</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        inputMode={inputMode}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-5 py-4 text-base outline-none focus:border-orange-500"
      />
    </div>
  )
}

function formatarCEP(valor: string) {
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 8)
  if (apenasNumeros.length <= 5) return apenasNumeros
  return `${apenasNumeros.slice(0, 5)}-${apenasNumeros.slice(5)}`
}

function formatarTelefone(valor: string) {
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 11)
  if (apenasNumeros.length <= 2) return apenasNumeros
  if (apenasNumeros.length <= 6) return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`
  if (apenasNumeros.length <= 10) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 6)}-${apenasNumeros.slice(6)}`
  }
  return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7)}`
}

function formatarCpfCnpj(valor: string) {
  const numeros = valor.replace(/\D/g, '').slice(0, 14)
  if (numeros.length <= 11) {
    return numeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return numeros
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}
