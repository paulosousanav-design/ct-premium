'use client'

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react'

type ConsultaForm = {
  numeroOs: string
  whatsapp: string
}

type Cliente = {
  id: number
  nome: string | null
  cpf_cnpj: string | null
  whatsapp: string | null
  email: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

type Categoria = {
  id: number
  nome: string | null
}

type Marca = {
  id: number
  nome: string | null
}

type PecaItem = {
  id: number
  descricao: string | null
  quantidade: number | string | null
  valor_unitario: number | string | null
  total_item: number | string | null
  criado_em: string | null
}

type ConsultaResultado = {
  os: {
    id: number
    numero_os: string | null
    created_at: string
    status: string | null
    modelo: string | null
    numero_serie: string | null
    defeito: string | null
    valor_pecas: number | string | null
    valor_mao_obra: number | string | null
    desconto: number | string | null
    total: number | string | null
    orcamento_status: string | null
    orcamento_resposta_em: string | null
    cliente: Cliente
    categoria: Categoria | null
    marca: Marca | null
  }
  pecas: PecaItem[]
}

export default function ConsultaPage() {
  const [form, setForm] = useState<ConsultaForm>(() => getConsultaInicial().form)
  const [resultado, setResultado] = useState<ConsultaResultado | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [processandoAcao, setProcessandoAcao] = useState<'APROVAR' | 'REPROVAR' | null>(null)
  const [ultimaConsulta, setUltimaConsulta] = useState<ConsultaForm | null>(null)
  const [acaoSugerida] = useState<'APROVAR' | 'REPROVAR' | null>(() => getConsultaInicial().acao)

  useEffect(() => {
    const inicial = getConsultaInicial()
    if (!inicial.form.numeroOs || !inicial.form.whatsapp) return

    void (async () => {
      await consultarChamado(inicial.form)

      if (inicial.acao) {
        setMensagem(
          inicial.acao === 'APROVAR'
            ? 'Confira o orçamento abaixo e confirme no botão Aprovar orçamento.'
            : 'Confira o orçamento abaixo e confirme no botão Reprovar orçamento.'
        )
      }
    })()
  }, [])

  const totalPecas = useMemo(() => {
    if (!resultado?.pecas?.length) return 0
    return resultado.pecas.reduce((acc, item) => acc + toNumber(item.total_item), 0)
  }, [resultado])

  const totalGeral = useMemo(() => {
    const valorPecas = toNumber(resultado?.os.valor_pecas) || totalPecas
    const maoObra = toNumber(resultado?.os.valor_mao_obra)
    const desconto = toNumber(resultado?.os.desconto)
    const total = toNumber(resultado?.os.total)

    return total > 0 ? total : Math.max(0, valorPecas + maoObra - desconto)
  }, [resultado, totalPecas])

  async function consultarChamado(payload: ConsultaForm) {
    setLoading(true)
    setErro('')
    setMensagem('')
    setResultado(null)

    try {
      const response = await fetch('/api/consulta', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          numeroOs: payload.numeroOs.trim(),
          whatsapp: payload.whatsapp.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error ?? 'Não foi possível consultar a OS.')
      }

      setResultado(data as ConsultaResultado)
      setUltimaConsulta(payload)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao consultar a OS.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    await consultarChamado(form)
  }

  async function responderOrcamento(acao: 'APROVAR' | 'REPROVAR') {
    if (!ultimaConsulta) {
      setErro('Consulte a OS antes de aprovar ou reprovar o orçamento.')
      return
    }

    setProcessandoAcao(acao)
    setErro('')
    setMensagem('')

    try {
      const response = await fetch('/api/consulta/orcamento', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          numeroOs: ultimaConsulta.numeroOs,
          whatsapp: ultimaConsulta.whatsapp,
          acao,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error ?? 'Não foi possível responder o orçamento.')
      }

      setMensagem(
        acao === 'APROVAR'
          ? 'Orçamento aprovado com sucesso.'
          : 'Orçamento reprovado com sucesso.'
      )

      await consultarChamado(ultimaConsulta)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao responder o orçamento.')
    } finally {
      setProcessandoAcao(null)
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target

    if (name === 'numeroOs') {
      setForm((prev) => ({ ...prev, numeroOs: value.toUpperCase() }))
      return
    }

    if (name === 'whatsapp') {
      setForm((prev) => ({ ...prev, whatsapp: formatarTelefone(value) }))
      return
    }

    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const podeResponderOrcamento =
    resultado?.os.orcamento_status === 'PENDENTE' && totalGeral > 0

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-orange-500">
                Portal do Cliente
              </p>
              <h1 className="text-3xl font-bold text-slate-900">Consultar chamado</h1>
              <p className="mt-1 text-slate-500">
                Informe o número da OS e o WhatsApp usado no cadastro.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              A consulta é privada e mostra apenas o seu chamado.
            </div>
          </div>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[1.2fr_1fr_auto]">
            <Input
              label="Número da OS"
              name="numeroOs"
              value={form.numeroOs}
              onChange={handleChange}
              placeholder="CT260620123456"
            />

            <Input
              label="WhatsApp"
              name="whatsapp"
              value={form.whatsapp}
              onChange={handleChange}
              placeholder="(67) 99999-9999"
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-auto rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Consultando...' : 'Consultar'}
            </button>
          </form>

          {erro && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {erro}
            </div>
          )}

          {mensagem && (
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {mensagem}
            </div>
          )}
        </section>

        {!resultado && !loading && (
          <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Aguardando consulta</h2>
            <p className="mt-2 text-slate-500">
              Digite o número da OS e o WhatsApp para acompanhar o andamento do chamado.
            </p>
          </section>
        )}

        {resultado && (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2">
              <InfoCard label="OS" value={resultado.os.numero_os ?? '-'} />
              <InfoCard label="Status atual" value={formatarStatusOs(resultado.os.status)} />
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">Dados do cliente</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <InfoBlock label="Cliente" value={resultado.os.cliente.nome ?? '-'} />
                <InfoBlock label="CPF/CNPJ" value={resultado.os.cliente.cpf_cnpj ?? '-'} />
                <InfoBlock label="WhatsApp" value={resultado.os.cliente.whatsapp ?? '-'} />
                <InfoBlock label="E-mail" value={resultado.os.cliente.email ?? '-'} />
                <InfoBlock label="CEP" value={resultado.os.cliente.cep ?? '-'} />
                <InfoBlock
                  label="Endereço"
                  value={[
                    resultado.os.cliente.logradouro,
                    resultado.os.cliente.numero,
                    resultado.os.cliente.bairro,
                    resultado.os.cliente.cidade,
                    resultado.os.cliente.estado,
                  ].filter(Boolean).join(', ') || '-'}
                  wide
                />
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">Dados do equipamento</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <InfoBlock label="Categoria" value={resultado.os.categoria?.nome ?? '-'} />
                <InfoBlock label="Marca" value={resultado.os.marca?.nome ?? '-'} />
                <InfoBlock label="Modelo" value={resultado.os.modelo ?? '-'} />
                <InfoBlock label="Número de série" value={resultado.os.numero_serie ?? '-'} />
                <InfoBlock label="Defeito informado" value={resultado.os.defeito ?? '-'} wide />
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Orçamento</h2>
                  <p className="text-sm text-slate-500">
                    Situação: {resultado.os.orcamento_status ?? 'PENDENTE'}
                  </p>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
                  Total: {formatCurrency(totalGeral)}
                </span>
              </div>

              {resultado.pecas.length > 0 && (
                <div className="mb-4 space-y-3">
                  {resultado.pecas.map((peca) => (
                    <div key={peca.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{peca.descricao ?? 'Peça'}</p>
                        <p className="text-sm text-slate-500">
                          {toNumber(peca.quantidade)}x • {formatCurrency(toNumber(peca.valor_unitario))} cada
                        </p>
                      </div>
                      <p className="font-bold text-slate-900">{formatCurrency(toNumber(peca.total_item))}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-4">
                <InfoBlock label="Peças" value={formatCurrency(toNumber(resultado.os.valor_pecas) || totalPecas)} />
                <InfoBlock label="Mão de obra" value={formatCurrency(toNumber(resultado.os.valor_mao_obra))} />
                <InfoBlock label="Desconto" value={formatCurrency(toNumber(resultado.os.desconto))} />
                <InfoBlock label="Total" value={formatCurrency(totalGeral)} />
              </div>

              {podeResponderOrcamento && (
                <div className="mt-6">
                  {acaoSugerida && (
                    <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
                      Confira o orçamento e confirme sua decisão abaixo.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => responderOrcamento('APROVAR')} disabled={processandoAcao !== null} className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-70">
                      {processandoAcao === 'APROVAR' ? 'Processando...' : 'Aprovar orçamento'}
                    </button>
                    <button type="button" onClick={() => responderOrcamento('REPROVAR')} disabled={processandoAcao !== null} className="rounded-lg bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-70">
                      {processandoAcao === 'REPROVAR' ? 'Processando...' : 'Reprovar orçamento'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}

function Input({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string
  name: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500"
      />
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function InfoBlock({
  label,
  value,
  wide = false,
}: {
  label: string
  value: string
  wide?: boolean
}) {
  return (
    <div className={`rounded-xl border border-slate-200 p-4 ${wide ? 'md:col-span-2 xl:col-span-3' : ''}`}>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

function getConsultaInicial(): { form: ConsultaForm; acao: 'APROVAR' | 'REPROVAR' | null } {
  if (typeof window === 'undefined') {
    return { form: { numeroOs: '', whatsapp: '' }, acao: null }
  }

  const params = new URLSearchParams(window.location.search)
  const numeroOs = params.get('os') || params.get('numeroOs') || ''
  const whatsapp = params.get('whatsapp') || ''
  const acaoParam = params.get('acao')
  const acao =
    acaoParam === 'APROVAR' || acaoParam === 'REPROVAR' ? acaoParam : null

  return {
    form: {
      numeroOs: numeroOs.toUpperCase(),
      whatsapp,
    },
    acao,
  }
}

function formatarStatusOs(status?: string | null) {
  const labels: Record<string, string> = {
    NOVA: 'Recebido',
    EM_TRIAGEM: 'Em triagem',
    EM_ATENDIMENTO: 'Em atendimento',
    AGUARDANDO_APROVACAO: 'Aguardando aprovacao',
    AGUARDANDO_PECA: 'Aguardando peca',
    PRONTO_AGUARDANDO_ENTREGA: 'Pronto aguardando entrega',
    CRITICA: 'Critica',
    FINALIZADA: 'Finalizada',
    ENCERRADA_SEM_REPARO: 'Encerrada sem reparo',
  }

  return labels[String(status ?? '')] ?? String(status ?? '-')
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
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
