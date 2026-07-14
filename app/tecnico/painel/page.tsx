'use client'
/* eslint-disable @next/next/no-img-element */

import Image from 'next/image'
import Link from 'next/link'
import QRCode from 'qrcode'
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
  tecnico_agendado_para?: string | null
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
      const ordensData = (data?.data ?? []) as OSItem[]
      setOrdens(ordensData)
      setAgendaDatas((atual) => {
        const proximos = { ...atual }
        for (const os of ordensData) {
          if (os.tecnico_agendado_para) proximos[String(os.id)] = toDateTimeLocalValue(new Date(os.tecnico_agendado_para))
        }
        return proximos
      })
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
        dataHora: getAgendaDateTime(os, agendaDatas) || defaultAgendaDateTime(os.created_at),
        agendado: Boolean(getAgendaDateTime(os, agendaDatas)),
      }))
      .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime()),
    [agendaDatas, ordensAbertas]
  )

  async function sair() {
    await fetch('/api/tecnico/login', { method: 'DELETE' }).catch(() => null)
    window.location.href = '/tecnico/login'
  }

  async function atualizarAgenda(osId: number, dataHora: string) {
    setAgendaDatas((atual) => ({ ...atual, [String(osId)]: dataHora }))
    await salvarAgendaSistema(osId, dataHora).catch((error) => {
      setErro(error instanceof Error ? error.message : 'Nao foi possivel salvar o agendamento no sistema.')
    })
  }

  async function salvarAgendaSistema(osId: number, dataHora: string) {
    const response = await fetch('/api/tecnico/os', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'AGENDAMENTO',
        osId,
        tecnicoId: tecnicoId ? Number(tecnicoId) : undefined,
        dataHora,
      }),
    })

    if (response.ok) return

    const data = await response.json().catch(() => null)
    const mensagem = String(data?.error ?? '')
    if (mensagem.includes('SQL de agendamento')) return
    throw new Error(mensagem || 'Nao foi possivel salvar o agendamento no sistema.')
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
              {!tecnicoId && (
                <Link
                  href="/tecnico/academia"
                  className="inline-flex h-10 items-center rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white"
                >
                  Academia Técnica
                </Link>
              )}
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

        {!tecnicoId && <CrachaDigital />}

        <div className="grid gap-3 xl:grid-cols-3 xl:gap-4">
          <section className="rounded-xl bg-white p-3 shadow-sm sm:p-4 xl:col-span-2">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Minhas OS</h2>
                <p className="text-xs text-slate-500">Separe o que esta em tratamento dos servicos ja concluidos.</p>
              </div>

              <div className="inline-flex w-full rounded-lg bg-slate-100 p-1 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setAbaAtiva('tratamento')}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-black transition sm:flex-none sm:px-3 sm:text-xs ${
                    abaAtiva === 'tratamento' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Em tratamento ({ordensAbertas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAbaAtiva('finalizadas')}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-black transition sm:flex-none sm:px-3 sm:text-xs ${
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
              <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
                {ordensAbertas.map((os) => {
                  const alerta = getStatusAlerta(os.status)
                  const agendaDataHora = getAgendaDateTime(os, agendaDatas)
                  const agendado = Boolean(agendaDataHora)
                  const valorAgenda = agendaDataHora || defaultAgendaDateTime(os.created_at)

                  return (
                    <article
                      key={os.id}
                      className={`relative overflow-hidden rounded-xl border bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-3 ${agendado ? 'border-slate-200' : 'border-amber-200'}`}
                    >
                      <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5" style={{ backgroundColor: alerta.accentColor }} />
                      <div className="mb-1.5 flex items-start justify-between gap-2 sm:mb-2">
                        <div className="min-w-0 pl-2">
                          <p className="text-[10px] font-black leading-tight text-orange-600 sm:text-xs">{os.numero_os ?? `OS #${os.id}`}</p>
                          <h3 className="truncate text-sm font-black leading-tight text-slate-950 sm:text-base">{os.clientes?.nome ?? 'Cliente'}</h3>
                          <p className="text-[10px] leading-tight text-slate-500 sm:text-[11px]">{new Date(os.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <StatusBadge status={os.status ?? 'NOVA'} compact />
                      </div>

                      <div className={`mb-1.5 rounded-md border px-2 py-1 text-[11px] font-bold leading-tight sm:mb-2 sm:rounded-lg sm:py-1.5 sm:text-xs ${agendado ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
                        {agendado ? `Agendado para ${formatAgendaLabel(agendaDataHora)}` : 'Agendamento pendente: marque data e hora para liberar o atendimento.'}
                      </div>

                      <div className="mb-1.5 line-clamp-2 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-semibold leading-tight text-slate-600 sm:mb-2 sm:rounded-lg sm:py-1.5 sm:text-xs">
                        {alerta.label}
                      </div>

                      {os.prioridade === 'URGENTE' && (
                        <div className="mb-1.5 animate-pulse rounded-md bg-red-600 px-2 py-1 text-[11px] font-bold text-white sm:mb-2 sm:py-1.5 sm:text-xs">
                          Prioridade urgente
                        </div>
                      )}

                      <div className="space-y-1 text-xs sm:space-y-1.5">
                        <Info label="Equipamento" value={formatarEquipamento(os)} compact />
                        <Info label="Endereco" value={formatarEndereco(os)} compact />
                      </div>

                      <div className="mt-2 grid gap-1.5 sm:mt-3 sm:gap-2">
                        {!agendado && (
                          <input
                            type="datetime-local"
                            value={valorAgenda}
                            onChange={(event) => void atualizarAgenda(os.id, event.target.value)}
                            className="h-9 w-full rounded-lg border border-amber-200 bg-amber-50 px-2 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 sm:h-10"
                          />
                        )}

                        {agendado ? (
                          <Link
                            href={tecnicoId ? `/tecnico/os/${os.id}?tecnico=${encodeURIComponent(tecnicoId)}` : `/tecnico/os/${os.id}`}
                            className="block rounded-lg bg-slate-900 px-3 py-1.5 text-center text-xs font-bold text-white transition hover:bg-slate-800 sm:py-2"
                          >
                            Tratar OS
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void atualizarAgenda(os.id, valorAgenda)}
                            className="rounded-lg bg-orange-500 px-3 py-1.5 text-center text-xs font-bold text-white transition hover:bg-orange-600 sm:py-2"
                          >
                            Salvar agendamento
                          </button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : abaAtiva === 'tratamento' ? (
              <p className="text-sm text-slate-500">Nenhuma OS aberta atribuida para este tecnico.</p>
            ) : ordensFinalizadas.length ? (
              <>
                <div className="mb-2 flex justify-end sm:mb-3">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 sm:text-xs">
                    {ordensAReceber.length} a receber
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {ordensFinalizadas.map((os) => (
                    <article key={os.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-3">
                      <div className="absolute inset-y-0 left-0 w-1 bg-emerald-600 sm:w-1.5" />
                      <div className="mb-1.5 flex items-start justify-between gap-2 sm:mb-2">
                        <div className="min-w-0 pl-2">
                          <p className="text-[10px] font-black leading-tight text-emerald-700 sm:text-xs">{os.numero_os ?? `OS #${os.id}`}</p>
                          <h3 className="truncate text-sm font-black leading-tight text-slate-950 sm:text-base">{os.clientes?.nome ?? 'Cliente'}</h3>
                          <p className="line-clamp-1 text-[10px] leading-tight text-slate-500 sm:text-[11px]">{formatarEquipamento(os)}</p>
                        </div>
                        <span className="shrink-0 rounded-md bg-emerald-600 px-1.5 py-1 text-[9px] font-bold text-white sm:px-2 sm:text-[10px]">
                          {tecnicoPago(os) ? 'PAGO' : 'A RECEBER'}
                        </span>
                      </div>

                      <div className="mb-2 rounded-md bg-emerald-50 px-2 py-1.5 sm:mb-3 sm:px-3 sm:py-2">
                        <p className="text-[9px] font-bold uppercase leading-tight text-emerald-700 sm:text-[10px]">Valor do tecnico</p>
                        <p className="text-base font-black leading-tight text-slate-950 sm:text-lg">{formatCurrency(valorTotalTecnico(os))}</p>
                      </div>

                      <Link
                        href={tecnicoId ? `/tecnico/os/${os.id}?tecnico=${encodeURIComponent(tecnicoId)}` : `/tecnico/os/${os.id}`}
                        className="block rounded-lg bg-slate-900 px-3 py-1.5 text-center text-xs font-bold text-white transition hover:bg-slate-800 sm:py-2"
                      >
                        Ver OS finalizada
                      </Link>
                      <button
                        type="button"
                        onClick={() => setOsDocumentoId(String(os.id))}
                        className="mt-1.5 block w-full rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-center text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 sm:mt-2 sm:py-2"
                      >
                        Enviar NF/recibo
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma OS finalizada ainda.</p>
            )}
          </section>

          <aside className="space-y-3 xl:space-y-4">
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

type Cracha = { id: number; responsavel?: string | null; nome_fantasia?: string | null; tipo_vinculo?: string | null; especialidades?: string[] | null; cidade?: string | null; estado?: string | null; foto_cracha_url?: string | null; cracha_codigo?: string | null; cracha_status?: string | null; cracha_validade?: string | null }

function CrachaDigital() {
  const [cracha, setCracha] = useState<Cracha | null>(null)
  const [qr, setQr] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    const response = await fetch('/api/tecnico/cracha')
    const payload = await response.json().catch(() => null)
    if (response.ok) setCracha(payload?.data ?? null)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])
  useEffect(() => {
    if (!cracha?.cracha_codigo) return
    void QRCode.toDataURL(`${window.location.origin}/cracha/${cracha.cracha_codigo}`, { width: 180, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } }).then(setQr)
  }, [cracha?.cracha_codigo])

  async function enviarFoto(event: ChangeEvent<HTMLInputElement>) {
    const foto = event.target.files?.[0]
    if (!foto) return
    setEnviando(true); setMensagem('')
    try {
      const form = new FormData(); form.append('foto', foto)
      const response = await fetch('/api/tecnico/cracha', { method: 'POST', body: form })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Não foi possível enviar a foto.')
      setMensagem('Foto enviada para aprovação administrativa.'); await carregar()
    } catch (error) { setMensagem(error instanceof Error ? error.message : 'Erro ao enviar foto.') }
    finally { setEnviando(false); event.target.value = '' }
  }

  if (!cracha) return null
  const aprovado = cracha.cracha_status === 'APROVADO'
  const nome = cracha.responsavel || cracha.nome_fantasia || 'Técnico'
  return <section className="rounded-xl bg-white p-4 shadow-sm"><div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-black text-slate-950">Meu crachá digital</h2><p className="text-xs font-semibold text-slate-500">Foto profissional sujeita à aprovação administrativa.</p></div><label className="cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-bold text-white">{enviando ? 'Enviando...' : cracha.foto_cracha_url ? 'Trocar foto' : 'Enviar foto'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={enviando} onChange={enviarFoto} className="hidden" /></label></div>{mensagem && <p className="mb-3 rounded-lg bg-slate-50 p-2 text-xs font-semibold text-slate-700">{mensagem}</p>}<div className="mx-auto grid max-w-[620px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md sm:grid-cols-[180px_1fr]"><div className="flex min-h-[210px] items-center justify-center bg-slate-950 p-4">{cracha.foto_cracha_url ? <img src={cracha.foto_cracha_url} alt={`Foto de ${nome}`} className="h-40 w-32 rounded-lg border-4 border-white object-cover" /> : <div className="flex h-40 w-32 items-center justify-center rounded-lg border-2 border-dashed border-slate-500 text-center text-xs font-bold text-slate-300">Foto pendente</div>}</div><div className="relative p-4"><Image src="/logo-ct.png" alt="Chame o Técnico" width={100} height={44} className="h-auto w-[90px]" /><span className={`absolute right-4 top-4 rounded-full px-2 py-1 text-[9px] font-black ${aprovado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{aprovado ? 'ATIVO' : cracha.cracha_status === 'REPROVADO' ? 'REPROVADO' : 'AGUARDANDO APROVAÇÃO'}</span><p className="mt-4 text-xl font-black text-slate-950">{nome}</p><p className="text-xs font-bold uppercase tracking-wide text-orange-600">{cracha.tipo_vinculo === 'PROPRIO' ? 'Técnico próprio' : 'Técnico credenciado'}</p><p className="mt-2 text-xs text-slate-600">{(cracha.especialidades ?? []).join(' • ') || 'Assistência técnica'}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{[cracha.cidade, cracha.estado].filter(Boolean).join(' / ')}</p><div className="mt-3 flex items-end justify-between gap-3"><div className="text-[9px] font-bold text-slate-500"><p>ID #{String(cracha.id).padStart(5, '0')}</p><p>Validade: {cracha.cracha_validade ? new Date(`${cracha.cracha_validade}T12:00:00`).toLocaleDateString('pt-BR') : 'A definir'}</p></div>{qr && aprovado && <img src={qr} alt="QR Code de validação" className="h-20 w-20" />}</div></div></div></section>
}

function AgendaTecnicoPanel({
  itens,
  onDataHoraChange,
}: {
  itens: Array<{ os: OSItem; dataHora: string; agendado: boolean }>
  onDataHoraChange: (osId: number, dataHora: string) => void | Promise<void>
}) {
  return (
    <section className="rounded-xl bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
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
          {itens.slice(0, 5).map(({ os, dataHora, agendado }) => {
            const alerta = getStatusAlerta(os.status)

            return (
            <article key={os.id} className={`relative overflow-hidden rounded-xl border bg-white p-2 shadow-sm sm:p-2.5 ${agendado ? 'border-slate-200' : 'border-amber-200'}`}>
              <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: alerta.accentColor }} />
              <div className="mb-1.5 flex items-start justify-between gap-2 sm:mb-2">
                <div className="min-w-0 pl-2">
                  <p className="text-[11px] font-black text-orange-600">{os.numero_os ?? `OS #${os.id}`}</p>
                  <h3 className="truncate text-xs font-bold text-slate-950 sm:text-sm">{os.clientes?.nome ?? 'Cliente'}</h3>
                  <p className={`mt-0.5 text-[10px] font-black uppercase ${agendado ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {agendado ? 'Agendado' : 'Pendente de agenda'}
                  </p>
                </div>
                <StatusBadge status={os.status ?? 'NOVA'} compact />
              </div>

              <input
                type="datetime-local"
                value={dataHora}
                onChange={(event) => void onDataHoraChange(os.id, event.target.value)}
                className="mb-1.5 h-8 w-full rounded-lg border border-slate-300 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-orange-500 sm:mb-2 sm:h-9"
              />

              <p className="mb-1.5 line-clamp-1 text-[11px] text-slate-600 sm:mb-2 sm:line-clamp-2 sm:text-xs">{formatarEndereco(os)}</p>

              <a
                href={criarGoogleCalendarUrl(os, dataHora)}
                target="_blank"
                rel="noreferrer"
                onClick={() => void onDataHoraChange(os.id, dataHora)}
                className={`block rounded-lg px-3 py-1.5 text-center text-xs font-bold text-white transition sm:py-2 ${agendado ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'}`}
              >
                {agendado ? 'Sincronizar Google' : 'Salvar e sincronizar'}
              </a>
            </article>
          )})}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Nenhuma OS aberta para agendar.</p>
      )}
    </section>
  )
}

function Info({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-md bg-white ${compact ? 'px-2 py-1 sm:py-1.5' : 'px-3 py-2'}`}>
      <p className="text-[9px] font-semibold uppercase leading-tight text-slate-500 sm:text-[10px]">{label}</p>
      <p className={`font-semibold leading-tight text-slate-900 ${compact ? 'line-clamp-1 text-[11px] sm:text-xs' : ''}`}>{value}</p>
    </div>
  )
}

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const alerta = getStatusAlerta(status)

  return <span className={`shrink-0 rounded-md font-bold ${compact ? 'max-w-[120px] truncate px-1.5 py-1 text-[9px] sm:max-w-none sm:px-2 sm:text-[10px]' : 'px-3 py-1 text-xs'}`} style={alerta.badgeStyle}>{status}</span>
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
      <section className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-950">Resumo do tecnico</h2>
          <p className="text-xs text-slate-500">Servicos, recebidos e valores em aberto</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniMetric label="Executados" value={String(resumo.executados)} tone="emerald" />
          <MiniMetric label="Abertas" value={String(resumo.abertas)} tone="amber" />
          <MiniMetric label="Revisao" value={String(resumo.emRevisao)} tone="indigo" />
        </div>
      </section>

      <section className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-950">Valores</h3>
          <p className="text-xs text-slate-500">Total, recebido e saldo a receber</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FinanceMetric label="Total" value={formatCurrency(resumo.total)} tone="slate" destaque />
          <FinanceMetric label="Recebido" value={formatCurrency(resumo.recebido)} tone="emerald" destaque />
          <FinanceMetric label="A receber" value={formatCurrency(resumo.aReceber)} tone="amber" />
        </div>

        <div className="mt-3 space-y-2">
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

      <section className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
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
    <div className={`min-w-0 rounded-lg px-3 py-2.5 text-center ${cls}`}>
      <p className="break-words text-xl font-black leading-none sm:text-2xl">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase leading-tight sm:text-xs">{label}</p>
    </div>
  )
}

function FinanceMetric({
  label,
  value,
  tone,
  destaque = false,
}: {
  label: string
  value: string
  tone: 'emerald' | 'amber' | 'slate'
  destaque?: boolean
}) {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-slate-50 text-slate-900'

  return (
    <div className={`min-w-0 rounded-lg border px-3 py-2.5 ${destaque ? 'sm:py-3' : ''} ${cls}`}>
      <p className="text-[10px] font-black uppercase leading-tight opacity-75 sm:text-xs">{label}</p>
      <p className={`${destaque ? 'text-lg sm:text-2xl' : 'text-base sm:text-xl'} mt-1 break-words font-black leading-tight`}>
        {value}
      </p>
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
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        <span className="break-words text-right text-xs font-black text-slate-700 sm:text-sm">{value}</span>
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
        accentColor: '#059669',
        cardStyle: statusStyle('#a7f3d0', '#ecfdf5'),
        bannerStyle: alertStyle('#059669', '#ffffff'),
        badgeStyle: alertStyle('#059669', '#ffffff'),
      }
    case 'AGUARDANDO_APROVACAO':
      return {
        label: 'Aguardando aprovação: orçamento enviado ao cliente.',
        accentColor: '#0891b2',
        cardStyle: statusStyle('#67e8f9', '#ecfeff'),
        bannerStyle: alertStyle('#0891b2', '#ffffff'),
        badgeStyle: alertStyle('#0891b2', '#ffffff'),
      }
    case 'AGUARDANDO_REVISAO':
      return {
        label: 'Aguardando revisao administrativa: equipe vai conferir antes de enviar ao cliente.',
        accentColor: '#4f46e5',
        cardStyle: statusStyle('#818cf8', '#eef2ff'),
        bannerStyle: alertStyle('#4f46e5', '#ffffff'),
        badgeStyle: alertStyle('#4f46e5', '#ffffff'),
      }
    case 'AGUARDANDO_PECA':
      return {
        label: 'Aguardando peça: acompanhar compra ou chegada.',
        accentColor: '#7c3aed',
        cardStyle: statusStyle('#c4b5fd', '#f5f3ff'),
        bannerStyle: alertStyle('#7c3aed', '#ffffff'),
        badgeStyle: alertStyle('#7c3aed', '#ffffff'),
      }
    case 'PRONTO_AGUARDANDO_ENTREGA':
      return {
        label: 'Pronto: aguardando entrega ou retirada pelo cliente.',
        accentColor: '#059669',
        cardStyle: statusStyle('#34d399', '#ecfdf5'),
        bannerStyle: alertStyle('#059669', '#ffffff'),
        badgeStyle: alertStyle('#059669', '#ffffff'),
      }
    case 'CRITICA':
      return {
        label: 'Crítica: atendimento precisa de prioridade.',
        accentColor: '#dc2626',
        cardStyle: statusStyle('#f87171', '#fef2f2'),
        bannerStyle: alertStyle('#dc2626', '#ffffff'),
        badgeStyle: alertStyle('#dc2626', '#ffffff'),
      }
    default:
      return {
        label: 'Status em triagem: confira as informações da OS.',
        accentColor: '#f59e0b',
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

function getAgendaDateTime(os: OSItem, agendaDatas: Record<string, string>) {
  const local = agendaDatas[String(os.id)]
  if (local) return local
  if (!os.tecnico_agendado_para) return ''
  return toDateTimeLocalValue(new Date(os.tecnico_agendado_para))
}

function formatAgendaLabel(value: string) {
  const data = new Date(value)
  if (!Number.isFinite(data.getTime())) return 'data invalida'
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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
