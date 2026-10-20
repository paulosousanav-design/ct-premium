'use client'

import Image from 'next/image'
import { type FormEvent, useEffect, useState } from 'react'

type ModoLogin = 'CODIGO' | 'PIN'

export default function TecnicoLoginPage() {
  const [whatsapp, setWhatsapp] = useState('')
  const [codigo, setCodigo] = useState('')
  const [pin, setPin] = useState('')
  const [modo, setModo] = useState<ModoLogin>('CODIGO')
  const [codigoEnviado, setCodigoEnviado] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [segundosReenvio, setSegundosReenvio] = useState(0)

  useEffect(() => {
    if (segundosReenvio <= 0) return
    const timer = window.setInterval(() => {
      setSegundosReenvio((atual) => Math.max(atual - 1, 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [segundosReenvio])

  async function solicitarCodigo() {
    setErro('')
    setMensagem('')
    setLoading(true)

    try {
      const response = await fetch('/api/tecnico/login/codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Não foi possível enviar o código.')

      setCodigoEnviado(true)
      setMensagem(data?.message ?? 'Confira o codigo enviado ao seu WhatsApp.')
      setSegundosReenvio(60)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao enviar o código.')
    } finally {
      setLoading(false)
    }
  }

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (modo === 'CODIGO' && !codigoEnviado) {
      await solicitarCodigo()
      return
    }

    setErro('')
    setMensagem('')
    setLoading(true)

    try {
      const response = await fetch('/api/tecnico/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modo === 'CODIGO'
          ? { whatsapp, codigo, modo: 'CODIGO' }
          : { whatsapp, pin, modo: 'PIN' }),
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

  function trocarModo(novoModo: ModoLogin) {
    setModo(novoModo)
    setErro('')
    setMensagem('')
  }

  return (
    <main className="min-h-screen bg-[#c7d3cf] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <Image src="/logo-chame-o-tecnico.png" alt="Chame o Tecnico" width={650} height={206} className="mx-auto mb-4 h-auto w-[230px]" />
            <h1 className="text-2xl font-bold text-slate-950">Portal do técnico</h1>
            <p className="text-sm text-slate-500">Acesso seguro pelo WhatsApp cadastrado.</p>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-bold">
            <button
              type="button"
              onClick={() => trocarModo('CODIGO')}
              className={`rounded-lg px-3 py-2.5 transition ${modo === 'CODIGO' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
            >
              Código no WhatsApp
            </button>
            <button
              type="button"
              onClick={() => trocarModo('PIN')}
              className={`rounded-lg px-3 py-2.5 transition ${modo === 'PIN' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
            >
              Entrar com PIN
            </button>
          </div>

          {erro && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}
          {mensagem && <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{mensagem}</div>}

          <form onSubmit={entrar} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              WhatsApp cadastrado
              <input
                value={whatsapp}
                onChange={(event) => {
                  setWhatsapp(formatarTelefone(event.target.value))
                  setCodigoEnviado(false)
                  setCodigo('')
                  setMensagem('')
                }}
                inputMode="tel"
                autoComplete="tel"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500"
                placeholder="(67) 99999-9999"
              />
            </label>

            {modo === 'CODIGO' && codigoEnviado && (
              <label className="block text-sm font-semibold text-slate-700">
                Código recebido
                <input
                  value={codigo}
                  onChange={(event) => setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-xl font-bold tracking-[0.35em] outline-none focus:border-emerald-500"
                  placeholder="000000"
                />
              </label>
            )}

            {modo === 'PIN' && (
              <label className="block text-sm font-semibold text-slate-700">
                PIN atual
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 text-lg font-bold tracking-[0.2em] outline-none focus:border-orange-500"
                  placeholder="000000"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-xl px-5 py-4 text-base font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${modo === 'CODIGO' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600'}`}
            >
              {loading
                ? (modo === 'CODIGO' && !codigoEnviado ? 'Enviando código...' : 'Entrando...')
                : (modo === 'CODIGO'
                    ? (codigoEnviado ? 'Entrar com código' : 'Receber código no WhatsApp')
                    : 'Entrar com PIN')}
            </button>

            {modo === 'CODIGO' && codigoEnviado && (
              <button
                type="button"
                onClick={solicitarCodigo}
                disabled={loading || segundosReenvio > 0}
                className="w-full py-2 text-sm font-semibold text-slate-600 disabled:text-slate-400"
              >
                {segundosReenvio > 0 ? `Reenviar em ${segundosReenvio}s` : 'Não recebeu? Enviar outro código'}
              </button>
            )}
          </form>

          {modo === 'CODIGO' && (
            <p className="mt-5 text-center text-xs leading-5 text-slate-500">
              O código expira em 5 minutos e pode ser usado uma única vez.
            </p>
          )}
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
