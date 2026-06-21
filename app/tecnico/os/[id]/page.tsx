'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'

type OSDetalhe = {
  id: number
  numero_os: string | null
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
  tecnico_valor_pecas?: number | string | null
  tecnico_valor_mao_obra?: number | string | null
  tecnico_desconto?: number | string | null
  tecnico_total?: number | string | null
  observacao_tecnica: string | null
  fotos_count?: number
  fotos?: OSFoto[]
  clientes?: {
    nome: string | null
    whatsapp: string | null
    logradouro: string | null
    numero: string | null
    bairro: string | null
    cidade: string | null
    estado: string | null
  } | null
  categorias?: { nome: string | null } | null
  marcas?: { nome: string | null } | null
}

type OSFoto = {
  id: number
  nome_arquivo: string | null
  url: string | null
  criado_em: string | null
}

type FormState = {
  status: string
  diagnosticoTecnico: string
  servicoExecutado: string
  pecasUtilizadas: string
  valorPecas: string
  valorMaoObra: string
  desconto: string
  observacaoTecnica: string
}

const statusOptions = [
  { value: 'EM_ATENDIMENTO', label: 'Em atendimento' },
  { value: 'AGUARDANDO_REVISAO', label: 'Aguardando revisao admin' },
  { value: 'AGUARDANDO_PECA', label: 'Aguardando peça' },
  { value: 'CRITICA', label: 'Crítica' },
]

