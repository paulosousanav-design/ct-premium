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
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    const erroParam = new URLSearchParams(window.location.search).get('erro')
    if (erroParam !== 'sem-permissao') return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErro('Usuario sem permissao administrativa ativa.')
  }, [])

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#c7d3cf] px-4 py-8">
      <section className="w-full max-w-md rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-xl bg-white p-3">
            <Image src="/logo-ct.png" alt="Chame o Tecnico" width={120} height={55} className="h-auto w-[120px]" priority />
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-orange-400">Acesso interno</p>
            <h1 className="text-2xl font-black">Admin CT Premium</h1>
          </div>
        </div>

        {erro && <div className="mb-4 rounded-lg bg-red-500/15 px-4 py-3 text-sm font-bold text-red-100">{erro}</div>}

        <form onSubmit={entrar} className="space-y-4">
          <label className="block text-sm font-bold text-slate-200">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-orange-500"
            />
          </label>

          <label className="block text-sm font-bold text-slate-200">
            Senha
            <input
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-orange-500"
            />
          </label>

          <button
            type="submit"
            disabled={entrando}
            className="w-full rounded-xl bg-orange-500 px-5 py-3 text-base font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {entrando ? 'Entrando...' : 'Entrar no admin'}
          </button>
        </form>

        <Link href="/" className="mt-5 block text-center text-xs font-bold text-slate-400 hover:text-white">
          Voltar ao portal publico
        </Link>
      </section>
    </main>
  )
}
