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
  const [novaConversaAberta, setNovaConversaAberta] = useState(false)
  const [vincularOs, setVincularOs] = useState(false)
  const [mostrarLista, setMostrarLista] = useState(false)
  const mensagensRef = useRef<HTMLDivElement>(null)
  const campoMensagemRef = useRef<HTMLTextAreaElement>(null)
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
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
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
      setVincularOs(false)
      if (campoMensagemRef.current) campoMensagemRef.current.style.height = 'auto'
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
      setNovaConversaAberta(false)
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

  const ordemVinculada = ordens.find((ordem) => String(ordem.id) === osId)
  const listaVisivel = mostrarLista || !conversaId

  function abrirConversa(id: number) {
    setConversaId(id)
    setMostrarLista(false)
  }

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-7.5rem)] max-w-none flex-col lg:mx-auto lg:my-0 lg:h-[calc(100dvh-12.5rem)] lg:max-w-[1500px]">
      {estruturaPendente && <div className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">Execute o arquivo supabase-add-chat-interno.sql no Supabase para liberar o chat.</div>}
      {erro && <div className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{erro}</div>}

      <div className="grid min-h-0 flex-1 overflow-hidden bg-white lg:grid-cols-[280px_1fr] lg:rounded-2xl lg:border lg:border-slate-200">
        <aside className={`${listaVisivel ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col border-slate-200 lg:flex lg:flex-none lg:border-r`}>
          <div className="space-y-1.5 border-b border-slate-100 p-2">
            <div className="flex items-center gap-2">
              <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar" className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-orange-400" />
              <select value={filtro} onChange={(event) => setFiltro(event.target.value as FiltroConversa)} aria-label="Filtrar conversas" className="rounded-full border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 outline-none">
                <option value="ATIVAS">Ativas</option>
                <option value="NAO_LIDAS">Não lidas</option>
                <option value="ARQUIVADAS">Arquivadas</option>
              </select>
            </div>
            <button type="button" onClick={() => setNovaConversaAberta((aberta) => !aberta)} className="text-xs font-semibold text-orange-700">
              {novaConversaAberta ? 'Fechar' : 'Nova conversa'}
            </button>
            {novaConversaAberta && (
              <div className="flex gap-2">
                <select value={destinatarioId} onChange={(event) => setDestinatarioId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="">Escolher pessoa</option>
                  {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nome}</option>)}
                </select>
                <button type="button" disabled={!destinatarioId || enviando} onClick={iniciarDireta} className="rounded-xl bg-orange-500 px-3 text-sm font-semibold text-white disabled:opacity-40">Iniciar</button>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Lista titulo="Canais" itens={canais} selecionada={conversaId} escolher={abrirConversa} />
            <Lista titulo="Diretas" itens={diretas} selecionada={conversaId} escolher={abrirConversa} vazio="Nenhuma conversa direta." />
          </div>
        </aside>

        <section className={`${listaVisivel ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-1 flex-col lg:flex`}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" onClick={() => setMostrarLista(true)} className="rounded-full px-2 py-1 text-sm font-semibold text-slate-600 lg:hidden">Conversas</button>
              {conversaAtual && <Avatar nome={conversaAtual.titulo} />}
              <h2 className="truncate text-sm font-semibold text-slate-950">{conversaAtual?.titulo ?? 'Selecione uma conversa'}</h2>
            </div>
            {arquivamentoDisponivel && conversaAtual?.tipo === 'DIRETA' && (
              <button type="button" onClick={alternarArquivo} disabled={enviando} className="text-xs font-medium text-slate-500 disabled:opacity-40">
                {conversaAtual.arquivada ? 'Reabrir' : 'Arquivar'}
              </button>
            )}
          </div>
          <div ref={mensagensRef} className="flex-1 space-y-0.5 overflow-y-auto bg-[#f7f6f3] px-2.5 py-2 md:px-4">
            {conversaId && temMais && (
              <div className="pb-3 text-center">
                <button type="button" onClick={carregarAnteriores} disabled={carregandoAnteriores} className="text-xs font-medium text-slate-500 disabled:opacity-40">
                  {carregandoAnteriores ? 'Carregando...' : 'Mensagens anteriores'}
                </button>
              </div>
            )}
            {loading && <p className="text-sm text-slate-500">Carregando mensagens...</p>}
            {!loading && conversaId && mensagens.length === 0 && <p className="pt-16 text-center text-sm text-slate-500">Ainda não há mensagens nesta conversa.</p>}
            {mensagens.map((mensagem, index) => {
              const anterior = mensagens[index - 1]
              const novoDia = !anterior || diaChave(anterior.criado_em) !== diaChave(mensagem.criado_em)
              const propria = mensagem.autor_id === usuarioAtualId
              const mesmoAutor = Boolean(anterior && anterior.autor_id === mensagem.autor_id && !novoDia)
              return (
                <div key={mensagem.id} className={novoDia ? 'pt-2' : mesmoAutor ? 'pt-0.5' : 'pt-2'}>
                  {novoDia && <p className="py-2 text-center text-[11px] font-medium text-slate-400">{rotuloDia(mensagem.criado_em)}</p>}
                  <MensagemItem mensagem={mensagem} propria={propria} mostrarNome={!propria && !mesmoAutor} />
                </div>
              )
            })}
          </div>
          <form onSubmit={enviar} className="border-t border-slate-100 bg-white px-2 py-1.5">
            {(vincularOs || osId) && (
              <select value={osId} onChange={(event) => setOsId(event.target.value)} className="mb-1.5 w-full rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm">
                <option value="">Sem OS</option>
                {ordens.map((ordem) => <option key={ordem.id} value={ordem.id}>{ordem.numero_os} · {nomeCliente(ordem.clientes)}</option>)}
              </select>
            )}
            <div className="flex items-end gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-1">
              <button type="button" onClick={() => setVincularOs((aberto) => !aberto)} disabled={!conversaId} className={`mb-0.5 shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${ordemVinculada ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-800'}`}>
                {ordemVinculada ? ordemVinculada.numero_os : 'Vincular OS'}
              </button>
              <textarea
                ref={campoMensagemRef}
                value={conteudo}
                onChange={(event) => {
                  setConteudo(event.target.value)
                  const campo = event.target
                  campo.style.height = 'auto'
                  campo.style.height = `${Math.min(campo.scrollHeight, 112)}px`
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                maxLength={2000}
                rows={1}
                placeholder="Mensagem"
                disabled={!conversaId || estruturaPendente}
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none"
              />
              <button type="submit" disabled={!conversaId || !conteudo.trim() || enviando || estruturaPendente} className="mb-0.5 rounded-full bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                {enviando ? '...' : 'Enviar'}
              </button>
            </div>
            {conteudo.length >= 1600 && <p className="mt-1 px-2 text-right text-[11px] text-slate-400">{conteudo.length}/2.000</p>}
          </form>
        </section>
      </div>
    </div>
  )
}

function Lista({ titulo, itens, selecionada, escolher, vazio }: { titulo: string; itens: Conversa[]; selecionada: number | null; escolher: (id: number) => void; vazio?: string }) {
  return (
    <div className="px-2 py-2">
      <p className="px-2 py-1 text-[11px] font-medium text-slate-400">{titulo}</p>
      {itens.length === 0 && vazio && <p className="px-2 py-2 text-xs text-slate-400">{vazio}</p>}
      <div>
        {itens.map((item) => {
          const ativa = selecionada === item.id
          const previa = item.ultimaMensagem?.conteudo?.trim()
          return (
            <button key={item.id} type="button" onClick={() => escolher(item.id)} className={`flex w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-left ${ativa ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
              <Avatar nome={item.titulo} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-950">{item.titulo}</span>
                  {item.ultimaMensagem?.criado_em && <span className="shrink-0 text-[10px] text-slate-400">{horaCurta(item.ultimaMensagem.criado_em)}</span>}
                </span>
                {previa && <span className="block truncate text-xs text-slate-500">{previa}</span>}
              </span>
              {item.naoLidas > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-semibold text-white">{item.naoLidas > 99 ? '99+' : item.naoLidas}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MensagemItem({ mensagem, propria, mostrarNome }: { mensagem: Mensagem; propria: boolean; mostrarNome: boolean }) {
  const autor = relacao(mensagem.autor)
  const ordem = relacao(mensagem.ordens_servico)
  const nome = autor?.nome ?? autor?.email ?? 'Usuário'
  return (
    <div className={`flex ${propria ? 'justify-end' : 'justify-start'}`}>
      <article className={`max-w-[88%] rounded-2xl border px-2.5 py-1.5 md:max-w-[68%] ${propria ? 'border-orange-200 bg-orange-100 text-slate-900' : 'border-slate-200 bg-white text-slate-900'}`}>
        {mostrarNome && <p className="mb-0.5 text-xs font-semibold text-orange-800">{nome}</p>}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {mensagem.conteudo}
          <time className="ml-2 inline-block align-bottom text-[10px] font-medium text-slate-500">{horaCurta(mensagem.criado_em)}</time>
        </p>
        {ordem && <Link href={`/admin/os/${ordem.id}`} className="mt-1 inline-block text-xs font-semibold text-orange-800 underline decoration-orange-200 underline-offset-2">OS {ordem.numero_os}</Link>}
      </article>
    </div>
  )
}

function Avatar({ nome }: { nome: string }) {
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">{iniciais(nome)}</span>
}

function relacao<T>(valor?: T | T[] | null) { return Array.isArray(valor) ? valor[0] : valor }
function nomeCliente(valor?: Ordem['clientes']) { return relacao(valor)?.nome ?? 'Cliente não informado' }
function diaChave(iso: string) {
  const data = new Date(iso)
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`
}
function rotuloDia(iso: string) {
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)
  const chave = diaChave(iso)
  if (chave === `${hoje.getFullYear()}-${hoje.getMonth()}-${hoje.getDate()}`) return 'Hoje'
  if (chave === `${ontem.getFullYear()}-${ontem.getMonth()}-${ontem.getDate()}`) return 'Ontem'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const letras = `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[partes.length - 1]?.[0] ?? '' : ''}`
  return letras.toUpperCase() || '?'
}
function unirMensagens(...listas: Mensagem[][]) {
  const porId = new Map<number, Mensagem>()
  listas.flat().forEach((mensagem) => porId.set(mensagem.id, mensagem))
  return [...porId.values()].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
}
