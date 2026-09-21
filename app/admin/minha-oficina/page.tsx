'use client'

import { FormEvent, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Oficina = Record<string, string | null>
const campos = [['nome_fantasia', 'Nome da oficina'], ['razao_social', 'Razão social'], ['cnpj', 'CNPJ'], ['telefone', 'Telefone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['cep', 'CEP'], ['logradouro', 'Endereço'], ['numero', 'Número'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['estado', 'UF'], ['complemento', 'Complemento'], ['regime_tributario', 'Regime tributário'], ['inscricao_estadual', 'Inscrição estadual'], ['inscricao_municipal', 'Inscrição municipal']] as const

export default function MinhaOficinaPage() {
  const [form, setForm] = useState<Oficina>({})
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { void (async () => { const r = await adminFetch('/api/admin/minha-oficina'); const d = await r.json().catch(() => null); if (!r.ok) setErro(d?.error ?? 'Não foi possível carregar a oficina.'); else setForm(d.data ?? {}) })() }, [])
  async function salvar(event: FormEvent) { event.preventDefault(); setSalvando(true); setErro(''); const r = await adminFetch('/api/admin/minha-oficina', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const d = await r.json().catch(() => null); setSalvando(false); if (!r.ok) setErro(d?.error ?? 'Não foi possível salvar.'); else setMensagem('Dados da oficina atualizados.') }
  return <main className="mx-auto max-w-5xl space-y-5"><header className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">P4 Integra</p><h1 className="mt-1 text-3xl font-black">Minha oficina</h1><p className="mt-2 text-sm text-slate-300">Estas informações pertencem somente à sua oficina e às suas filiais.</p></header>{erro && <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</p>}{mensagem && <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{mensagem}</p>}<form onSubmit={salvar} className="grid gap-4 rounded-2xl bg-white p-6 shadow-sm md:grid-cols-2">{campos.map(([chave, label]) => <label key={chave} className="text-xs font-black uppercase text-slate-600">{label}<input value={form[chave] ?? ''} onChange={(e) => setForm({ ...form, [chave]: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium normal-case outline-none focus:border-blue-600" /></label>)}<div className="md:col-span-2 flex justify-end"><button disabled={salvando} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar dados da oficina'}</button></div></form></main>
}
