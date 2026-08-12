'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Conversa = { id: number; tipo: 'GERAL' | 'UNIDADE' | 'DIRETA'; titulo: string; naoLidas: number; atualizado_em: string; arquivada?: boolean; ultimaMensagem?: Mensagem | null }
type FiltroConversa = 'ATIVAS' | 'NAO_LIDAS' | 'ARQUIVADAS'
type Usuario = { id: number; nome: string; email: string }
type Ordem = { id: number; numero_os: string; clientes?: { nome?: string | null } | Array<{ nome?: string | null }> | null }
type Mensagem = {
  id: number
  conversa_id: number
  autor_id: number
  conteudo: string
  os_id?: number | null
  criado_em: string
  autor?: Usuario | Usuario[] | null
  ordens_servico?: { id: number; numero_os: string } | Array<{ id: number; numero_os: string }> | null
}

export default function ChatInternoPage() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [usuarioAtualId, setUsuarioAtualId] = useState(0)
  const [conversaId, setConversaId] = useState<number | null>(null)
  const [conteudo, setConteudo] = useState('')
  const [osId, setOsId] = useState('')
  const [destinatarioId, setDestinatarioId] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroConversa>('ATIVAS')
  const [temMais, setTemMais] = useState(false)
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false)
  const [arquivamentoDisponivel, setArquivamentoDisponivel] = useState(false)
  const [estruturaPendente, setEstruturaPendente] = useState(false)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)
  const mensagensRef = useRef<HTMLDivElement>(null)
  const preservarScrollRef = useRef<{ altura: number; topo: number } | null>(null)

  useEffect(() => {
    const conversaInicial = Number(new URLSearchParams(window.location.search).get('conversaId'))
    if (conversaInicial) void Promise.resolve().then(() => setConversaId(conversaInicial))
  }, [])

  const carregar = useCallback(async (selecionada: number | null, silencioso = false, antes = '') => {
    if (!silencioso) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selecionada) params.set('conversaId', String(selecionada))
      if (antes) params.set('antes', antes)
      const query = params.size ? `?${params}` : ''
      const response = await adminFetch(`/api/admin/chat${query}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar chat.')
      const lista = (payload?.conversas ?? []) as Conversa[]
      setConversas(lista)
      const recebidas = (payload?.mensagens ?? []) as Mensagem[]
      setMensagens((atuais) => {
        if (antes) return unirMensagens(recebidas, atuais)
        if (silencioso && selecionada) return unirMensagens(atuais, recebidas)
        return recebidas
      })
      setUsuarios(payload?.usuarios ?? [])
      setOrdens(payload?.ordens ?? [])
      setUsuarioAtualId(Number(payload?.usuarioAtual?.id ?? 0))
      setEstruturaPendente(Boolean(payload?.estruturaPendente))
      if (!silencioso || antes) setTemMais(Boolean(payload?.temMais))
      setArquivamentoDisponivel(Boolean(payload?.arquivamentoDisponivel))
      setErro('')
      if (!selecionada && lista.length) setConversaId(lista[0].id)
      if (selecionada && recebidas.length && !antes) {
        const ultima = recebidas[recebidas.length - 1]
        void adminFetch('/api/admin/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'MARCAR_LIDA', conversaId: selecionada, ultimaMensagemId: ultima.id }) })
      }
    } catch (error) {
      if (!silencioso) setErro(error instanceof Error ? error.message : 'Erro ao carregar chat.')
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => carregar(conversaId))
  }, [carregar, conversaId])

  useEffect(() => {
    const timer = window.setInterval(() => void carregar(conversaId, true), 4000)
    return () => window.clearInterval(timer)
  }, [carregar, conversaId])

  useEffect(() => {
    const preservado = preservarScrollRef.current
    const container = mensagensRef.current
    if (preservado && container) {
      container.scrollTop = preservado.topo + (container.scrollHeight - preservado.altura)
      preservarScrollRef.current = null
      return
    }
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length, conversaId])

  const conversaAtual = conversas.find((item) => item.id === conversaId)
  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return conversas.filter((item) => {
      if (filtro === 'ATIVAS' && item.arquivada) return false
      if (filtro === 'NAO_LIDAS' && (item.arquivada || item.naoLidas === 0)) return false
      if (filtro === 'ARQUIVADAS' && !item.arquivada) return false
      return !termo || `${item.titulo} ${item.ultimaMensagem?.conteudo ?? ''}`.toLowerCase().includes(termo)
    })
  }, [busca, conversas, filtro])
  const canais = useMemo(() => conversasFiltradas.filter((item) => item.tipo !== 'DIRETA'), [conversasFiltradas])
  const diretas = useMemo(() => conversasFiltradas.filter((item) => item.tipo === 'DIRETA'), [conversasFiltradas])

  async function enviar(event: FormEvent) {
    event.preventDefault()
    if (!conversaId || !conteudo.trim()) return
    setEnviando(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'ENVIAR', conversaId, conteudo, osId: Number(osId) || null }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Nao foi possivel enviar a mensagem.')
      setConteudo('')
      setOsId('')
      await carregar(conversaId, true)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Nao foi possivel enviar a mensagem.')
    } finally {
      setEnviando(false)
    }
  }

  async function iniciarDireta() {
    if (!destinatarioId) return
    setEnviando(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'CRIAR_DIRETA', destinatarioId: Number(destinatarioId) }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Nao foi possivel iniciar a conversa.')
      setDestinatarioId('')
      setConversaId(Number(payload.conversaId))
      await carregar(Number(payload.conversaId), true)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Nao foi possivel iniciar a conversa.')
    } finally {
      setEnviando(false)
    }
  }

  async function carregarAnteriores() {
    if (!conversaId || !mensagens.length || carregandoAnteriores) return
    const container = mensagensRef.current
    if (container) preservarScrollRef.current = { altura: container.scrollHeight, topo: container.scrollTop }
    setCarregandoAnteriores(true)
    try {
      await carregar(conversaId, true, mensagens[0].criado_em)
    } finally {
      setCarregandoAnteriores(false)
    }
  }

  async function alternarArquivo() {
    if (!conversaAtual || conversaAtual.tipo !== 'DIRETA') return
    const arquivando = !conversaAtual.arquivada
    setEnviando(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: conversaAtual.arquivada ? 'REABRIR' : 'ARQUIVAR', conversaId: conversaAtual.id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Nao foi possivel atualizar a conversa.')
      await carregar(conversaId, true)
      setFiltro(arquivando ? 'ARQUIVADAS' : 'ATIVAS')
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Nao foi possivel atualizar a conversa.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div><p className="text-xs font-black uppercase text-orange-600">Comunicacao administrativa</p><h1 className="text-2xl font-black text-slate-950">Chat interno</h1><p className="text-sm text-slate-500">Canais da empresa, unidades e conversas diretas.</p></div>
        <Link href="/admin/dashboard" className="rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-bold text-white">Voltar ao Dashboard</Link>
      </header>

      {estruturaPendente && <div className="rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-800">Execute o arquivo supabase-add-chat-interno.sql no Supabase para liberar o chat.</div>}
      {erro && <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}

      <div className="grid min-h-[680px] overflow-hidden rounded-2xl bg-white shadow-sm lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 p-4">
            <p className="mb-2 text-xs font-black uppercase text-slate-500">Nova conversa direta</p>
            <div className="flex gap-2"><select value={destinatarioId} onChange={(event) => setDestinatarioId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Selecionar usuario</option>{usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nome}</option>)}</select><button type="button" disabled={!destinatarioId || enviando} onClick={iniciarDireta} className="rounded-lg bg-orange-600 px-3 text-sm font-black text-white disabled:opacity-50">Abrir</button></div>
          </div>
          <div className="space-y-2 border-b border-slate-200 p-3">
            <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar conversa..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500" />
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200 p-1">
              {([['ATIVAS', 'Ativas'], ['NAO_LIDAS', 'Não lidas'], ['ARQUIVADAS', 'Arquivadas']] as const).map(([valor, label]) => (
                <button key={valor} type="button" onClick={() => setFiltro(valor)} className={`rounded-md px-2 py-2 text-[11px] font-black ${filtro === valor ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>{label}</button>
              ))}
            </div>
          </div>
          <Lista titulo="Canais" itens={canais} selecionada={conversaId} escolher={setConversaId} />
          <Lista titulo="Conversas diretas" itens={diretas} selecionada={conversaId} escolher={setConversaId} vazio="Nenhuma conversa direta." />
        </aside>

        <section className="flex min-h-[600px] min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-black text-slate-950">{conversaAtual?.titulo ?? 'Selecione uma conversa'}</h2><p className="text-xs text-slate-500">30 mensagens recentes · histórico sob demanda</p></div>{arquivamentoDisponivel && conversaAtual?.tipo === 'DIRETA' && <button type="button" onClick={alternarArquivo} disabled={enviando} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-50">{conversaAtual.arquivada ? 'Reabrir conversa' : 'Arquivar'}</button>}</div>
          <div ref={mensagensRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-100/60 p-4 md:p-6">
            {conversaId && temMais && <div className="text-center"><button type="button" onClick={carregarAnteriores} disabled={carregandoAnteriores} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-600 shadow-sm disabled:opacity-50">{carregandoAnteriores ? 'Carregando...' : 'Carregar mensagens anteriores'}</button></div>}
            {loading && <p className="text-sm font-bold text-slate-500">Carregando mensagens...</p>}
            {!loading && conversaId && mensagens.length === 0 && <div className="mx-auto mt-20 max-w-sm rounded-xl bg-white p-5 text-center text-sm text-slate-500 shadow-sm">Ainda nao ha mensagens nesta conversa. Envie a primeira.</div>}
            {mensagens.map((mensagem) => <MensagemItem key={mensagem.id} mensagem={mensagem} propria={mensagem.autor_id === usuarioAtualId} />)}
            <div ref={fimRef} />
          </div>
          <form onSubmit={enviar} className="border-t border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center"><select value={osId} onChange={(event) => setOsId(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-md"><option value="">Sem OS vinculada</option>{ordens.map((ordem) => <option key={ordem.id} value={ordem.id}>{ordem.numero_os} - {nomeCliente(ordem.clientes)}</option>)}</select>{osId && <span className="text-xs font-bold text-orange-700">A OS sera anexada à mensagem.</span>}</div>
            <div className="flex items-end gap-2"><textarea value={conteudo} onChange={(event) => setConteudo(event.target.value)} maxLength={2000} rows={2} placeholder="Digite uma mensagem..." disabled={!conversaId || estruturaPendente} className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-orange-500" /><button type="submit" disabled={!conversaId || !conteudo.trim() || enviando || estruturaPendente} className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{enviando ? 'Enviando...' : 'Enviar'}</button></div>
            <p className="mt-1 text-right text-[11px] text-slate-400">{conteudo.length}/2.000</p>
          </form>
        </section>
      </div>
    </div>
  )
}

function Lista({ titulo, itens, selecionada, escolher, vazio }: { titulo: string; itens: Conversa[]; selecionada: number | null; escolher: (id: number) => void; vazio?: string }) {
  return <div className="p-3"><p className="px-2 py-2 text-xs font-black uppercase text-slate-500">{titulo}</p>{itens.length === 0 && vazio && <p className="px-2 py-3 text-xs text-slate-400">{vazio}</p>}<div className="space-y-1">{itens.map((item) => <button key={item.id} type="button" onClick={() => escolher(item.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${selecionada === item.id ? 'bg-slate-900 text-white' : 'hover:bg-white'}`}><div className="min-w-0"><p className="truncate font-black">{item.tipo === 'DIRETA' ? '● ' : '# '}{item.titulo}</p><p className={`truncate text-xs ${selecionada === item.id ? 'text-slate-300' : 'text-slate-400'}`}>{item.ultimaMensagem?.conteudo ?? 'Sem mensagens'}</p></div>{item.naoLidas > 0 && <span className="min-w-6 rounded-full bg-orange-600 px-2 py-1 text-center text-[11px] font-black text-white">{item.naoLidas > 99 ? '99+' : item.naoLidas}</span>}</button>)}</div></div>
}

function MensagemItem({ mensagem, propria }: { mensagem: Mensagem; propria: boolean }) {
  const autor = relacao(mensagem.autor)
  const ordem = relacao(mensagem.ordens_servico)
  return <div className={`flex ${propria ? 'justify-end' : 'justify-start'}`}><article className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm md:max-w-[72%] ${propria ? 'rounded-br-md bg-slate-900 text-white' : 'rounded-bl-md bg-white text-slate-900'}`}><div className="mb-1 flex items-center justify-between gap-5"><p className={`text-xs font-black ${propria ? 'text-orange-300' : 'text-orange-700'}`}>{propria ? 'Voce' : autor?.nome ?? autor?.email ?? 'Usuario'}</p><time className={`text-[10px] ${propria ? 'text-slate-400' : 'text-slate-400'}`}>{new Date(mensagem.criado_em).toLocaleString('pt-BR')}</time></div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{mensagem.conteudo}</p>{ordem && <Link href={`/admin/os/${ordem.id}`} className={`mt-3 block rounded-lg border px-3 py-2 text-xs font-black ${propria ? 'border-slate-600 bg-slate-800 text-orange-300' : 'border-orange-200 bg-orange-50 text-orange-700'}`}>Abrir OS {ordem.numero_os}</Link>}</article></div>
}

function relacao<T>(valor?: T | T[] | null) { return Array.isArray(valor) ? valor[0] : valor }
function nomeCliente(valor?: Ordem['clientes']) { return relacao(valor)?.nome ?? 'Cliente nao informado' }
function unirMensagens(...listas: Mensagem[][]) {
  const porId = new Map<number, Mensagem>()
  listas.flat().forEach((mensagem) => porId.set(mensagem.id, mensagem))
  return [...porId.values()].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
}
