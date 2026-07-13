'use client'
/* eslint-disable @next/next/no-img-element */

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Dados = { nome: string; vinculo?: string | null; especialidades?: string[] | null; localidade?: string; foto?: string | null; validade?: string | null; valido: boolean }

export default function ValidarCrachaPage() {
  const params = useParams<{ codigo: string }>()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    void fetch(`/api/cracha/${encodeURIComponent(params.codigo)}`).then(async (response) => {
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Crachá não localizado.')
      setDados(payload.data)
    }).catch((error) => setErro(error instanceof Error ? error.message : 'Erro ao validar crachá.'))
  }, [params.codigo])

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl"><div className="bg-slate-950 p-6 text-center"><Image src="/logo-ct.png" alt="Chame o Técnico" width={150} height={65} className="mx-auto h-auto w-[140px] brightness-0 invert" /><p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-slate-300">Validação de profissional</p></div>{erro ? <div className="p-8 text-center font-bold text-red-700">{erro}</div> : !dados ? <div className="p-8 text-center text-slate-500">Validando...</div> : <div className="p-7 text-center">{dados.foto ? <img src={dados.foto} alt={`Foto de ${dados.nome}`} className="mx-auto h-44 w-36 rounded-2xl border-4 border-white object-cover shadow-lg" /> : null}<h1 className="mt-4 text-2xl font-black text-slate-950">{dados.nome}</h1><p className="text-sm font-bold uppercase text-orange-600">{dados.vinculo === 'PROPRIO' ? 'Técnico próprio' : 'Técnico credenciado'}</p><div className={`mx-auto mt-5 rounded-xl p-4 ${dados.valido ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}><p className="text-lg font-black">{dados.valido ? 'CREDENCIAL ATIVA' : 'CREDENCIAL INVÁLIDA'}</p><p className="text-xs font-semibold">{dados.valido ? 'Profissional autorizado pela Chame o Técnico' : 'Este profissional não possui credencial ativa no momento'}</p></div><div className="mt-5 space-y-2 text-sm text-slate-600"><p>{(dados.especialidades ?? []).join(' • ') || 'Assistência técnica'}</p><p className="font-semibold">{dados.localidade || '-'}</p><p className="text-xs">Validade: {dados.validade ? new Date(`${dados.validade}T12:00:00`).toLocaleDateString('pt-BR') : '-'}</p></div></div>}</div></main>
}
