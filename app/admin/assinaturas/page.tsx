'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Assinatura = {
  id: number
  plano: string
  ciclo: string
  status: string
  valor: number
  proximo_vencimento: string
  saas_clientes?: { nome?: string; email?: string; cnpj?: string } | Array<{ nome?: string; email?: string; cnpj?: string }>
}

const hojeMaisUmDia = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

export default function AssinaturasPage() {
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([])
  const [configurado, setConfigurado] = useState(false)
  const [ambiente, setAmbiente] = useState('sandbox')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [form, setForm] = useState({
    nome: '', email: '', cnpj: '', telefone: '', plano: 'ESSENCIAL', ciclo: 'MENSAL', formaPagamento: 'PIX', proximoVencimento: hojeMaisUmDia(),
  })

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const response = await adminFetch('/api/admin/assinaturas', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar as assinaturas.')
      setAssinaturas(Array.isArray(data?.assinaturas) ? data.assinaturas : [])
      setConfigurado(Boolean(data?.configurado))
      setAmbiente(String(data?.ambiente ?? 'sandbox'))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar as assinaturas.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  async function criarAssinatura(event: FormEvent) {
    event.preventDefault()
    setErro('')
    setSucesso('')
    setSalvando(true)
    try {
      const response = await adminFetch('/api/admin/assinaturas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível criar a assinatura.')
      setSucesso(ambiente === 'production'
        ? 'Assinatura criada. O Asaas enviará a cobrança ao cliente.'
        : 'Assinatura criada no Sandbox. Nenhuma cobrança real foi gerada.')
      setForm((atual) => ({ ...atual, nome: '', email: '', cnpj: '', telefone: '' }))
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível criar a assinatura.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">Comercial CT Premium</p>
        <h1 className="mt-1 text-3xl font-black">Assinaturas e mensalidades</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">Aqui você cobra a assinatura do CT Premium das oficinas clientes. Isso não altera o financeiro usado dentro das oficinas.</p>
        <div className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-black ${ambiente === 'production' ? 'bg-red-500 text-white' : 'bg-amber-300 text-slate-950'}`}>
          {ambiente === 'production' ? 'PRODUÇÃO — cobranças reais' : 'SANDBOX — somente testes'}
        </div>
      </section>

      {!configurado && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-black">Asaas ainda não está conectado.</p>
          <p className="mt-1">Antes de criar cobranças, cadastre as variáveis seguras <code>ASAAS_API_KEY</code>, <code>ASAAS_ENV=sandbox</code> e <code>ASAAS_WEBHOOK_TOKEN</code> no servidor.</p>
        </div>
      )}

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}
      {sucesso && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{sucesso}</div>}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">Nova assinatura</h2>
        <p className="mt-1 text-sm text-slate-500">A primeira cobrança será criada no vencimento informado; as próximas serão recorrentes.</p>
        <form onSubmit={criarAssinatura} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Campo label="Nome / razão social" value={form.nome} required onChange={(nome) => setForm({ ...form, nome })} />
          <Campo label="E-mail para cobrança" value={form.email} type="email" required onChange={(email) => setForm({ ...form, email })} />
          <Campo label="CPF ou CNPJ (opcional)" value={form.cnpj} onChange={(cnpj) => setForm({ ...form, cnpj })} />
          <Campo label="Celular (opcional)" value={form.telefone} onChange={(telefone) => setForm({ ...form, telefone })} />
          <Selecao label="Plano" value={form.plano} onChange={(plano) => setForm({ ...form, plano })} options={[['ESSENCIAL', 'Essencial — R$ 79/mês'], ['PROFISSIONAL', 'Profissional — R$ 129/mês'], ['COMPLETO', 'Completo — R$ 179/mês']]} />
          <Selecao label="Ciclo" value={form.ciclo} onChange={(ciclo) => setForm({ ...form, ciclo })} options={[['MENSAL', 'Mensal'], ['ANUAL', 'Anual com promoção']]} />
          <Selecao label="Forma de pagamento" value={form.formaPagamento} onChange={(formaPagamento) => setForm({ ...form, formaPagamento })} options={[['PIX', 'Pix'], ['BOLETO', 'Boleto']]} />
          <Campo label="Primeiro vencimento" value={form.proximoVencimento} type="date" required onChange={(proximoVencimento) => setForm({ ...form, proximoVencimento })} />
          <div className="md:col-span-2 xl:col-span-4 flex justify-end">
            <button disabled={salvando || !configurado} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
              {salvando ? 'Criando assinatura...' : 'Criar cobrança recorrente'}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <h2 className="text-xl font-black text-slate-950">Assinaturas cadastradas</h2>
          <button type="button" onClick={() => void carregar()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">Atualizar</button>
        </div>
        {carregando ? <p className="p-5 text-sm text-slate-500">Carregando...</p> : assinaturas.length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhuma assinatura cadastrada ainda.</p> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Plano</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Vencimento</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{assinaturas.map((assinatura) => { const cliente = Array.isArray(assinatura.saas_clientes) ? assinatura.saas_clientes[0] : assinatura.saas_clientes; return <tr key={assinatura.id} className="border-t border-slate-100"><td className="px-5 py-4 font-bold text-slate-900"><div>{cliente?.nome ?? 'Cliente'}</div><div className="text-xs font-normal text-slate-500">{cliente?.email}</div></td><td className="px-5 py-4">{assinatura.plano} · {assinatura.ciclo}</td><td className="px-5 py-4">{Number(assinatura.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td className="px-5 py-4">{assinatura.proximo_vencimento}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{assinatura.status.replaceAll('_', ' ')}</span></td></tr> })}</tbody></table></div>
        )}
      </section>
    </div>
  )
}

function Campo({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block text-xs font-black uppercase tracking-wide text-slate-600">{label}<input value={value} type={type} required={required} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium normal-case outline-none focus:border-blue-600" /></label>
}

function Selecao({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="block text-xs font-black uppercase tracking-wide text-slate-600">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium normal-case outline-none focus:border-blue-600">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}
