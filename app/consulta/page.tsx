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

type Foto = {
  id: number
  nome_arquivo: string | null
  url: string | null
  criado_em: string | null
}

type HistoricoItem = {
  id: number
  os_id: number | null
  acao: string | null
  status_anterior: string | null
  status_novo: string | null
  prioridade_anterior: string | null
  prioridade_nova: string | null
  descricao: string | null
  responsavel: string | null
  criado_em: string | null
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
    prioridade: string | null
    modelo: string | null
    numero_serie: string | null
    defeito: string | null
    diagnostico_tecnico: string | null
    servico_executado: string | null
    pecas_utilizadas: string | null
    valor_pecas: number | string | null
    valor_mao_obra: number | string | null
    desconto: number | string | null
    total: number | string | null
    observacao_tecnica: string | null
    orcamento_status: string | null
    orcamento_resposta_em: string | null
    cliente: Cliente
    categoria: Categoria | null
    marca: Marca | null
  }
  fotos: Foto[]
  historico: HistoricoItem[]
  pecas: PecaItem[]
  ultimaAtualizacao: string | null
}

const STATUS_STEPS = [
  { key: 'NOVA', label: 'Recebido' },
  { key: 'EM_TRIAGEM', label: 'Triagem' },
  { key: 'EM_ATENDIMENTO', label: 'Atendimento' },
  { key: 'PRONTO_AGUARDANDO_ENTREGA', label: 'Pronto/entrega' },
  { key: 'AGUARDANDO_APROVACAO', label: 'Aprovação' },
  { key: 'AGUARDANDO_PECA', label: 'Peça' },
  { key: 'CRITICA', label: 'Crítica' },
  { key: 'FINALIZADA', label: 'Finalizada' },
] as const

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

  const statusAtual = resultado?.os.status ?? 'NOVA'
  const passoAtual = STATUS_STEPS.findIndex((step) => step.key === statusAtual)
  const passoSeguro = passoAtual === -1 ? 0 : passoAtual

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
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <InfoCard label="OS" value={resultado.os.numero_os ?? '-'} />
              <InfoCard label="Status" value={formatarStatusOs(resultado.os.status)} />
              <InfoCard label="Prioridade" value={resultado.os.prioridade ?? '-'} />
              <InfoCard
                label="Última atualização"
                value={formatDate(resultado.ultimaAtualizacao ?? resultado.os.created_at)}
              />
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Acompanhamento</h2>
                  <p className="text-sm text-slate-500">Veja em que etapa o chamado está.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Orçamento: {resultado.os.orcamento_status ?? 'PENDENTE'}
                  </span>

                  {resultado.os.orcamento_status === 'APROVADO' && (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Orçamento aprovado
                    </span>
                  )}

                  {resultado.os.orcamento_status === 'REPROVADO' && (
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      Orçamento reprovado
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {STATUS_STEPS.map((step, index) => {
                  const active = index <= passoSeguro
                  const current = index === passoSeguro
                  const isCritical = step.key === 'CRITICA' && resultado.os.status === 'CRITICA'

                  const cls = isCritical
                    ? 'border-red-500 bg-red-500 text-white'
                    : active
                      ? 'border-orange-500 bg-orange-500 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-500'

                  return (
                    <div
                      key={step.key}
                      className={`rounded-xl border px-4 py-3 text-center text-sm font-medium ${cls}`}
                    >
                      <div className="text-xs uppercase opacity-80">{current ? 'Atual' : 'Etapa'}</div>
                      <div className="mt-1">{step.label}</div>
                    </div>
                  )
                })}
              </div>

              {podeResponderOrcamento && (
                <div className="mt-6">
                  {acaoSugerida && (
                    <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
                      Link recebido para {acaoSugerida === 'APROVAR' ? 'aprovar' : 'reprovar'} este orçamento.
                      Confira os dados e confirme no botão abaixo.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => responderOrcamento('APROVAR')}
                    disabled={processandoAcao !== null}
                    className={`rounded-lg px-5 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${
                      acaoSugerida === 'APROVAR'
                        ? 'bg-emerald-700 ring-4 ring-emerald-100 hover:bg-emerald-800'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {processandoAcao === 'APROVAR' ? 'Processando...' : 'Aprovar orçamento'}
                  </button>

                  <button
                    type="button"
                    onClick={() => responderOrcamento('REPROVAR')}
                    disabled={processandoAcao !== null}
                    className={`rounded-lg px-5 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${
                      acaoSugerida === 'REPROVAR'
                        ? 'bg-red-700 ring-4 ring-red-100 hover:bg-red-800'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {processandoAcao === 'REPROVAR' ? 'Processando...' : 'Reprovar orçamento'}
                  </button>
                  </div>
                </div>
              )}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
              <div className="space-y-6">
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-xl font-semibold text-slate-900">Dados do chamado</h2>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <InfoBlock label="Cliente" value={resultado.os.cliente.nome ?? '-'} />
                    <InfoBlock label="CPF/CNPJ" value={resultado.os.cliente.cpf_cnpj ?? '-'} />
                    <InfoBlock label="WhatsApp" value={resultado.os.cliente.whatsapp ?? '-'} />
                    <InfoBlock label="E-mail" value={resultado.os.cliente.email ?? '-'} />
                    <InfoBlock label="Categoria" value={resultado.os.categoria?.nome ?? '-'} />
                    <InfoBlock label="Marca" value={resultado.os.marca?.nome ?? '-'} />
                    <InfoBlock label="Modelo" value={resultado.os.modelo ?? '-'} />
                    <InfoBlock label="Número de série" value={resultado.os.numero_serie ?? '-'} />
                  </div>

                  <div className="mt-4">
                    <InfoBlock label="Defeito informado" value={resultado.os.defeito ?? '-'} wide />
                  </div>

                  {resultado.os.diagnostico_tecnico ||
                  resultado.os.servico_executado ||
                  resultado.os.observacao_tecnica ? (
                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      <InfoBlock label="Diagnóstico técnico" value={resultado.os.diagnostico_tecnico ?? '-'} wide />
                      <InfoBlock label="Serviço executado" value={resultado.os.servico_executado ?? '-'} wide />
                      <InfoBlock label="Observação técnica" value={resultado.os.observacao_tecnica ?? '-'} wide />
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-slate-900">Peças e orçamento</h2>
                    <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      Total: {formatCurrency(totalGeral)}
                    </span>
                  </div>

                  {resultado.pecas.length > 0 ? (
                    <div className="space-y-3">
                      {resultado.pecas.map((peca) => (
                        <div
                          key={peca.id}
                          className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{peca.descricao ?? 'Peça'}</p>
                            <p className="text-sm text-slate-500">
                              {toNumber(peca.quantidade)}x • {formatCurrency(toNumber(peca.valor_unitario))} cada
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-500">Subtotal</p>
                            <p className="text-lg font-bold text-slate-900">
                              {formatCurrency(toNumber(peca.total_item))}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Ainda não há peças lançadas para esta OS.</p>
                  )}

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <InfoBlock label="Peças" value={formatCurrency(toNumber(resultado.os.valor_pecas) || totalPecas)} />
                    <InfoBlock label="Mão de obra" value={formatCurrency(toNumber(resultado.os.valor_mao_obra))} />
                    <InfoBlock label="Desconto" value={formatCurrency(toNumber(resultado.os.desconto))} />
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-xl font-semibold text-slate-900">Fotos do chamado</h2>

                  {resultado.fotos.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {resultado.fotos.map((foto) => (
                        <a
                          key={foto.id}
                          href={foto.url ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                        >
                          <div className="aspect-video bg-slate-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={foto.url ?? ''}
                              alt={foto.nome_arquivo ?? 'Foto da OS'}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-medium text-slate-800">
                              {foto.nome_arquivo ?? 'Foto'}
                            </p>
                            <p className="text-xs text-slate-500">
                              {foto.criado_em ? formatDate(foto.criado_em) : ''}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Nenhuma foto cadastrada ainda.</p>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-xl font-semibold text-slate-900">Resumo do cliente</h2>

                  <div className="space-y-3">
                    <MiniItem label="Cliente" value={resultado.os.cliente.nome ?? '-'} />
                    <MiniItem label="WhatsApp" value={resultado.os.cliente.whatsapp ?? '-'} />
                    <MiniItem label="CEP" value={resultado.os.cliente.cep ?? '-'} />
                    <MiniItem
                      label="Endereço"
                      value={[
                        resultado.os.cliente.logradouro,
                        resultado.os.cliente.numero,
                        resultado.os.cliente.bairro,
                        resultado.os.cliente.cidade,
                        resultado.os.cliente.estado,
                      ]
                        .filter(Boolean)
                        .join(', ') || '-'}
                    />
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-xl font-semibold text-slate-900">Linha do tempo</h2>

                  <div className="max-h-[720px] space-y-4 overflow-y-auto pr-2">
                    {resultado.historico.length > 0 ? (
                      resultado.historico.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {item.acao ?? 'Evento'}
                              </p>
                              <p className="text-xs text-slate-500">
                                {item.criado_em ? formatDate(item.criado_em) : ''}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                              {item.responsavel ?? 'Sistema'}
                            </span>
                          </div>

                          {item.descricao && (
                            <p className="mt-3 text-sm text-slate-600">{item.descricao}</p>
                          )}

                          <div className="mt-3 grid gap-2 text-xs text-slate-500">
                            <span>Status: {item.status_anterior ?? '-'} → {item.status_novo ?? '-'}</span>
                            <span>
                              Prioridade: {item.prioridade_anterior ?? '-'} → {item.prioridade_nova ?? '-'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">Sem movimentações registradas ainda.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
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

function MiniItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
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

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR')
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
