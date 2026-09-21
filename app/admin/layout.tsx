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
  icone: string
  contador?: 'chat' | 'monitoramento'
}

type UnidadeAcesso = {
  id: number
  codigo: string
  tipo: 'EMPRESA'
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
  { label: 'Dashboard', href: '/admin/dashboard', permissao: 'dashboard', icone: '▦' },
  { label: 'Ordens de Servico', href: '/admin/os', permissao: 'os', icone: '▤' },
  { label: 'Finalizadas', href: '/admin/finalizadas', permissao: 'finalizadas', icone: '✓' },
  { label: 'Retirada de Equipamentos', href: '/admin/retiradas', permissao: 'os', icone: '↗' },
  { label: 'Tecnicos', href: '/admin/parceiros', permissao: 'tecnicos', icone: '♙' },
  { label: 'Garantidores', href: '/admin/garantidores', permissao: 'garantidores', icone: '◆' },
  { label: 'Aprovacao', href: '/admin/aprovacao', permissao: 'aprovacao', icone: '✓' },
  { label: 'Financeiro', href: '/admin/financeiro', permissao: 'financeiro', icone: '$' },
  { label: 'Fechamento de Caixa', href: '/admin/financeiro/caixa', permissao: 'financeiro', icone: '▣' },
  { label: 'DRE Gerencial', href: '/admin/financeiro/dre', permissao: 'dre', icone: '▥' },
  { label: 'Gestao de Rotas', href: '/admin/rotas', permissao: 'rotas', icone: '⌖' },
  { label: 'Vendas', href: '/admin/vendas', permissao: 'vendas', icone: '▣' },
  { label: 'Pecas', href: '/admin/pecas', permissao: 'pecas', icone: '⚙' },
  { label: 'Documentos recebidos', href: '/admin/documentos-fiscais', permissao: 'documentos_fiscais', icone: '⌑' },
  { label: 'Clientes', href: '/admin/clientes', permissao: 'clientes', icone: '◉' },
  { label: 'Empresas do grupo', href: '/admin/unidades', permissao: 'unidades', icone: '⌂' },
  { label: 'Usuarios', href: '/admin/usuarios', permissao: 'usuarios', icone: '◌' },
  { label: 'Auditoria', href: '/admin/auditoria', permissao: 'usuarios', icone: '◈' },
  { label: 'Monitoramento', href: '/admin/monitoramento', permissao: 'usuarios', icone: '!', contador: 'monitoramento' },
  { label: 'Central de Backups', href: '/admin/backups', permissao: 'usuarios', icone: '⇧' },
  { label: 'Relatorios', href: '/admin/relatorios', permissao: 'relatorios', icone: '▧' },
  { label: 'Academia Tecnica', href: '/admin/academia', permissao: 'academia', icone: '✦' },
  { label: 'Documentos Tecnicos', href: '/admin/documentos', permissao: 'documentos', icone: '▤' },
  { label: 'Chat interno', href: '/admin/chat', permissao: 'chat', icone: '◍', contador: 'chat' },
  { label: 'Configuracoes', href: '/admin/configuracoes', permissao: 'configuracoes', icone: '⚙' },
  { label: 'Assinaturas CT Premium', href: '/admin/assinaturas', permissao: 'configuracoes', icone: '$' },
  { label: 'Oficinas clientes', href: '/admin/clientes-saas', permissao: 'configuracoes', icone: '◉' },
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
  const [monitoramentoAbertos, setMonitoramentoAbertos] = useState(0)
  const [monitoramentoCriticos, setMonitoramentoCriticos] = useState(0)
  const [chatAlerta, setChatAlerta] = useState<ChatAlerta | null>(null)
  const [chatSomAtivo, setChatSomAtivo] = useState(true)
  const [acessoP4, setAcessoP4] = useState(false)
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
    setAcessoP4(window.location.hostname.toLowerCase() === 'app.p4integra.com.br')
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

  useEffect(() => {
    if (!permissoes?.includes('usuarios') || isLoginPage) return
    let ativo = true

    const carregarMonitoramento = async () => {
      try {
        const response = await adminFetch('/api/admin/monitoramento?resumo=1', { cache: 'no-store' })
        const data = await response.json().catch(() => null)
        if (ativo && response.ok) {
          setMonitoramentoAbertos(Number(data?.resumo?.abertos ?? 0))
          setMonitoramentoCriticos(Number(data?.resumo?.criticos ?? 0))
        }
      } catch {
        // O menu continua funcional mesmo se o resumo estiver temporariamente indisponivel.
      }
    }

    void carregarMonitoramento()
    const timer = window.setInterval(() => void carregarMonitoramento(), 30000)
    return () => {
      ativo = false
      window.clearInterval(timer)
    }
  }, [isLoginPage, permissoes])

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
                  src={acessoP4 ? '/p4-integra-logo.png' : '/logo-ct.png'}
                  alt={acessoP4 ? 'P4 Integra' : 'CT Premium'}
                  width={70}
                  height={70}
                  className="object-contain"
                  priority
                />
              </div>

              <div>
                <h2 className="text-2xl font-bold">{acessoP4 ? 'P4 Integra' : 'CT Premium'}</h2>
                <p className="text-slate-300">{acessoP4 ? 'Gestão que conecta' : 'Assistencia Premium'}</p>
                <p className="text-xs text-slate-400">{acessoP4 ? 'app.p4integra.com.br' : 'www.chameotecnico.com.br'}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-2">
              {menuVisivel.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                const contador = item.contador === 'chat'
                  ? chatNaoLidas
                  : item.contador === 'monitoramento'
                    ? monitoramentoAbertos
                    : 0

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                        active ? 'border-orange-400/40 bg-slate-800 text-white shadow-lg shadow-black/20' : 'border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-orange-500" aria-hidden="true" />}
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-black transition-transform duration-200 group-hover:scale-110 ${active ? 'bg-orange-500 text-white shadow-md shadow-orange-900/40' : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700 group-hover:text-white'}`} aria-hidden="true">
                          {item.icone}
                        </span>
                        <span className="truncate tracking-[0.01em]">{item.label}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {contador > 0 && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-black text-white ${
                              item.contador === 'monitoramento' && monitoramentoCriticos > 0
                                ? 'animate-pulse bg-red-600'
                                : 'bg-orange-600'
                            }`}
                            title={item.contador === 'monitoramento' && monitoramentoCriticos > 0
                              ? `${monitoramentoCriticos} alerta(s) critico(s)`
                              : undefined}
                          >
                            {contador > 99 ? '99+' : contador}
                          </span>
                        )}
                        <span className={`text-sm transition-transform duration-200 ${active ? 'text-orange-400' : 'text-slate-600 group-hover:translate-x-0.5 group-hover:text-slate-300'}`} aria-hidden="true">›</span>
                      </span>
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
                src={acessoP4 ? '/p4-integra-logo.png' : '/logo-chame-o-tecnico.png'}
                alt={acessoP4 ? 'P4 Integra' : 'Chame o Tecnico'}
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
                    {visaoGerencial ? 'Visão gerencial' : 'Empresa ativa — OS, estoque e vendas'}
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
                        {unidade.nome_fantasia}
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
