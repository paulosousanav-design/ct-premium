'use client'

import Image from 'next/image'
import Link from 'next/link'
import { type ChangeEvent, type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

type OSItem = {
  id: number
  numero_os: string | null
  created_at: string
  status: string | null
  prioridade: string | null
  modelo: string | null
  defeito: string | null
  total?: number | string | null
  tecnico_total?: number | string | null
  tecnico_status_pagamento?: string | null
  tecnico_pago_em?: string | null
  status_financeiro?: string | null
  clientes?: {
    nome: string | null
    whatsapp: string | null
    cep?: string | null
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
  } | null
  categorias?: { nome: string | null } | null
  marcas?: { nome: string | null } | null
}

type ResumoTecnico = {
  executados: number
  abertas: number
  emRevisao: number
  recebido: number
  aReceber: number
  total: number
}

type TecnicoLogado = {
  id: number
  nome: string
  whatsapp: string | null
}

type DocumentoTecnico = {
  id: number
  tipo: string | null
  valor: number | string | null
  nome_arquivo: string | null
  url: string | null
  observacao: string | null
  status: string | null
  criado_em: string | null
}

export default function PainelTecnicoPage() {
  const [tecnicoId] = useState(() => getTecnicoId())
  const [tecnicoLogado, setTecnicoLogado] = useState<TecnicoLogado | null>(null)
  const [ordens, setOrdens] = useState<OSItem[]>([])
  const [documentos, setDocumentos] = useState<DocumentoTecnico[]>([])
  const [documentosPendentes, setDocumentosPendentes] = useState(false)
  const [resumo, setResumo] = useState<ResumoTecnico>({
    executados: 0,
    abertas: 0,
    emRevisao: 0,
    recebido: 0,
    aReceber: 0,
    total: 0,
  })
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [abaAtiva, setAbaAtiva] = useState<'tratamento' | 'finalizadas'>('tratamento')
  const [osDocumentoId, setOsDocumentoId] = useState('')
  const [agendaDatas, setAgendaDatas] = useState<Record<string, string>>(() => carregarAgendaLocal(tecnicoId))

  const carregarSessao = useCallback(async () => {
    if (tecnicoId) return

    const response = await fetch('/api/tecnico/login')
    const data = await response.json().catch(() => null)

    if (response.status === 401) {
      window.location.href = '/tecnico/login'
      return
    }

    if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel validar seu acesso.')
    setTecnicoLogado(data?.tecnico ?? null)
  }, [tecnicoId])

  const carregarDocumentos = useCallback(async () => {
    const url = tecnicoId
      ? `/api/tecnico/documentos?tecnico=${encodeURIComponent(tecnicoId)}`
      : '/api/tecnico/documentos'
    const response = await fetch(url)
    const data = await response.json().catch(() => null)

    if (response.status === 401) return
    if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel carregar documentos.')

    setDocumentos((data?.data ?? []) as DocumentoTecnico[])
    setDocumentosPendentes(Boolean(data?.tabelaPendente))
  }, [tecnicoId])

  const carregarOrdens = useCallback(async () => {
    setLoading(true)
    setErro('')

    try {
      await carregarSessao()

      const response = await fetch(tecnicoId ? `/api/tecnico/os?tecnico=${encodeURIComponent(tecnicoId)}` : '/api/tecnico/os')
      const data = await response.json().catch(() => null)

      if (response.status === 401) {
        window.location.href = '/tecnico/login'
        return
      }

      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel carregar suas OS.')
      setOrdens((data?.data ?? []) as OSItem[])
      setResumo((data?.resumo ?? resumoInicial()) as ResumoTecnico)
      await carregarDocumentos()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar OS.')
    } finally {
      setLoading(false)
    }
  }, [carregarDocumentos, carregarSessao, tecnicoId])

  useEffect(() => {
    void Promise.resolve().then(carregarOrdens)
  }, [carregarOrdens])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(getAgendaStorageKey(tecnicoId), JSON.stringify(agendaDatas))
  }, [agendaDatas, tecnicoId])

  const tecnicoNome = tecnicoLogado?.nome || getNomeTecnico(ordens[0])
  const ordensAbertas = ordens.filter((os) => os.status !== 'FINALIZADA')
  const ordensFinalizadas = ordens.filter((os) => os.status === 'FINALIZADA')
  const ordensAReceber = ordensFinalizadas.filter((os) => !tecnicoPago(os))
  const agendaItens = useMemo(
    () => ordensAbertas
      .map((os) => ({
        os,
        dataHora: agendaDatas[String(os.id)] || defaultAgendaDateTime(os.created_at),
      }))
      .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime()),
    [agendaDatas, ordensAbertas]
  )

  async function sair() {
    await fetch('/api/tecnico/login', { method: 'DELETE' }).catch(() => null)
    window.location.href = '/tecnico/login'
  }

  function atualizarAgenda(osId: number, dataHora: string) {
    setAgendaDatas((atual) => ({ ...atual, [String(osId)]: dataHora }))
  }

  return (
    <main className="min-h-screen bg-[#c7d3cf] px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Image src="/logo-ct.png" alt="Chame o Tecnico" width={150} height={65} className="h-auto w-[130px]" />
              <div>
                <h1 className="text-2xl font-bold text-slate-950">Painel do tecnico</h1>
                <p className="text-sm text-slate-600">{tecnicoNome || 'Ordens direcionadas para atendimento'}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={carregarOrdens}
                className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"
              >
                Atualizar
              </button>
              {!tecnicoId && (
                <button
                  type="button"
                  onClick={sair}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Sair
                </button>
              )}
            </div>
          </div>
        </header>

        {erro && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}

        <div className="grid gap-4 xl:grid-cols-3">
          <section className="rounded-xl bg-white p-4 shadow-sm xl:col-span-2">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Minhas OS</h2>
                <p className="text-xs text-slate-500">Separe o que esta em tratamento dos servicos ja concluidos.</p>
              </div>

              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setAbaAtiva('tratamento')}
                  className={`rounded-md px-3 py-1.5 text-xs font-black transition ${
                    abaAtiva === 'tratamento' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Em tratamento ({ordensAbertas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAbaAtiva('finalizadas')}
                  className={`rounded-md px-3 py-1.5 text-xs font-black transition ${
                    abaAtiva === 'finalizadas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Finalizadas ({ordensFinalizadas.length})
                </button>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Carregando...</p>
            ) : abaAtiva === 'tratamento' && ordensAbertas.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {ordensAbertas.map((os) => {
                  const alerta = getStatusAlerta(os.status)

                  return (
                    <article key={os.id} className="rounded-lg border p-3 shadow-sm" style={alerta.cardStyle}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-orange-600">{os.numero_os ?? `OS #${os.id}`}</p>
                          <h3 className="truncate text-base font-bold text-slate-950">{os.clientes?.nome ?? 'Cliente'}</h3>
                          <p className="text-[11px] text-slate-500">{new Date(os.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <StatusBadge status={os.status ?? 'NOVA'} compact />
                      </div>

                      <div className="mb-2 rounded-md px-2 py-1.5 text-xs font-bold" style={alerta.bannerStyle}>
                        {alerta.label}
                      </div>

                      {os.prioridade === 'URGENTE' && (
                        <div className="mb-2 animate-pulse rounded-md bg-red-600 px-2 py-1.5 text-xs font-bold text-white">
                          Prioridade urgente
                        </div>
                      )}

                      <div className="space-y-1.5 text-xs">
                        <Info label="Equipamento" value={formatarEquipamento(os)} compact />
                        <Info label="Endereco" value={formatarEndereco(os)} compact />
                      </div>

                      <Link
                        href={tecnicoId ? `/tecnico/os/${os.id}?tecnico=${encodeURIComponent(tecnicoId)}` : `/tecnico/os/${os.id}`}
                        className="mt-3 block rounded-lg bg-orange-500 px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-orange-600"
                      >
                        Tratar OS
                      </Link>
                    </article>
                  )
                })}
              </div>
            ) : abaAtiva === 'tratamento' ? (
              <p className="text-sm text-slate-500">Nenhuma OS aberta atribuida para este tecnico.</p>
            ) : ordensFinalizadas.length ? (
              <>
                <div className="mb-3 flex justify-end">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    {ordensAReceber.length} a receber
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {ordensFinalizadas.map((os) => (
                    <article key={os.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-emerald-700">{os.numero_os ?? `OS #${os.id}`}</p>
                          <h3 className="truncate text-base font-bold text-slate-950">{os.clientes?.nome ?? 'Cliente'}</h3>
                          <p className="text-[11px] text-slate-500">{formatarEquipamento(os)}</p>
                        </div>
                        <span className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">
                          {tecnicoPago(os) ? 'PAGO' : 'A RECEBER'}
                        </span>
                      </div>

                      <div className="mb-3 rounded-md bg-white px-3 py-2">
                        <p className="text-[10px] font-bold uppercase text-slate-500">Valor do tecnico</p>
                        <p className="text-lg font-black text-slate-950">{formatCurrency(valorTotalTecnico(os))}</p>
                      </div>

                      <Link
                        href={tecnicoId ? `/tecnico/os/${os.id}?tecnico=${encodeURIComponent(tecnicoId)}` : `/tecnico/os/${os.id}`}
                        className="block rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-slate-800"
                      >
                            Ver OS finalizada
                          </Link>
                          <button
                            type="button"
                            onClick={() => setOsDocumentoId(String(os.id))}
                            className="mt-2 block w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-center text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Enviar NF/recibo desta OS
                          </button>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma OS finalizada ainda.</p>
            )}
          </section>

          <aside className="space-y-3">
            <AgendaTecnicoPanel
              itens={agendaItens}
              onDataHoraChange={atualizarAgenda}
            />
            <ResumoTecnicoPanel resumo={resumo} />
            <DocumentoPagamentoPanel
              tecnicoId={tecnicoId}
              documentos={documentos}
              tabelaPendente={documentosPendentes}
              ordensFinalizadas={ordensFinalizadas}
              osSelecionadaId={osDocumentoId}
              onOsSelecionada={setOsDocumentoId}
              onUploaded={carregarDocumentos}
            />
          </aside>
        </div>
      </div>
    </main>
  )
}

function AgendaTecnicoPanel({
  itens,
  onDataHoraChange,
}: {
  itens: Array<{ os: OSItem; dataHora: string }>
  onDataHoraChange: (osId: number, dataHora: string) => void
}) {
  return (
    <section className="rounded-xl bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-950">Agenda</h2>
          <p className="text-xs text-slate-500">Atendimentos em aberto e sincronizacao com Google.</p>
        </div>
        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
          {itens.length}
        </span>
      </div>

      {itens.length ? (
        <div className="space-y-2">
          {itens.slice(0, 5).map(({ os, dataHora }) => (
            <article key={os.id} className="rounded-lg border border-slate-200 p-2">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-orange-600">{os.numero_os ?? `OS #${os.id}`}</p>
                  <h3 className="truncate text-sm font-bold text-slate-950">{os.clientes?.nome ?? 'Cliente'}</h3>
                </div>
                <StatusBadge status={os.status ?? 'NOVA'} compact />
              </div>

              <input
                type="datetime-local"
                value={dataHora}
                onChange={(event) => onDataHoraChange(os.id, event.target.value)}
                className="mb-2 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-orange-500"
              />

              <p className="mb-2 line-clamp-2 text-xs text-slate-600">{formatarEndereco(os)}</p>

              <a
                href={criarGoogleCalendarUrl(os, dataHora)}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-emerald-700"
              >
                Sincronizar Google
              </a>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Nenhuma OS aberta para agendar.</p>
      )}
    </section>
  )
}

function Info({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-md bg-white ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
      <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
      <p className={`font-semibold text-slate-900 ${compact ? 'line-clamp-1 text-xs' : ''}`}>{value}</p>
    </div>
  )
}

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const alerta = getStatusAlerta(status)

  return <span className={`rounded-md font-bold ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1 text-xs'}`} style={alerta.badgeStyle}>{status}</span>
}

function ResumoTecnicoPanel({ resumo }: { resumo: ResumoTecnico }) {
  const totalFinanceiro = Math.max(resumo.total, 1)
  const recebidoPercent = Math.round((resumo.recebido / totalFinanceiro) * 100)
  const receberPercent = Math.round((resumo.aReceber / totalFinanceiro) * 100)
  const totalServicos = Math.max(resumo.executados + resumo.abertas, 1)
  const executadosPercent = Math.round((resumo.executados / totalServicos) * 100)
  const abertasPercent = Math.round((resumo.abertas / totalServicos) * 100)

  return (
    <>
      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">Resumo do tecnico</h2>
        <p className="text-xs text-slate-500">Servicos, recebidos e valores em aberto</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniMetric label="Executados" value={String(resumo.executados)} tone="emerald" />
          <MiniMetric label="Abertas" value={String(resumo.abertas)} tone="amber" />
          <MiniMetric label="Revisao" value={String(resumo.emRevisao)} tone="indigo" />
        </div>
      </section>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-950">Valores</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
            {formatCurrency(resumo.total)}
          </span>
        </div>

        <div className="space-y-2">
          <BarraResumo
            label="Recebido"
            value={formatCurrency(resumo.recebido)}
            percent={recebidoPercent}
            color="#059669"
          />
          <BarraResumo
            label="A receber"
            value={formatCurrency(resumo.aReceber)}
            percent={receberPercent}
            color="#f97316"
          />
        </div>
      </section>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h3 className="mb-2 text-sm font-bold text-slate-950">Servicos</h3>
        <div className="space-y-2">
          <BarraResumo
            label="Executados"
            value={`${resumo.executados} OS`}
            percent={executadosPercent}
            color="#2563eb"
          />
          <BarraResumo
            label="Em aberto"
            value={`${resumo.abertas} OS`}
            percent={abertasPercent}
            color="#f59e0b"
          />
        </div>
      </section>
    </>
  )
}

function DocumentoPagamentoPanel({
  tecnicoId,
  documentos,
  tabelaPendente,
  ordensFinalizadas,
  osSelecionadaId,
  onOsSelecionada,
  onUploaded,
}: {
  tecnicoId: string
  documentos: DocumentoTecnico[]
  tabelaPendente: boolean
  ordensFinalizadas: OSItem[]
  osSelecionadaId: string
  onOsSelecionada: (id: string) => void
  onUploaded: () => Promise<void>
}) {
  const [tipo, setTipo] = useState('RECIBO')
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  async function enviarDocumento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setMensagem('')

    if (!arquivo) {
      setErro('Selecione a NF ou recibo para enviar.')
      return
    }

    setEnviando(true)

    try {
      const formData = new FormData()
      formData.append('tipo', tipo)
      formData.append('valor', valor || '0')
      formData.append('observacao', observacao)
      formData.append('arquivo', arquivo)
      if (osSelecionadaId) formData.append('osId', osSelecionadaId)
      if (tecnicoId) formData.append('tecnicoId', tecnicoId)

      const response = await fetch('/api/tecnico/documentos', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel enviar o documento.')

      setMensagem('Documento enviado para conferencia financeira.')
      setValor('')
      setObservacao('')
      setArquivo(null)
      onOsSelecionada('')
      await onUploaded()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao enviar documento.')
    } finally {
      setEnviando(false)
    }
  }

  function handleArquivo(event: ChangeEvent<HTMLInputElement>) {
    setArquivo(event.target.files?.[0] ?? null)
  }

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm">
      <h3 className="text-sm font-bold text-slate-950">NF ou recibo</h3>
      <p className="text-xs text-slate-500">Envie o documento para o Chame o Tecnico executar o pagamento.</p>

      {tabelaPendente && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          Estrutura pendente no banco. Aplique o SQL atualizado para liberar os envios.
        </div>
      )}

      {erro && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{erro}</div>}
      {mensagem && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{mensagem}</div>}

      <form onSubmit={enviarDocumento} className="mt-3 space-y-2">
        <label className="block text-xs font-bold text-slate-600">
          OS vinculada
          <select
            value={osSelecionadaId}
            onChange={(event) => onOsSelecionada(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          >
            <option value="">Documento geral</option>
            {ordensFinalizadas.map((os) => (
              <option key={os.id} value={os.id}>
                {os.numero_os ?? `OS #${os.id}`} - {os.clientes?.nome ?? 'Cliente'}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-slate-600">
            Tipo
            <select
              value={tipo}
              onChange={(event) => setTipo(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
            >
              <option value="RECIBO">Recibo</option>
              <option value="NF">Nota fiscal</option>
            </select>
          </label>

          <label className="text-xs font-bold text-slate-600">
            Valor
            <input
              value={valor}
              onChange={(event) => setValor(event.target.value)}
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
              placeholder="0,00"
            />
          </label>
        </div>

        <input
          type="file"
          accept="image/*,.pdf"
          onChange={handleArquivo}
          className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600"
        />

        {arquivo && <p className="text-xs font-semibold text-slate-600">{arquivo.name}</p>}

        <textarea
          value={observacao}
          onChange={(event) => setObservacao(event.target.value)}
          rows={1}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          placeholder="Observacao opcional..."
        />

        <button
          type="submit"
          disabled={enviando || tabelaPendente}
          className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? 'Enviando...' : 'Enviar para pagamento'}
        </button>
      </form>

      <div className="mt-3 space-y-2">
        <p className="text-xs font-bold uppercase text-slate-500">Ultimos envios</p>
        {documentos.length ? (
          documentos.slice(0, 3).map((doc) => (
            <a
              key={doc.id}
              href={doc.url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800">{doc.tipo ?? 'RECIBO'}</span>
                <span className="font-black text-slate-700">{formatCurrency(Number(doc.valor ?? 0))}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-slate-500">
                <span className="truncate">{doc.nome_arquivo ?? 'Documento'}</span>
                <span>{doc.status ?? 'PENDENTE'}</span>
              </div>
            </a>
          ))
        ) : (
          <p className="text-xs text-slate-500">Nenhum documento enviado ainda.</p>
        )}
      </div>
    </section>
  )
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'emerald' | 'amber' | 'indigo'
}) {
  const cls =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-indigo-50 text-indigo-700'

  return (
    <div className={`rounded-lg px-3 py-2 text-center ${cls}`}>
      <p className="text-lg font-black leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase">{label}</p>
    </div>
  )
}

function BarraResumo({
  label,
  value,
  percent,
  color,
}: {
  label: string
  value: string
  percent: number
  color: string
}) {
  const largura = Math.max(0, Math.min(percent, 100))

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        <span className="text-sm font-black text-slate-700">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${largura}%`, backgroundColor: color }} />
      </div>
      <p className="mt-0.5 text-right text-xs font-black text-slate-500">{largura}%</p>
    </div>
  )
}

function getStatusAlerta(status?: string | null) {
  switch (status) {
    case 'EM_ATENDIMENTO':
      return {
        label: 'Em atendimento: executar diagnóstico e atualizar a OS.',
        cardStyle: statusStyle('#a7f3d0', '#ecfdf5'),
        bannerStyle: alertStyle('#059669', '#ffffff'),
        badgeStyle: alertStyle('#059669', '#ffffff'),
      }
    case 'AGUARDANDO_APROVACAO':
      return {
        label: 'Aguardando aprovação: orçamento enviado ao cliente.',
        cardStyle: statusStyle('#67e8f9', '#ecfeff'),
        bannerStyle: alertStyle('#0891b2', '#ffffff'),
        badgeStyle: alertStyle('#0891b2', '#ffffff'),
      }
    case 'AGUARDANDO_REVISAO':
      return {
        label: 'Aguardando revisao administrativa: equipe vai conferir antes de enviar ao cliente.',
        cardStyle: statusStyle('#818cf8', '#eef2ff'),
        bannerStyle: alertStyle('#4f46e5', '#ffffff'),
        badgeStyle: alertStyle('#4f46e5', '#ffffff'),
      }
    case 'AGUARDANDO_PECA':
      return {
        label: 'Aguardando peça: acompanhar compra ou chegada.',
        cardStyle: statusStyle('#c4b5fd', '#f5f3ff'),
        bannerStyle: alertStyle('#7c3aed', '#ffffff'),
        badgeStyle: alertStyle('#7c3aed', '#ffffff'),
      }
    case 'PRONTO_AGUARDANDO_ENTREGA':
      return {
        label: 'Pronto: aguardando entrega ou retirada pelo cliente.',
        cardStyle: statusStyle('#34d399', '#ecfdf5'),
        bannerStyle: alertStyle('#059669', '#ffffff'),
        badgeStyle: alertStyle('#059669', '#ffffff'),
      }
    case 'CRITICA':
      return {
        label: 'Crítica: atendimento precisa de prioridade.',
        cardStyle: statusStyle('#f87171', '#fef2f2'),
        bannerStyle: alertStyle('#dc2626', '#ffffff'),
        badgeStyle: alertStyle('#dc2626', '#ffffff'),
      }
    default:
      return {
        label: 'Status em triagem: confira as informações da OS.',
        cardStyle: statusStyle('#fcd34d', '#fffbeb'),
        bannerStyle: alertStyle('#f59e0b', '#0f172a'),
        badgeStyle: alertStyle('#f59e0b', '#0f172a'),
      }
  }
}

function statusStyle(borderColor: string, backgroundColor: string): CSSProperties {
  return { borderColor, backgroundColor }
}

function alertStyle(backgroundColor: string, color: string): CSSProperties {
  return { backgroundColor, color }
}

function getTecnicoId() {
  if (typeof window === 'undefined') return ''
  return String(new URLSearchParams(window.location.search).get('tecnico') ?? '').trim()
}

function resumoInicial(): ResumoTecnico {
  return {
    executados: 0,
    abertas: 0,
    emRevisao: 0,
    recebido: 0,
    aReceber: 0,
    total: 0,
  }
}

function getNomeTecnico(os?: OSItem) {
  const tecnico = os?.parceiros
  return tecnico?.responsavel ?? tecnico?.nome_fantasia ?? tecnico?.razao_social ?? ''
}

function formatarEquipamento(os: OSItem) {
  return [os.categorias?.nome, os.marcas?.nome, os.modelo].filter(Boolean).join(' / ') || '-'
}

function formatarEndereco(os: OSItem) {
  const c = os.clientes
  const linha1 = [c?.logradouro, c?.numero].filter(Boolean).join(', ')
  const linha2 = [c?.bairro, c?.cidade, c?.estado].filter(Boolean).join(' / ')
  return [linha1, linha2, c?.cep].filter(Boolean).join(' - ') || '-'
}

function valorTotalTecnico(os: OSItem) {
  return Number(os.tecnico_total ?? 0) || Number(os.total ?? 0)
}

function tecnicoPago(os: OSItem) {
  if (typeof os.tecnico_status_pagamento === 'string') return os.tecnico_status_pagamento === 'RECEBIDO'
  return os.status_financeiro === 'RECEBIDO'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function getAgendaStorageKey(tecnicoId: string) {
  return `ct-premium:agenda-tecnico:${tecnicoId || 'sessao'}`
}

function carregarAgendaLocal(tecnicoId: string) {
  if (typeof window === 'undefined') return {}
  const salvo = window.localStorage.getItem(getAgendaStorageKey(tecnicoId))
  if (!salvo) return {}

  try {
    return JSON.parse(salvo) as Record<string, string>
  } catch {
    return {}
  }
}

function defaultAgendaDateTime(createdAt: string) {
  const base = new Date(createdAt)
  const data = Number.isNaN(base.getTime()) ? new Date() : base
  const agora = new Date()
  const agenda = data > agora ? data : agora
  agenda.setMinutes(Math.ceil(agenda.getMinutes() / 30) * 30, 0, 0)
  agenda.setHours(agenda.getHours() + 1)
  return toDateTimeLocalValue(agenda)
}

function toDateTimeLocalValue(date: Date) {
  const ano = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  const hora = String(date.getHours()).padStart(2, '0')
  const minuto = String(date.getMinutes()).padStart(2, '0')
  return `${ano}-${mes}-${dia}T${hora}:${minuto}`
}

function criarGoogleCalendarUrl(os: OSItem, dataHora: string) {
  const inicio = new Date(dataHora)
  const inicioSeguro = Number.isNaN(inicio.getTime()) ? new Date() : inicio
  const fim = new Date(inicioSeguro.getTime() + 90 * 60 * 1000)
  const titulo = `${os.numero_os ?? `OS #${os.id}`} - ${os.clientes?.nome ?? 'Cliente'}`
  const detalhes = [
    `Cliente: ${os.clientes?.nome ?? '-'}`,
    os.clientes?.whatsapp ? `WhatsApp: ${os.clientes.whatsapp}` : '',
    `Equipamento: ${formatarEquipamento(os)}`,
    `Defeito: ${os.defeito ?? '-'}`,
    `Status: ${os.status ?? '-'}`,
  ].filter(Boolean).join('\n')

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo,
    dates: `${formatGoogleCalendarDate(inicioSeguro)}/${formatGoogleCalendarDate(fim)}`,
    details: detalhes,
    location: formatarEndereco(os),
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function formatGoogleCalendarDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}
