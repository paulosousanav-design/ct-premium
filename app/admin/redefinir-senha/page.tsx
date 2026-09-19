'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [acessoP4, setAcessoP4] = useState(false)

  useEffect(() => {
    setAcessoP4(window.location.hostname.toLowerCase() === 'app.p4integra.com.br')
  }, [])

  async function redefinir(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')

    if (senha.length < 8) {
      setErro('A nova senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas informadas nao sao iguais.')
      return
    }

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)

    if (error) {
      setErro('Este link expirou ou e invalido. Solicite uma nova redefinicao de senha.')
      return
    }

    router.replace('/admin/dashboard')
  }

  return (
    <main className={`flex min-h-screen items-center justify-center px-4 py-8 ${acessoP4 ? 'bg-[#e8f3ff]' : 'bg-[#c7d3cf]'}`}>
      <section className="w-full max-w-md rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
        <div className="mb-6 flex items-center gap-4">
          <div className="rounded-xl bg-white p-3">
            <Image src={acessoP4 ? '/p4-integra-logo.png' : '/logo-ct.png'} alt={acessoP4 ? 'P4 Integra' : 'Chame o Tecnico'} width={120} height={55} className="h-auto w-[120px]" priority />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase ${acessoP4 ? 'text-cyan-300' : 'text-orange-400'}`}>Seguranca da conta</p>
            <h1 className="text-2xl font-black">Criar nova senha</h1>
          </div>
        </div>

        <p className="mb-5 text-sm text-slate-300">Escolha uma senha nova com pelo menos 8 caracteres.</p>
        {erro && <div className="mb-4 rounded-lg bg-red-500/15 px-4 py-3 text-sm font-bold text-red-100">{erro}</div>}

        <form onSubmit={redefinir} className="space-y-4">
          <label className="block text-sm font-bold text-slate-200">
            Nova senha
            <input type="password" value={senha} onChange={(event) => setSenha(event.target.value)} required minLength={8} className={`mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ${acessoP4 ? 'focus:border-cyan-400' : 'focus:border-orange-500'}`} />
          </label>
          <label className="block text-sm font-bold text-slate-200">
            Confirmar nova senha
            <input type="password" value={confirmacao} onChange={(event) => setConfirmacao(event.target.value)} required minLength={8} className={`mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none ${acessoP4 ? 'focus:border-cyan-400' : 'focus:border-orange-500'}`} />
          </label>
          <button type="submit" disabled={salvando} className={`w-full rounded-xl px-5 py-3 text-base font-black text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${acessoP4 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600'}`}>
            {salvando ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>

        <Link href="/admin/login" className="mt-5 block text-center text-xs font-bold text-slate-400 hover:text-white">Voltar ao login</Link>
      </section>
    </main>
  )
}
