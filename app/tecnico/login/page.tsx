'use client'

import Image from 'next/image'
import { type FormEvent, useState } from 'react'

export default function TecnicoLoginPage() {
  const [whatsapp, setWhatsapp] = useState('')
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setLoading(true)

    try {
      const response = await fetch('/api/tecnico/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp, pin }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) throw new Error(data?.error ?? 'Nao foi possivel acessar o painel.')
      window.location.href = '/tecnico/painel'
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao acessar o painel.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#c7d3cf] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <Image src="/logo-ct.png" alt="Chame o Tecnico" width={140} height={60} className="h-auto w-[120px]" />
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Portal do tecnico</h1>
              <p className="text-sm text-slate-500">Use o WhatsApp cadastrado e o PIN enviado pela equipe.</p>
            </div>
          </div>

          {erro && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}

          <form onSubmit={entrar} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              WhatsApp
              <input
                value={whatsapp}
                onChange={(event) => setWhatsapp(formatarTelefone(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500"
                placeholder="(67) 99999-9999"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              PIN
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 text-lg font-bold tracking-[0.2em] outline-none focus:border-orange-500"
                placeholder="000000"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-orange-500 px-5 py-4 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Entrando...' : 'Entrar no painel'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

function formatarTelefone(valor: string) {
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 11)

  if (apenasNumeros.length <= 2) return apenasNumeros
  if (apenasNumeros.length <= 6) return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`
  if (apenasNumeros.length <= 10) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 6)}-${apenasNumeros.slice(6)}`
  }

  return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7)}`
}
