'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [acessoP4, setAcessoP4] = useState(false)

  useEffect(() => {
    setAcessoP4(window.location.hostname.toLowerCase() === 'app.p4integra.com.br')

    const erroParam = new URLSearchParams(window.location.search).get('erro')
    if (erroParam !== 'sem-permissao') return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErro('Usuario sem permissao administrativa ativa.')
  }, [])

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setAviso('')
    setEntrando(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    })

    setEntrando(false)

    if (error) {
      setErro('E-mail ou senha invalidos.')
      return
    }

    router.replace('/admin/dashboard')
  }

  async function solicitarRedefinicao() {
    const emailNormalizado = email.trim().toLowerCase()
    if (!emailNormalizado) {
      setErro('Informe seu e-mail para receber o link de redefinicao.')
      return
    }

    setErro('')
    setAviso('')
    const origem = window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(emailNormalizado, {
      redirectTo: `${origem}/admin/redefinir-senha`,
    })

    if (error) {
      setErro('Nao foi possivel enviar o link agora. Tente novamente em instantes.')
      return
    }

    setAviso('Se o e-mail estiver cadastrado, enviamos um link para criar uma nova senha.')
  }

  return (
    <main className={`flex min-h-screen items-center justify-center px-4 py-8 ${acessoP4 ? 'bg-[#e8f3ff]' : 'bg-[#c7d3cf]'}`}>
      <section className="w-full max-w-md rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-xl bg-white p-3">
            <Image
              src={acessoP4 ? '/p4-integra-logo.png' : '/logo-ct.png'}
              alt={acessoP4 ? 'P4 Integra' : 'Chame o Tecnico'}
              width={120}
              height={55}
              className="h-auto w-[120px]"
              priority
            />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase ${acessoP4 ? 'text-cyan-300' : 'text-orange-400'}`}>
              {acessoP4 ? 'Acesso do cliente' : 'Acesso interno'}
            </p>
            <h1 className="text-2xl font-black">{acessoP4 ? 'P4 Integra' : 'Admin CT Premium'}</h1>
          </div>
        </div>

        {erro && <div className="mb-4 rounded-lg bg-red-500/15 px-4 py-3 text-sm font-bold text-red-100">{erro}</div>}
        {aviso && <div className="mb-4 rounded-lg bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-100">{aviso}</div>}

        <form onSubmit={entrar} className="space-y-4">
          <label className="block text-sm font-bold text-slate-200">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className={`mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ${acessoP4 ? 'focus:border-cyan-400' : 'focus:border-orange-500'}`}
            />
          </label>

          <label className="block text-sm font-bold text-slate-200">
            Senha
            <input
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              required
              className={`mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ${acessoP4 ? 'focus:border-cyan-400' : 'focus:border-orange-500'}`}
            />
          </label>

          <button
            type="submit"
            disabled={entrando}
            className={`w-full rounded-xl px-5 py-3 text-base font-black text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${acessoP4 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600'}`}
          >
            {entrando ? 'Entrando...' : acessoP4 ? 'Entrar na plataforma' : 'Entrar no admin'}
          </button>
        </form>

        <button
          type="button"
          onClick={solicitarRedefinicao}
          className={`mt-4 w-full text-center text-sm font-bold ${acessoP4 ? 'text-cyan-300 hover:text-cyan-200' : 'text-orange-300 hover:text-orange-200'}`}
        >
          Esqueci minha senha
        </button>

        <Link href="/" className="mt-5 block text-center text-xs font-bold text-slate-400 hover:text-white">
          {acessoP4 ? 'Voltar ao site P4 Integra' : 'Voltar ao portal publico'}
        </Link>
      </section>
    </main>
  )
}
