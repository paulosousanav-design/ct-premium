'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/admin-fetch'
import {
  ESCOPO_CONSOLIDADO,
  getUnidadeSelecionadaId,
  paginaUsaEscopoGerencial,
  setEscopoGerencial,
  setUnidadeSelecionadaId,
  setUnidadesPermitidasIds,
  sincronizarEscopoGerencialPadrao,
} from '@/lib/unidade-client'

type MenuItem = {
  label: string
  href: string
  permissao: string
  contador?: boolean
}

type UnidadeAcesso = {
  id: number
  codigo: string
  tipo: 'MATRIZ' | 'FILIAL'
  nome_fantasia: string
  ativa: boolean
}

type ChatMensagemResumo = {
  id?: number
  conteudo?: string
  criado_em?: string
  autor?: { nome?: string | null; email?: string | null } | Array<{ nome?: string | null; email?: string | null }> | null
}

type ChatConversaResumo = {
  id: number
  titulo?: string
  naoLidas?: number
  ultimaMensagem?: ChatMensagemResumo | null
}

type ChatAlerta = { conversaId: number; titulo: string; autor: string; conteudo: string }

const menu: MenuItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', permissao: 'dashboard' },
  { label: 'Ordens de Servico', href: '/admin/os', permissao: 'os' },
  { label: 'Finalizadas', href: '/admin/finalizadas', permissao: 'finalizadas' },
  { label: 'Retirada de Equipamentos', href: '/admin/retiradas', permissao: 'os' },
  { label: 'Tecnicos', href: '/admin/parceiros', permissao: 'tecnicos' },
  { label: 'Garantidores', href: '/admin/garantidores', permissao: 'garantidores' },
  { label: 'Aprovacao', href: '/admin/aprovacao', permissao: 'aprovacao' },
  { label: 'Financeiro', href: '/admin/financeiro', permissao: 'financeiro' },
  { label: 'DRE Gerencial', href: '/admin/financeiro/dre', permissao: 'dre' },
  { label: 'Vendas', href: '/admin/vendas', permissao: 'vendas' },
  { label: 'Pecas', href: '/admin/pecas', permissao: 'pecas' },
  { label: 'Clientes', href: '/admin/clientes', permissao: 'clientes' },
  { label: 'Matriz e Filiais', href: '/admin/unidades', permissao: 'unidades' },
  { label: 'Usuarios', href: '/admin/usuarios', permissao: 'usuarios' },
  { label: 'Relatorios', href: '/admin/relatorios', permissao: 'relatorios' },
  { label: 'Academia Tecnica', href: '/admin/academia', permissao: 'academia' },
  { label: 'Documentos Tecnicos', href: '/admin/documentos', permissao: 'documentos' },
  { label: 'Chat interno', href: '/admin/chat', permissao: 'chat', contador: true },
  { label: 'Configuracoes', href: '/admin/configuracoes', permissao: 'configuracoes' },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [buscaGlobal, setBuscaGlobal] = useState('')
  const [permissoes, setPermissoes] = useState<string[] | null>(null)
  const [verificandoAcesso, setVerificandoAcesso] = useState(true)
  const [usuarioInativo, setUsuarioInativo] = useState(false)
  const [unidades, setUnidades] = useState<UnidadeAcesso[]>([])
  const [unidadeSelecionadaId, setUnidadeSelecionada] = useState<number | null>(null)
  const [escopoGerencial, setEscopoGerencialState] = useState(ESCOPO_CONSOLIDADO)
  const [chatNaoLidas, setChatNaoLidas] = useState(0)
  const [chatAlerta, setChatAlerta] = useState<ChatAlerta | null>(null)
  const [chatSomAtivo, setChatSomAtivo] = useState(true)
  const chatNaoLidasAnterior = useRef<number | null>(null)
  const chatAlertaTimer = useRef<number | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const isLoginPage = pathname === '/admin/login'
  const visaoGerencial = paginaUsaEscopoGerencial(pathname)

  const carregarPermissoes = useCallback(async () => {
    setVerificandoAcesso(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setPermissoes(null)
      setVerificandoAcesso(false)
      if (!isLoginPage) router.replace('/admin/login')
      return
    }

    const response = await fetch('/api/admin/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      setPermissoes(null)
      setVerificandoAcesso(false)
      if (!isLoginPage) {
        await supabase.auth.signOut()
        router.replace('/admin/login?erro=sem-permissao')
      }
      return
    }

    setPermissoes(Array.isArray(data.permissoes) ? data.permissoes : [])
    const unidadesAcesso = Array.isArray(data.unidades) ? data.unidades as UnidadeAcesso[] : []
    const selecionadaSalva = getUnidadeSelecionadaId()
    const unidadeValida = unidadesAcesso.find((item) => item.id === selecionadaSalva)
    const unidadePadrao = unidadesAcesso.find((item) => item.id === Number(data.unidadePadraoId)) ?? unidadesAcesso[0]
    const unidadeAtual = unidadeValida ?? unidadePadrao ?? null
    setUnidades(unidadesAcesso)
    setUnidadesPermitidasIds(unidadesAcesso.map((item) => item.id))
    setUnidadeSelecionada(unidadeAtual?.id ?? null)
    if (unidadeAtual) setUnidadeSelecionadaId(unidadeAtual.id)
    const escopoSalvo = sincronizarEscopoGerencialPadrao(unidadeAtual?.id ?? null)
    const escopoValido = escopoSalvo === ESCOPO_CONSOLIDADO || unidadesAcesso.some((item) => item.id === Number(escopoSalvo))
    const escopoAtual = escopoValido ? escopoSalvo : ESCOPO_CONSOLIDADO
    setEscopoGerencialState(escopoAtual)
    setEscopoGerencial(escopoAtual)
    setUsuarioInativo(false)
    setVerificandoAcesso(false)
  }, [isLoginPage, router])

  useEffect(() => {
    if (isLoginPage) {
      return
    }

    void Promise.resolve().then(carregarPermissoes)
  }, [carregarPermissoes, isLoginPage])

  useEffect(() => {
    void Promise.resolve().then(() => setChatSomAtivo(window.localStorage.getItem('ct-chat-som') !== 'desativado'))
  }, [])

  useEffect(() => {
    if (!permissoes?.includes('chat') || isLoginPage) return
    let ativo = true
    const carregarNaoLidas = async () => {
      try {
        const response = await adminFetch('/api/admin/chat', { cache: 'no-store' })
        const data = await response.json().catch(() => null)
        if (ativo && response.ok) {
          const total = Number(data?.totalNaoLidas ?? 0)
          const anterior = chatNaoLidasAnterior.current
          setChatNaoLidas(total)
          if (anterior !== null && total > anterior && pathname !== '/admin/chat') {
            const conversas = (Array.isArray(data?.conversas) ? data.conversas : []) as ChatConversaResumo[]
            const conversa = conversas.find((item) => Number(item.naoLidas ?? 0) > 0)
            const mensagem = conversa?.ultimaMensagem
            const autorRaw = mensagem?.autor
            const autor = Array.isArray(autorRaw) ? autorRaw[0] : autorRaw
            if (conversa) {
              setChatAlerta({
                conversaId: Number(conversa.id),
                titulo: String(conversa.titulo ?? 'Chat interno'),
                autor: String(autor?.nome ?? autor?.email ?? 'Nova mensagem'),
                conteudo: String(mensagem?.conteudo ?? 'Você recebeu uma nova mensagem.'),
              })
              if (chatSomAtivo) tocarAlertaChat()
              if (chatAlertaTimer.current) window.clearTimeout(chatAlertaTimer.current)
              chatAlertaTimer.current = window.setTimeout(() => setChatAlerta(null), 9000)
            }
          }
          chatNaoLidasAnterior.current = total
        }
      } catch {
        // O menu continua funcional mesmo se o contador estiver temporariamente indisponivel.
      }
    }
    void carregarNaoLidas()
    const timer = window.setInterval(() => void carregarNaoLidas(), 6000)
    return () => {
      ativo = false
      window.clearInterval(timer)
      if (chatAlertaTimer.current) window.clearTimeout(chatAlertaTimer.current)
    }
  }, [chatSomAtivo, isLoginPage, pathname, permissoes])

  const menuVisivel = useMemo(() => {
    if (permissoes === null) return []
    if (usuarioInativo) return []
    return menu.filter((item) => permissoes.includes(item.permissao))
  }, [permissoes, usuarioInativo])

  async function sair() {
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  function alterarUnidade(id: number) {
    if (!id || id === unidadeSelecionadaId) return
    setUnidadeSelecionadaId(id)
    setUnidadeSelecionada(id)
    window.location.reload()
  }

  function alterarEscopoGerencial(value: string) {
    if (!value || value === escopoGerencial) return
    setEscopoGerencial(value)
    setEscopoGerencialState(value)
    window.location.reload()
  }

  function alternarSomChat() {
    const novoValor = !chatSomAtivo
    setChatSomAtivo(novoValor)
    window.localStorage.setItem('ct-chat-som', novoValor ? 'ativado' : 'desativado')
  }

  function abrirConversaChat(conversaId?: number) {
    setChatAlerta(null)
    router.push(conversaId ? `/admin/chat?conversaId=${conversaId}` : '/admin/chat')
  }

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-[#c7d3cf]">
      {permissoes?.includes('chat') && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
          <button
            type="button"
            onClick={alternarSomChat}
            title={chatSomAtivo ? 'Desativar som do chat' : 'Ativar som do chat'}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm shadow-lg"
            aria-label={chatSomAtivo ? 'Desativar som do chat' : 'Ativar som do chat'}
          >
            {chatSomAtivo ? '🔔' : '🔕'}
          </button>
          <button
            type="button"
            onClick={() => abrirConversaChat()}
            className="relative rounded-full bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-xl hover:bg-slate-800"
          >
            Chat
            {chatNaoLidas > 0 && (
              <span className="absolute -right-2 -top-2 min-w-6 rounded-full bg-red-600 px-1.5 py-1 text-[10px] font-black text-white">
                {chatNaoLidas > 99 ? '99+' : chatNaoLidas}
              </span>
            )}
          </button>
        </div>
      )}

      {chatAlerta && (
        <div className="fixed right-4 top-4 z-[60] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-2xl">
          <button type="button" onClick={() => abrirConversaChat(chatAlerta.conversaId)} className="block w-full p-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-orange-600">Nova mensagem · {chatAlerta.titulo}</p>
                <p className="mt-1 truncate text-sm font-black text-slate-950">{chatAlerta.autor}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{chatAlerta.conteudo}</p>
              </div>
              <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">Abrir</span>
            </div>
          </button>
          <button type="button" onClick={() => setChatAlerta(null)} className="w-full border-t border-slate-100 px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Dispensar</button>
        </div>
      )}
      <div className="flex min-h-screen">
        <aside className="hidden w-[300px] border-r border-slate-800 bg-slate-950 text-white lg:flex lg:flex-col">
          <div className="border-b border-slate-800 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2">
                <Image
                  src="/logo-ct.png"
                  alt="CT Premium"
                  width={70}
                  height={70}
                  className="object-contain"
                  priority
                />
              </div>

              <div>
                <h2 className="text-2xl font-bold">CT Premium</h2>
                <p className="text-slate-300">Assistencia Premium</p>
                <p className="text-xs text-slate-400">www.chameotecnico.com.br</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-2">
              {menuVisivel.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                        active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.contador && chatNaoLidas > 0 && <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[11px] font-black text-white">{chatNaoLidas > 99 ? '99+' : chatNaoLidas}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="border-t border-slate-800 p-4">
            <button
              type="button"
              onClick={sair}
              className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-900 hover:text-white"
            >
              Sair
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-slate-200 bg-[#f8faf9]">
            <div className="flex justify-center py-2">
              <Image
                src="/logo-chame-o-tecnico.png"
                alt="Chame o Tecnico"
                width={900}
                height={180}
                className="h-auto w-[180px] object-contain md:w-[320px] lg:w-[460px]"
                priority
              />
            </div>
            {unidades.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-2">
                <div className="mx-auto flex max-w-7xl items-center justify-end gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    {visaoGerencial ? 'Visão gerencial' : 'Unidade ativa — OS, estoque e vendas'}
                  </span>
                  <select
                    value={visaoGerencial ? escopoGerencial : unidadeSelecionadaId ?? ''}
                    onChange={(event) => visaoGerencial
                      ? alterarEscopoGerencial(event.target.value)
                      : alterarUnidade(Number(event.target.value))}
                    className="max-w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 outline-none focus:border-orange-500"
                  >
                    {visaoGerencial && <option value={ESCOPO_CONSOLIDADO}>Consolidado — todas as unidades</option>}
                    {unidades.map((unidade) => (
                      <option key={unidade.id} value={unidade.id}>
                        {unidade.tipo === 'MATRIZ' ? 'Matriz' : 'Filial'} - {unidade.nome_fantasia}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="hidden">
            <div className="flex items-center justify-between gap-4 px-6 py-3">
              <div className="hidden flex-1 md:flex">
                <input
                  type="text"
                  value={buscaGlobal}
                  onChange={(event) => setBuscaGlobal(event.target.value)}
                  placeholder="Buscar OS, cliente, parceiro..."
                  className="w-full max-w-lg rounded-full bg-slate-100 px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          <main className="flex-1 bg-[#c7d3cf] p-4">
            {verificandoAcesso ? (
              <div className="rounded-xl bg-white p-5 text-sm font-bold text-slate-600 shadow-sm">
                Verificando acesso administrativo...
              </div>
            ) : usuarioInativo ? (
              <div className="rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">
                Seu acesso administrativo esta inativo. Solicite liberacao ao administrador.
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

function tocarAlertaChat() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const contexto = new AudioContextClass()
    const oscilador = contexto.createOscillator()
    const ganho = contexto.createGain()
    oscilador.frequency.value = 720
    ganho.gain.setValueAtTime(0.0001, contexto.currentTime)
    ganho.gain.exponentialRampToValueAtTime(0.12, contexto.currentTime + 0.02)
    ganho.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + 0.22)
    oscilador.connect(ganho)
    ganho.connect(contexto.destination)
    oscilador.start()
    oscilador.stop(contexto.currentTime + 0.23)
    oscilador.addEventListener('ended', () => void contexto.close())
  } catch {
    // Alguns navegadores bloqueiam som antes da primeira interacao do usuario.
  }
}
