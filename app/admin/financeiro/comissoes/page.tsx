'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Tecnico = { id: number; responsavel?: string | null; nome_fantasia?: string | null; periodicidade_comissao?: string | null }
type Elegivel = { os_id: number; numero_os: string; parceiro_id: number; data_pagamento?: string | null; valor_pecas_venda: number; valor_mao_obra_venda: number; percentual_pecas: number; percentual_mao_obra: number; comissao_pecas: number; comissao_mao_obra: number }
type Fechamento = { id: number; parceiro_id: number; periodo_inicio: string; periodo_fim: string; periodicidade: string; status: string; total_pecas_venda: number; total_mao_obra_venda: number; total_comissao_pecas: number; total_comissao_mao_obra: number; total_ajustes: number; total_comissao: number; criado_por_nome: string; criado_por_email: string; criado_em: string; pago_por_nome?: string | null; pago_em?: string | null; forma_pagamento?: string | null; parceiros?: { responsavel?: string | null; nome_fantasia?: string | null } | null }
type Item = { id: number; fechamento_id: number; os_id?: number | null; tipo: string; descricao?: string | null; valor_pecas_venda: number; valor_mao_obra_venda: number; comissao_pecas: number; comissao_mao_obra: number; valor_ajuste: number }
type Payload = { estruturaPendente: boolean; tecnicos: Tecnico[]; elegiveis: Elegivel[]; fechamentos: Fechamento[]; itens: Item[] }

function periodoInicial() { const hoje = new Date(); return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10), fim: hoje.toISOString().slice(0, 10) } }

