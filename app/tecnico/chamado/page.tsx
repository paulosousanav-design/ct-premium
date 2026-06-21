'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type Chamado = {
  id: number
  numero_os: string | null
  created_at: string
  status: string | null
  prioridade: string | null
  modelo: string | null
  defeito: string | null
  clientes?: {
    nome: string | null
    whatsapp: string | null
    cep: string | null
    logradouro: string | null
    numero: string | null
    bairro: string | null
    cidade: string | null
    estado: string | null
  } | null
  parceiros?: {
    responsavel: string | null
    nome_fantasia: string | null
    razao_social: string | null
    whatsapp: string | null
  } | null
  categorias?: { nome: string | null } | null
  marcas?: { nome: string | null } | null
}

type LinkParams = {
  numeroOs: string
  tecnicoId: string
}

export default function ChamadoTecnicoPage() {
  const [params] = useState<LinkParams>(() => getLinkParams())
  const [chamado, setChamado] = useState<Chamado | null>(null)
  const [loading, setLoading] = useState(true)
  const [respondendo, setRespondendo] = useState<'ACEITAR' | 'RECUSAR' | null>(null)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregarChamado = useCallback(async (numeroOs: string, tecnicoId: string) => {
    setLoading(true)
    setErro('')

    try {
      const response = await fetch(
        `/api/tecnico/chamado?os=${encodeURIComponent(numeroOs)}&tecnico=${encodeURIComponent(tecnicoId)}`
      )
      const data = await response.json().catch(() => null)

      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel carregar o chamado.')
      setChamado(data?.data ?? null)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar chamado.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => carregarChamado(params.numeroOs, params.tecnicoId))
  }, [carregarChamado, params.numeroOs, params.tecnicoId])

  async function responderChamado(acao: 'ACEITAR' | 'RECUSAR') {
    setRespondendo(acao)
    setErro('')
    setMensagem('')

    try {
      const response = await fetch('/api/tecnico/chamado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroOs: params.numeroOs,
          tecnicoId: params.tecnicoId,
          acao,
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel responder o chamado.')

      setMensagem(
        acao === 'ACEITAR'
          ? 'Chamado aceito. A equipe ja foi notificada no historico da OS.'
          : 'Chamado recusado. A equipe vai direcionar para outro tecnico.'
      )
      setChamado((prev) =>
        prev
          ? {
              ...prev,
              status: data?.status ?? prev.status,
            }
          : prev
      )
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao responder chamado.')
    } finally {
      setRespondendo(null)
    }
  }

  const tecnicoNome = getNomeTecnico(chamado)
  const equipamento = [chamado?.categorias?.nome, chamado?.marcas?.nome, chamado?.modelo]
    .filter(Boolean)
    .join(' / ')

  return (
    <main className="min-h-screen bg-[#c7d3cf] px-4 py-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Image src="/logo-ct.png" alt="Chame o Tecnico" width={150} height={65} className="h-auto w-[130px]" />
              <div>
                <h1 className="text-2xl font-bold text-slate-950">Chamado tecnico</h1>
                <p className="text-sm text-slate-600">Analise a OS e informe se consegue atender.</p>
              </div>
            </div>
            {chamado?.status && <StatusBadge status={chamado.status} />}
          </div>
        </header>

        {loading && <Notice tone="neutral" text="Carregando chamado..." />}
        {erro && <Notice tone="error" text={erro} />}
        {mensagem && <Notice tone="success" text={mensagem} />}

        {!loading && chamado && (
          <>
            {chamado.status === 'EM_ATENDIMENTO' && (
              <Link
                href="/tecnico/painel"
                className="block rounded-xl bg-slate-900 px-5 py-4 text-center text-base font-bold text-white shadow-sm transition hover:bg-slate-800"
              >
                Abrir painel técnico
              </Link>
            )}

            <section className="rounded-xl bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-orange-600">{chamado.numero_os ?? `OS #${chamado.id}`}</p>
                  <h2 className="text-xl font-bold text-slate-950">{chamado.clientes?.nome ?? 'Cliente'}</h2>
                  <p className="text-sm text-slate-500">Tecnico: {tecnicoNome}</p>
                </div>
                <span
                  className="shrink-0 rounded-md bg-slate-100 text-xs font-semibold text-slate-700"
                  style={{ display: 'inline-flex', height: 28, width: 'auto', alignItems: 'center', padding: '0 12px' }}
                >
                  {chamado.prioridade ?? 'NORMAL'}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoItem label="Equipamento" value={equipamento || '-'} />
                <InfoItem label="WhatsApp cliente" value={chamado.clientes?.whatsapp} />
                <InfoItem label="Endereco" value={formatarEndereco(chamado)} wide />
                <InfoItem label="Defeito informado" value={chamado.defeito} wide />
              </div>
            </section>

            <section className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Resposta do atendimento</h2>
              <p className="mt-1 text-sm text-slate-600">
                Ao aceitar, a OS entra em atendimento. Ao recusar, ela volta para triagem para outro tecnico.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => responderChamado('ACEITAR')}
                  disabled={Boolean(respondendo) || chamado.status === 'EM_ATENDIMENTO'}
                  className="rounded-xl bg-emerald-600 px-5 py-4 text-base font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {respondendo === 'ACEITAR' ? 'Aceitando...' : 'Aceitar chamado'}
                </button>
                <button
                  type="button"
                  onClick={() => responderChamado('RECUSAR')}
                  disabled={Boolean(respondendo)}
                  className="rounded-xl bg-red-600 px-5 py-4 text-base font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {respondendo === 'RECUSAR' ? 'Recusando...' : 'Recusar chamado'}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function InfoItem({
  label,
  value,
  wide = false,
}: {
  label: string
  value?: string | null
  wide?: boolean
}) {
  return (
    <div className={`rounded-lg bg-slate-50 px-4 py-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-900">{value || '-'}</p>
    </div>
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

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'EM_ATENDIMENTO'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'EM_TRIAGEM'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700'

  return (
    <span
      className={`shrink-0 rounded-md text-xs font-bold ${cls}`}
      style={{ display: 'inline-flex', height: 28, width: 'auto', alignItems: 'center', padding: '0 12px' }}
    >
      {status}
    </span>
  )
}

function getNomeTecnico(chamado: Chamado | null) {
  const tecnico = chamado?.parceiros
  return tecnico?.responsavel ?? tecnico?.nome_fantasia ?? tecnico?.razao_social ?? '-'
}

function formatarEndereco(chamado: Chamado) {
  const cliente = chamado.clientes
  const linha1 = [cliente?.logradouro, cliente?.numero].filter(Boolean).join(', ')
  const linha2 = [cliente?.bairro, cliente?.cidade, cliente?.estado].filter(Boolean).join(' / ')
  const cep = cliente?.cep ? `CEP ${cliente.cep}` : ''

  return [linha1, linha2, cep].filter(Boolean).join(' - ') || '-'
}

function getLinkParams(): LinkParams {
  if (typeof window === 'undefined') return { numeroOs: '', tecnicoId: '' }

  const search = new URLSearchParams(window.location.search)
  return {
    numeroOs: String(search.get('os') ?? '').trim(),
    tecnicoId: String(search.get('tecnico') ?? '').trim(),
  }
}
