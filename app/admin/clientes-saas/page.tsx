'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Organizacao = {
  id: number; nome: string; slug: string; plano: string; status: string; criado_em: string
  saas_clientes?: { nome?: string; email?: string } | Array<{ nome?: string; email?: string }>
  admin_usuarios?: Array<{ id: number }>
}

const inicial = { nome: '', responsavel: '', email: '', senha: '', cnpj: '', telefone: '', plano: 'ESSENCIAL' }

export default function ClientesSaasPage() {
  const [itens, setItens] = useState<Organizacao[]>([])
  const [form, setForm] = useState(inicial)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [organizacaoPendente, setOrganizacaoPendente] = useState<Organizacao | null>(null)
  const [senhaReparo, setSenhaReparo] = useState('')
  const [reparando, setReparando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await adminFetch('/api/admin/clientes-saas')
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error ?? 'Não foi possível carregar as oficinas.')
      setItens(d?.data ?? [])
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar.') } finally { setCarregando(false) }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  async function salvar(event: FormEvent) {
    event.preventDefault(); setSalvando(true); setErro(''); setMensagem('')
    try {
      const r = await adminFetch('/api/admin/clientes-saas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error ?? 'Não foi possível liberar o acesso.')
      setMensagem('Oficina criada. Entregue ao responsável o e-mail e a senha inicial cadastrados.')
      setForm(inicial); await carregar()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao liberar acesso.') } finally { setSalvando(false) }
  }

  async function repararAcesso(event: FormEvent) {
    event.preventDefault()
    if (!organizacaoPendente) return
    setReparando(true); setErro('')
    try {
      const r = await adminFetch('/api/admin/clientes-saas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'liberar-acesso', organizacaoId: organizacaoPendente.id, senha: senhaReparo }) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error ?? 'Não foi possível liberar o acesso.')
      setMensagem('Acesso liberado. Entregue ao responsável o e-mail e a senha inicial informados.')
      setOrganizacaoPendente(null); setSenhaReparo(''); await carregar()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao liberar acesso.') } finally { setReparando(false) }
  }

  return <main className="mx-auto max-w-7xl space-y-5">
    <header className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-400">Plataforma CT Premium</p><h1 className="mt-1 text-3xl font-black">Oficinas clientes e acessos</h1><p className="mt-2 text-sm text-slate-300">Cada oficina criada aqui recebe dados, empresa e administrador próprios. Nenhum cliente acessa informações de outro cliente.</p></header>
    {erro && <Aviso classe="bg-red-50 text-red-700">{erro}</Aviso>}{mensagem && <Aviso classe="bg-emerald-50 text-emerald-700">{mensagem}</Aviso>}
    <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">Liberar nova oficina</h2><p className="mt-1 text-sm text-slate-500">Crie a oficina depois de registrar a assinatura no Asaas. A senha inicial deve ser enviada somente ao responsável.</p>
      <form onSubmit={salvar} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Campo label="Nome da oficina" value={form.nome} onChange={(nome) => setForm({ ...form, nome })} required/><Campo label="Responsável" value={form.responsavel} onChange={(responsavel) => setForm({ ...form, responsavel })}/><Campo label="E-mail de acesso" value={form.email} type="email" onChange={(email) => setForm({ ...form, email })} required/><Campo label="Senha inicial" value={form.senha} type="password" onChange={(senha) => setForm({ ...form, senha })} required/><Campo label="CNPJ (opcional)" value={form.cnpj} onChange={(cnpj) => setForm({ ...form, cnpj })}/><Campo label="Celular (opcional)" value={form.telefone} onChange={(telefone) => setForm({ ...form, telefone })}/><label className="block text-xs font-black uppercase text-slate-600">Plano<select value={form.plano} onChange={(event) => setForm({ ...form, plano: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium"><option value="ESSENCIAL">Essencial</option><option value="PROFISSIONAL">Profissional</option><option value="COMPLETO">Completo</option></select></label><div className="flex items-end"><button disabled={salvando} className="w-full rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{salvando ? 'Criando...' : 'Criar oficina e liberar acesso'}</button></div></form>
    </section>
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-black">Oficinas cadastradas</h2></div>{carregando ? <p className="p-5 text-sm text-slate-500">Carregando...</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Oficina</th><th className="px-5 py-3">Plano</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Acesso</th></tr></thead><tbody>{itens.map((item) => { const cliente = Array.isArray(item.saas_clientes) ? item.saas_clientes[0] : item.saas_clientes; const temAcesso = Boolean(item.admin_usuarios?.length); return <tr key={item.id} className="border-t"><td className="px-5 py-4 font-bold"><div>{item.nome}</div><small className="font-normal text-slate-500">{cliente?.email ?? item.slug}</small></td><td className="px-5 py-4">{item.plano}</td><td className="px-5 py-4"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">{item.status}</span></td><td className="px-5 py-4 text-slate-600">{temAcesso ? 'Administrador próprio' : <button type="button" onClick={() => setOrganizacaoPendente(item)} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-200">Liberar acesso pendente</button>}</td></tr> })}{!itens.length && <tr><td colSpan={4} className="p-8 text-center text-slate-500">Nenhuma oficina cliente cadastrada.</td></tr>}</tbody></table></div>}</section>
    {organizacaoPendente && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={repararAcesso} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-black">Liberar acesso pendente</h2><p className="mt-2 text-sm text-slate-600">Defina uma senha inicial para <strong>{organizacaoPendente.nome}</strong>. O e-mail será o que aparece na linha da oficina.</p><Campo label="Senha inicial" value={senhaReparo} type="password" onChange={setSenhaReparo} required/><div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => { setOrganizacaoPendente(null); setSenhaReparo('') }} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancelar</button><button disabled={reparando} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{reparando ? 'Liberando...' : 'Liberar acesso'}</button></div></form></div>}
  </main>
}

function Campo({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="block text-xs font-black uppercase text-slate-600">{label}<input value={value} type={type} required={required} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium normal-case outline-none focus:border-blue-600" /></label> }
function Aviso({ classe, children }: { classe: string; children: React.ReactNode }) { return <div className={`rounded-xl p-4 text-sm font-bold ${classe}`}>{children}</div> }
