'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { getUnidadeSelecionadaId, setUnidadeSelecionadaId } from '@/lib/unidade-client'

type MenuItem = {
  label: string
  href: string
  permissao: string
}

type UnidadeAcesso = {
  id: number
  codigo: string
  tipo: 'MATRIZ' | 'FILIAL'
  nome_fantasia: string
  ativa: boolean
}

const menu: MenuItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', permissao: 'dashboard' },
  { label: 'Ordens de Servico', href: '/admin/os', permissao: 'os' },
  { label: 'Finalizadas', href: '/admin/finalizadas', permissao: 'finalizadas' },
  { label: 'Tecnicos', href: '/admin/parceiros', permissao: 'tecnicos' },
  { label: 'Garantidores', href: '/admin/garantidores', permissao: 'garantidores' },
  { label: 'Aprovacao', href: '/admin/aprovacao', permissao: 'aprovacao' },
  { label: 'Financeiro', href: '/admin/financeiro', permissao: 'financeiro' },
  { label: 'Vendas', href: '/admin/vendas', permissao: 'vendas' },
  { label: 'Pecas', href: '/admin/pecas', permissao: 'pecas' },
  { label: 'Clientes', href: '/admin/clientes', permissao: 'clientes' },
  { label: 'Matriz e Filiais', href: '/admin/unidades', permissao: 'unidades' },
  { label: 'Usuarios', href: '/admin/usuarios', permissao: 'usuarios' },
  { label: 'Relatorios', href: '/admin/relatorios', permissao: 'relatorios' },
  { label: 'Academia Tecnica', href: '/admin/academia', permissao: 'academia' },
  { label: 'Documentos Tecnicos', href: '/admin/documentos', permissao: 'documentos' },
  { label: 'Configuracoes', href: '/admin/configuracoes', permissao: 'configuracoes' },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [buscaGlobal, setBuscaGlobal] = useState('')
  const [permissoes, setPermissoes] = useState<string[] | null>(null)
  const [verificandoAcesso, setVerificandoAcesso] = useState(true)
  const [usuarioInativo, setUsuarioInativo] = useState(false)
  const [unidades, setUnidades] = useState<UnidadeAcesso[]>([])
  const [unidadeSelecionadaId, setUnidadeSelecionada] = useState<number | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const isLoginPage = pathname === '/admin/login'

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
    setUnidadeSelecionada(unidadeAtual?.id ?? null)
    if (unidadeAtual) setUnidadeSelecionadaId(unidadeAtual.id)
    setUsuarioInativo(false)
    setVerificandoAcesso(false)
  }, [isLoginPage, router])

  useEffect(() => {
    if (isLoginPage) {
      return
    }

    void Promise.resolve().then(carregarPermissoes)
  }, [carregarPermissoes, isLoginPage])

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

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-[#c7d3cf]">
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

          <nav className="flex-1 p-4">
            <ul className="space-y-2">
              {menuVisivel.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${
                        active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      {item.label}
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
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Unidade ativa — OS, estoque e vendas</span>
                  <select
                    value={unidadeSelecionadaId ?? ''}
                    onChange={(event) => alterarUnidade(Number(event.target.value))}
                    className="max-w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-800 outline-none focus:border-orange-500"
                  >
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