export default function ComissoesPage() {
  const [periodo] = useState(periodoInicial)
  const [inicio, setInicio] = useState(periodo.inicio)
  const [fim, setFim] = useState(periodo.fim)
  const [parceiroId, setParceiroId] = useState('TODOS')
  const [data, setData] = useState<Payload>({ estruturaPendente: false, tecnicos: [], elegiveis: [], fechamentos: [], itens: [] })
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [abertoId, setAbertoId] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true); setErro('')
    try {
      const params = new URLSearchParams({ inicio, fim })
      if (parceiroId !== 'TODOS') params.set('parceiroId', parceiroId)
      const response = await adminFetch(`/api/admin/comissoes?${params}`)
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar comissões.')
      setData(payload as Payload)
    } catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao carregar comissões.') }
    finally { setLoading(false) }
  }, [fim, inicio, parceiroId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const elegiveisPorTecnico = useMemo(() => data.tecnicos.map((tecnico) => {
    const itens = data.elegiveis.filter((item) => item.parceiro_id === tecnico.id)
    return { tecnico, itens, total: itens.reduce((a, i) => a + i.comissao_pecas + i.comissao_mao_obra, 0) }
  }).filter((grupo) => grupo.itens.length > 0), [data])

  async function acao(body: Record<string, unknown>, sucesso: string) {
    setSalvando(true); setErro(''); setMensagem('')
    try {
      const response = await adminFetch('/api/admin/comissoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Não foi possível concluir a operação.')
      setMensagem(sucesso); await carregar()
    } catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao atualizar comissões.') }
    finally { setSalvando(false) }
  }

  function fechar(tecnico: Tecnico) { void acao({ acao: 'FECHAR', parceiroId: tecnico.id, inicio, fim }, `Comissão de ${nomeTecnico(tecnico)} fechada.`) }
  function pagar(fechamento: Fechamento) { const forma = window.prompt('Forma de pagamento: PIX, CARTAO, DEPOSITO, BOLETO ou DINHEIRO', 'PIX'); if (forma) void acao({ acao: 'PAGAR', id: fechamento.id, forma }, 'Pagamento da comissão registrado.') }
  function ajustar(fechamento: Fechamento) { const valor = window.prompt('Valor do ajuste (use negativo para desconto):', '0'); if (valor === null) return; const descricao = window.prompt('Motivo obrigatório do ajuste:'); if (descricao) void acao({ acao: 'AJUSTAR', id: fechamento.id, valor: Number(valor.replace(',', '.')), descricao }, 'Ajuste registrado.') }

  return <main className="min-h-screen bg-slate-100 p-4 md:p-6"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h1 className="text-2xl font-black text-slate-950">Fechamento de comissões</h1><p className="text-sm text-slate-500">Técnicos próprios • comissão sobre venda • OS totalmente recebidas</p></div><Link href="/admin/financeiro" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Voltar ao Financeiro</Link></header>
    {data.estruturaPendente && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">Execute o arquivo supabase-add-comissoes-tecnicos.sql no SQL Editor do Supabase para liberar esta área.</div>}
    {erro && <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}{mensagem && <div className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{mensagem}</div>}
    <section className="rounded-xl bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-4"><Campo label="Início"><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input" /></Campo><Campo label="Fim"><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="input" /></Campo><Campo label="Técnico"><select value={parceiroId} onChange={(e) => setParceiroId(e.target.value)} className="input"><option value="TODOS">Todos</option>{data.tecnicos.map((t) => <option key={t.id} value={t.id}>{nomeTecnico(t)}</option>)}</select></Campo><button onClick={() => void carregar()} className="self-end rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-black text-white">Atualizar</button></div></section>
    <section className="rounded-xl bg-white p-4 shadow-sm"><h2 className="mb-3 text-lg font-black">Pendentes de fechamento</h2>{loading ? <p>Carregando...</p> : elegiveisPorTecnico.length === 0 ? <p className="text-sm text-slate-500">Nenhuma OS quitada pendente neste período.</p> : <div className="grid gap-3 lg:grid-cols-2">{elegiveisPorTecnico.map(({ tecnico, itens, total }) => <div key={tecnico.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{nomeTecnico(tecnico)}</p><p className="text-xs font-bold text-slate-500">{itens.length} OS • {tecnico.periodicidade_comissao ?? 'MENSAL'}</p></div><p className="text-lg font-black text-emerald-700">{moeda(total)}</p></div><div className="mt-3 space-y-1 text-xs">{itens.map((item) => <div key={item.os_id} className="flex justify-between rounded bg-slate-50 px-3 py-2"><span>{item.numero_os}</span><b>{moeda(item.comissao_pecas + item.comissao_mao_obra)}</b></div>)}</div><button disabled={salvando} onClick={() => fechar(tecnico)} className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Fechar período</button></div>)}</div>}</section>
    <section className="rounded-xl bg-white p-4 shadow-sm"><h2 className="mb-3 text-lg font-black">Fechamentos realizados</h2><div className="space-y-3">{data.fechamentos.map((f) => { const itens = data.itens.filter((i) => i.fechamento_id === f.id); return <div key={f.id} className="rounded-xl border border-slate-200 p-4"><button type="button" onClick={() => setAbertoId(abertoId === f.id ? null : f.id)} className="flex w-full items-center justify-between gap-4 text-left"><div><p className="font-black">{nomeTecnico(f.parceiros)} • {dataPt(f.periodo_inicio)} a {dataPt(f.periodo_fim)}</p><p className="text-xs text-slate-500">Fechado por {f.criado_por_nome} ({f.criado_por_email})</p></div><div className="text-right"><p className="text-lg font-black">{moeda(f.total_comissao)}</p><p className={`text-xs font-black ${f.status === 'PAGO' ? 'text-emerald-700' : 'text-amber-700'}`}>{f.status}</p></div></button>{abertoId === f.id && <div className="mt-4 border-t pt-3"><div className="grid gap-2 text-sm sm:grid-cols-3"><Resumo label="Comissão peças" value={moeda(f.total_comissao_pecas)} /><Resumo label="Comissão mão de obra" value={moeda(f.total_comissao_mao_obra)} /><Resumo label="Ajustes" value={moeda(f.total_ajustes)} /></div><div className="mt-3 space-y-1">{itens.map((i) => <div key={i.id} className="flex justify-between rounded bg-slate-50 px-3 py-2 text-xs"><span>{i.tipo === 'AJUSTE' ? `Ajuste: ${i.descricao}` : i.descricao}</span><b>{moeda(i.tipo === 'AJUSTE' ? i.valor_ajuste : i.comissao_pecas + i.comissao_mao_obra)}</b></div>)}</div>{f.status === 'FECHADO' && <div className="mt-3 flex gap-2"><button disabled={salvando} onClick={() => ajustar(f)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Adicionar ajuste</button><button disabled={salvando} onClick={() => pagar(f)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Marcar pago</button></div>}{f.status === 'PAGO' && <p className="mt-3 text-xs font-bold text-emerald-700">Pago em {f.pago_em ? dataHora(f.pago_em) : '-'} por {f.pago_por_nome ?? '-'} via {f.forma_pagamento ?? '-'}</p>}</div>}</div>})}</div></section>
  </div><style jsx>{`.input{width:100%;height:42px;border:1px solid #cbd5e1;border-radius:8px;padding:0 12px;font-size:14px}`}</style></main>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-black text-slate-600">{label}<div className="mt-1">{children}</div></label> }
function Resumo({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="font-black">{value}</p></div> }
function nomeTecnico(item?: { responsavel?: string | null; nome_fantasia?: string | null } | null) { return item?.responsavel || item?.nome_fantasia || 'Técnico' }
function moeda(value: number | string | null | undefined) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0)) }
function dataPt(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') }
function dataHora(value: string) { return new Date(value).toLocaleString('pt-BR') }