export default function AtendimentoTecnicoPage() {
  const params = useParams()
  const osId = String(params?.id ?? '')
  const [tecnicoId] = useState(() => getTecnicoId())
  const [os, setOs] = useState<OSDetalhe | null>(null)
  const [form, setForm] = useState<FormState>({
    status: 'EM_ATENDIMENTO',
    diagnosticoTecnico: '',
    servicoExecutado: '',
    pecasUtilizadas: '',
    valorPecas: '0',
    valorMaoObra: '0',
    desconto: '0',
    observacaoTecnica: '',
  })
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [novasFotos, setNovasFotos] = useState<File[]>([])
  const [fotos, setFotos] = useState<OSFoto[]>([])
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregarOS = useCallback(async () => {
    setLoading(true)
    setErro('')

    try {
      const query = new URLSearchParams({ osId })
      if (tecnicoId) query.set('tecnico', tecnicoId)

      const response = await fetch(`/api/tecnico/os?${query.toString()}`)
      const data = await response.json().catch(() => null)

      if (response.status === 401) {
        window.location.href = '/tecnico/login'
        return
      }

      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel carregar a OS.')

      const item = data?.data as OSDetalhe
      setOs(item)
      setFotos(item.fotos ?? [])
      const valoresTecnico = valoresOrcamentoTecnico(item)
      setForm({
        status: item.status ?? 'EM_ATENDIMENTO',
        diagnosticoTecnico: item.diagnostico_tecnico ?? '',
        servicoExecutado: item.servico_executado ?? '',
        pecasUtilizadas: item.pecas_utilizadas ?? '',
        valorPecas: String(valoresTecnico.valorPecas),
        valorMaoObra: String(valoresTecnico.valorMaoObra),
        desconto: String(valoresTecnico.desconto),
        observacaoTecnica: item.observacao_tecnica ?? '',
      })
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar OS.')
    } finally {
      setLoading(false)
    }
  }, [osId, tecnicoId])

  useEffect(() => {
    void Promise.resolve().then(carregarOS)
  }, [carregarOS])

  const total = useMemo(() => {
    return Math.max(0, toNumber(form.valorPecas) + toNumber(form.valorMaoObra) - toNumber(form.desconto))
  }, [form.valorPecas, form.valorMaoObra, form.desconto])

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleFotosChange(event: ChangeEvent<HTMLInputElement>) {
    const selecionadas = Array.from(event.target.files ?? [])
    if (selecionadas.length === 0) return

    setNovasFotos((prev) => [...prev, ...selecionadas])
    event.target.value = ''
  }

  function removerFotoSelecionada(index: number) {
    setNovasFotos((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  async function uploadFotos() {
    if (novasFotos.length === 0) return []

    const formData = new FormData()
    formData.append('osId', osId)
    if (tecnicoId) formData.append('tecnicoId', tecnicoId)
    novasFotos.forEach((arquivo) => formData.append('fotos', arquivo))

    const response = await fetch('/api/tecnico/os/fotos', {
      method: 'POST',
      body: formData,
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel enviar as fotos.')
    setNovasFotos([])
    return (data?.fotos ?? []) as OSFoto[]
  }

  async function salvar(statusOverride?: string) {
    setSalvando(true)
    setErro('')
    setMensagem('')

    try {
      const statusFinal = statusOverride ?? form.status
      const totalFotosAposSelecao = fotos.length + novasFotos.length

      if (statusFinal === 'AGUARDANDO_REVISAO' && totalFotosAposSelecao < 3) {
        throw new Error('Para enviar o orcamento ao admin, anexe no minimo 3 fotos da OS.')
      }

      const fotosEnviadas = await uploadFotos()
      const response = await fetch('/api/tecnico/os', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osId,
          tecnicoId: tecnicoId || undefined,
          ...form,
          status: statusFinal,
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel salvar o atendimento.')
      if (fotosEnviadas.length > 0) setFotos((prev) => [...fotosEnviadas, ...prev])
      setMensagem(
        statusFinal === 'AGUARDANDO_REVISAO'
          ? 'Orcamento enviado para revisao do administrativo.'
          : 'Atendimento salvo e historico atualizado.'
      )
      await carregarOS()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar atendimento.')
    } finally {
      setSalvando(false)
    }
  }

  const equipamento = os ? [os.categorias?.nome, os.marcas?.nome, os.modelo].filter(Boolean).join(' / ') : '-'
  const totalFotos = fotos.length + novasFotos.length
  const podeEnviarRevisao = totalFotos >= 3

  return (
    <main className="min-h-screen bg-[#c7d3cf] px-4 py-5">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Image src="/logo-ct.png" alt="Chame o Tecnico" width={150} height={65} className="h-auto w-[130px]" />
              <div>
                <h1 className="text-2xl font-bold text-slate-950">Atendimento da OS</h1>
                <p className="text-sm text-slate-600">{os?.numero_os ?? 'Carregando...'}</p>
              </div>
            </div>
            <Link href={tecnicoId ? `/tecnico/painel?tecnico=${encodeURIComponent(tecnicoId)}` : '/tecnico/painel'} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Voltar ao painel
            </Link>
          </div>
        </header>

        {loading && <Notice text="Carregando OS..." tone="neutral" />}
        {erro && <Notice text={erro} tone="error" />}
        {mensagem && <Notice text={mensagem} tone="success" />}

        {!loading && os && (
          <>
            <section className="rounded-xl bg-white p-5 shadow-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Cliente" value={os.clientes?.nome ?? '-'} />
                <Info label="WhatsApp" value={os.clientes?.whatsapp ?? '-'} />
                <Info label="Equipamento" value={equipamento || '-'} />
                <Info label="Status atual" value={os.status ?? '-'} />
                <Info label="Endereco" value={formatarEndereco(os)} wide />
                <Info label="Defeito informado" value={os.defeito ?? '-'} wide />
              </div>
            </section>

            <section className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Tratativa técnica</h2>
              <p className="mt-1 text-sm text-slate-500">
                O orcamento vai para revisao do administrativo. O cliente so recebe apos a equipe liberar.
              </p>
              <div className="mt-4 grid gap-4">
                <label className="text-sm font-semibold text-slate-700">
                  Status
                  <select name="status" value={form.status} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500">
                    {statusOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>

                <TextArea label="Diagnóstico técnico" name="diagnosticoTecnico" value={form.diagnosticoTecnico} onChange={handleChange} />
                <TextArea label="Serviço executado / orientação" name="servicoExecutado" value={form.servicoExecutado} onChange={handleChange} />
                <TextArea label="Peças utilizadas ou necessárias" name="pecasUtilizadas" value={form.pecasUtilizadas} onChange={handleChange} />
                <TextArea label="Observação técnica" name="observacaoTecnica" value={form.observacaoTecnica} onChange={handleChange} />

                <div className="grid gap-3 md:grid-cols-4">
                  <MoneyInput label="Peças" name="valorPecas" value={form.valorPecas} onChange={handleChange} />
                  <MoneyInput label="Mão de obra" name="valorMaoObra" value={form.valorMaoObra} onChange={handleChange} />
                  <MoneyInput label="Desconto" name="desconto" value={form.desconto} onChange={handleChange} />
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Total</p>
                    <p className="mt-2 text-lg font-bold text-slate-950">{formatCurrency(total)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Fotos obrigatorias</h3>
                      <p className="text-xs text-slate-500">Minimo de 3 fotos para enviar o orcamento ao admin.</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${podeEnviarRevisao ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {totalFotos}/3 fotos
                    </span>
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFotosChange}
                    className="block w-full text-sm text-slate-600"
                  />

                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    Voce pode escolher uma foto por vez. Elas ficam acumuladas aqui ate enviar.
                  </p>

                  {novasFotos.length > 0 && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-bold uppercase text-slate-500">
                        Fotos selecionadas para envio ({novasFotos.length})
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {novasFotos.map((foto, index) => (
                          <div key={`${foto.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
                            <span className="min-w-0 truncate font-semibold text-slate-700">{foto.name}</span>
                            <button
                              type="button"
                              onClick={() => removerFotoSelecionada(index)}
                              className="rounded-md bg-red-50 px-2 py-1 font-bold text-red-600"
                            >
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {fotos.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {fotos.slice(0, 6).map((foto) => (
                        <a key={foto.id} href={foto.url ?? '#'} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <div className="aspect-video bg-slate-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={foto.url ?? ''} alt={foto.nome_arquivo ?? 'Foto da OS'} className="h-full w-full object-cover" />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => salvar()}
                  disabled={salvando}
                  className="rounded-xl bg-orange-500 px-5 py-4 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {salvando ? 'Salvando...' : 'Salvar rascunho tecnico'}
                </button>

                <button
                  type="button"
                  onClick={() => salvar('AGUARDANDO_REVISAO')}
                  disabled={salvando || !podeEnviarRevisao}
                  className="rounded-xl bg-slate-900 px-5 py-4 text-base font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Enviar orcamento para revisao do admin
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg bg-slate-50 px-4 py-3 ${wide ? 'md:col-span-2' : ''}`}>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function TextArea({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <textarea name={name} value={value} onChange={onChange} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500" />
    </label>
  )
}

function MoneyInput({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input name={name} value={value} onChange={onChange} type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500" />
    </label>
  )
}

function Notice({ text, tone }: { text: string; tone: 'neutral' | 'error' | 'success' }) {
  const cls =
    tone === 'error'
      ? 'bg-red-50 text-red-700'
      : tone === 'success'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-white text-slate-700'

  return <div className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ${cls}`}>{text}</div>
}

function getTecnicoId() {
  if (typeof window === 'undefined') return ''
  return String(new URLSearchParams(window.location.search).get('tecnico') ?? '').trim()
}

function formatarEndereco(os: OSDetalhe) {
  const c = os.clientes
  const linha1 = [c?.logradouro, c?.numero].filter(Boolean).join(', ')
  const linha2 = [c?.bairro, c?.cidade, c?.estado].filter(Boolean).join(' / ')
  return [linha1, linha2].filter(Boolean).join(' - ') || '-'
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0)
}

function valoresOrcamentoTecnico(item: OSDetalhe) {
  const temValorTecnico =
    toNumber(item.tecnico_valor_pecas) > 0 ||
    toNumber(item.tecnico_valor_mao_obra) > 0 ||
    toNumber(item.tecnico_desconto) > 0 ||
    toNumber(item.tecnico_total) > 0

  return {
    valorPecas: temValorTecnico ? toNumber(item.tecnico_valor_pecas) : toNumber(item.valor_pecas),
    valorMaoObra: temValorTecnico ? toNumber(item.tecnico_valor_mao_obra) : toNumber(item.valor_mao_obra),
    desconto: temValorTecnico ? toNumber(item.tecnico_desconto) : toNumber(item.desconto),
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}
