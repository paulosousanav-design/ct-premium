'use client'

import Link from 'next/link'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Relacao = { nome?: string | null } | Array<{ nome?: string | null }> | null
type Ordem = {
  id: number
  numero_os?: string | null
  status_financeiro?: string | null
  total?: number | string | null
  cliente_total?: number | string | null
  valor_recebido_cliente?: number | string | null
  desconto_recebimento_cliente?: number | string | null
  iss_retido_cliente?: number | string | null
  clientes?: Relacao
}
type Parcela = {
  id: number
  os_id: number
  numero_parcela: number
  total_parcelas: number
  valor: number | string
  vencimento: string
  status: string
  recebido_em?: string | null
  criado_por: string
  recebido_por?: string | null
  juros?: number | string | null
  multa?: number | string | null
  desconto_baixa?: number | string | null
  iss_retido?: number | string | null
  valor_recebido?: number | string | null
  ordens_servico?: { numero_os?: string | null; clientes?: Relacao } | null
}
type Baixa = { parcela: Parcela; juros: string; multa: string; desconto: string; issRetido: string }

export default function ParcelamentosPage() {
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [estruturaPendente, setEstruturaPendente] = useState(false)
  const [acrescimosPendente, setAcrescimosPendente] = useState(false)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [parcelaEdicaoId, setParcelaEdicaoId] = useState('')
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [osId, setOsId] = useState('')
  const [quantidade, setQuantidade] = useState('2')
  const [intervaloDias, setIntervaloDias] = useState('30')
  const [vencimento, setVencimento] = useState(hoje())
  const [baixa, setBaixa] = useState<Baixa | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/parcelamentos')
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar parcelamentos.')
      setOrdens(payload?.ordens ?? [])
      setParcelas(payload?.parcelas ?? [])
      setEstruturaPendente(Boolean(payload?.estruturaPendente))
      setAcrescimosPendente(Boolean(payload?.acrescimosPendente))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar parcelamentos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const ordensDisponiveis = useMemo(
    () => ordens.filter((os) => saldo(os) > 0 && !parcelas.some((parcela) => parcela.os_id === os.id && parcela.status !== 'CANCELADO')),
    [ordens, parcelas]
  )
  const grupos = useMemo(() => {
    const mapa = new Map<number, Parcela[]>()
    for (const parcela of parcelas) mapa.set(parcela.os_id, [...(mapa.get(parcela.os_id) ?? []), parcela])
    return [...mapa.entries()].map(([id, itens]) => ({ id, itens }))
  }, [parcelas])
  const parcelasPendentes = useMemo(() => parcelas.filter((parcela) => parcela.status === 'PENDENTE'), [parcelas])

  async function requisicao(method: 'POST' | 'PATCH', body: Record<string, unknown>, sucesso: string) {
    setSalvando(true)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/parcelamentos', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Operacao nao concluida.')
      setMensagem(sucesso)
      setBaixa(null)
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao atualizar parcelamento.')
    } finally {
      setSalvando(false)
    }
  }

  function criar() {
    if (!osId) return setErro('Selecione uma OS.')
    void requisicao('POST', { osId: Number(osId), quantidade: Number(quantidade), intervaloDias: Number(intervaloDias), primeiroVencimento: vencimento }, 'Parcelamento criado com sucesso.')
  }

  function editar(parcela: Parcela) {
    const valor = window.prompt('Novo valor da parcela:', Number(parcela.valor).toFixed(2).replace('.', ','))
    if (valor === null) return
    const vencimentoNovo = window.prompt('Novo vencimento (AAAA-MM-DD):', parcela.vencimento)
    if (!vencimentoNovo) return
    void requisicao('PATCH', { id: parcela.id, acao: 'EDITAR', valor: Number(valor.replace(',', '.')), vencimento: vencimentoNovo }, `Parcela ${parcela.numero_parcela}/${parcela.total_parcelas} atualizada.`)
  }

  function confirmarBaixa() {
    if (!baixa) return
    void requisicao('PATCH', {
      id: baixa.parcela.id,
      acao: 'RECEBER',
      juros: numero(baixa.juros),
      multa: numero(baixa.multa),
      desconto: numero(baixa.desconto),
      issRetido: numero(baixa.issRetido),
    }, `Parcela ${baixa.parcela.numero_parcela}/${baixa.parcela.total_parcelas} recebida com os valores atualizados.`)
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950">Recebimentos parcelados</h1>
            <p className="text-sm text-slate-500">Controle individual de boletos, vencimentos, juros e retencoes</p>
          </div>
          <Link href="/admin/financeiro" className="rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-bold text-white">Voltar ao Financeiro</Link>
        </header>

        {estruturaPendente && <Aviso cor="amber">Execute o arquivo supabase-add-recebimento-parcelado.sql no Supabase para liberar esta area.</Aviso>}
        {acrescimosPendente && <Aviso cor="amber">Execute o arquivo supabase-add-acrescimos-iss-recebimentos.sql para receber com juros, multa, desconto e ISS retido.</Aviso>}
        {erro && <Aviso cor="red">{erro}</Aviso>}
        {mensagem && <Aviso cor="green">{mensagem}</Aviso>}

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-black">Novo parcelamento em boleto</h2>
          <div className="grid gap-3 lg:grid-cols-[2fr_130px_150px_180px_auto]">
            <Campo label="OS"><select value={osId} onChange={(event) => setOsId(event.target.value)} className="input"><option value="">Selecione uma OS com saldo</option>{ordensDisponiveis.map((os) => <option key={os.id} value={os.id}>{os.numero_os} - {nomeCliente(os.clientes)} - saldo {moeda(saldo(os))}</option>)}</select></Campo>
            <Campo label="Parcelas"><input type="number" min="2" max="60" value={quantidade} onChange={(event) => setQuantidade(event.target.value)} className="input" /></Campo>
            <Campo label="Intervalo (dias)"><input type="number" min="1" max="365" value={intervaloDias} onChange={(event) => setIntervaloDias(event.target.value)} className="input" /></Campo>
            <Campo label="1º vencimento"><input type="date" value={vencimento} onChange={(event) => setVencimento(event.target.value)} className="input" /></Campo>
            <button type="button" disabled={salvando || estruturaPendente} onClick={criar} className="self-end rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Gerar parcelas</button>
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-black">Editar parcela pendente</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <select value={parcelaEdicaoId} onChange={(event) => setParcelaEdicaoId(event.target.value)} className="input"><option value="">Selecione uma parcela</option>{parcelasPendentes.map((parcela) => <option key={parcela.id} value={parcela.id}>{parcela.ordens_servico?.numero_os ?? `OS #${parcela.os_id}`} - {parcela.numero_parcela}/{parcela.total_parcelas} - {dataPt(parcela.vencimento)} - {moeda(Number(parcela.valor))}</option>)}</select>
            <button type="button" disabled={salvando || !parcelaEdicaoId} onClick={() => { const parcela = parcelasPendentes.find((item) => item.id === Number(parcelaEdicaoId)); if (parcela) editar(parcela) }} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 disabled:opacity-50">Alterar valor e vencimento</button>
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-black">Parcelamentos cadastrados</h2>
          {loading ? <p className="text-sm text-slate-500">Carregando...</p> : grupos.length === 0 ? <p className="text-sm text-slate-500">Nenhum parcelamento cadastrado.</p> : (
            <div className="space-y-4">{grupos.map(({ id, itens }) => {
              const primeira = itens[0]
              const pendente = itens.filter((item) => item.status === 'PENDENTE').reduce((total, item) => total + Number(item.valor), 0)
              return <div key={id} className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex flex-col gap-2 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-950">{primeira.ordens_servico?.numero_os ?? `OS #${id}`} - {nomeCliente(primeira.ordens_servico?.clientes)}</p><p className="text-xs font-semibold text-slate-500">{itens.length} parcelas - criado por {primeira.criado_por}</p></div><p className="font-black text-orange-700">Em aberto: {moeda(pendente)}</p></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-3">Parcela</th><th className="p-3">Vencimento</th><th className="p-3">Valor original</th><th className="p-3">Ajustes da baixa</th><th className="p-3">Recebido</th><th className="p-3">Situacao</th><th className="p-3">Baixa</th><th className="p-3">Acoes</th></tr></thead><tbody>{itens.map((parcela) => <tr key={parcela.id} className="border-t"><td className="p-3 font-bold">{parcela.numero_parcela}/{parcela.total_parcelas}</td><td className={`p-3 ${vencida(parcela) ? 'font-bold text-red-700' : ''}`}>{dataPt(parcela.vencimento)}</td><td className="p-3 font-black">{moeda(Number(parcela.valor))}</td><td className="p-3 text-xs">{parcela.status === 'RECEBIDO' ? <><span className="text-emerald-700">Juros {moeda(numero(parcela.juros))} · Multa {moeda(numero(parcela.multa))}</span><br /><span className="text-slate-500">Desconto {moeda(numero(parcela.desconto_baixa))} · ISS {moeda(numero(parcela.iss_retido))}</span></> : '-'}</td><td className="p-3 font-black text-emerald-700">{parcela.status === 'RECEBIDO' ? moeda(numero(parcela.valor_recebido)) : '-'}</td><td className="p-3"><Status parcela={parcela} /></td><td className="p-3 text-xs">{parcela.recebido_em ? `${dataHora(parcela.recebido_em)} - ${parcela.recebido_por ?? '-'}` : '-'}</td><td className="p-3">{parcela.status === 'PENDENTE' && <div className="flex gap-2"><button disabled={salvando || acrescimosPendente} onClick={() => setBaixa({ parcela, juros: '0', multa: '0', desconto: '0', issRetido: '0' })} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">Receber</button><button disabled={salvando} onClick={() => void requisicao('PATCH', { id: parcela.id, acao: 'CANCELAR' }, 'Parcela cancelada.')} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-black">Cancelar</button></div>}</td></tr>)}</tbody></table></div>
              </div>
            })}</div>
          )}
        </section>
      </div>

      {baixa && <ModalBaixa baixa={baixa} setBaixa={setBaixa} salvando={salvando} confirmar={confirmarBaixa} />}
      <style jsx>{`.input{height:42px;width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:0 12px;font-size:14px}`}</style>
    </main>
  )
}

function ModalBaixa({ baixa, setBaixa, salvando, confirmar }: { baixa: Baixa; setBaixa: (value: Baixa | null) => void; salvando: boolean; confirmar: () => void }) {
  const original = numero(baixa.parcela.valor)
  const juros = numero(baixa.juros)
  const multa = numero(baixa.multa)
  const desconto = numero(baixa.desconto)
  const iss = numero(baixa.issRetido)
  const principal = Math.max(original - desconto - iss, 0)
  const caixa = principal + juros + multa
  const invalido = desconto < 0 || iss < 0 || juros < 0 || multa < 0 || desconto + iss > original
  const alterar = (campo: keyof Omit<Baixa, 'parcela'>, value: string) => setBaixa({ ...baixa, [campo]: value })
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-emerald-700">Baixa de boleto</p><h2 className="text-xl font-black">Parcela {baixa.parcela.numero_parcela}/{baixa.parcela.total_parcelas}</h2><p className="text-sm text-slate-500">Valor original: {moeda(original)}</p></div><button type="button" onClick={() => setBaixa(null)} className="rounded-lg border px-3 py-1 text-sm font-bold">Fechar</button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><Campo label="Juros recebidos"><input type="number" min="0" step="0.01" value={baixa.juros} onChange={(event) => alterar('juros', event.target.value)} className="input-modal" /></Campo><Campo label="Multa recebida"><input type="number" min="0" step="0.01" value={baixa.multa} onChange={(event) => alterar('multa', event.target.value)} className="input-modal" /></Campo><Campo label="Desconto concedido"><input type="number" min="0" step="0.01" value={baixa.desconto} onChange={(event) => alterar('desconto', event.target.value)} className="input-modal" /></Campo><Campo label="ISS retido pelo tomador"><input type="number" min="0" step="0.01" value={baixa.issRetido} onChange={(event) => alterar('issRetido', event.target.value)} className="input-modal" /></Campo></div>
    <div className="mt-5 grid gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-3"><Resumo label="Principal recebido" value={principal} /><Resumo label="ISS retido" value={iss} /><Resumo label="Entrada no caixa" value={caixa} destaque /></div>
    {invalido && <p className="mt-3 text-sm font-bold text-red-700">Desconto e ISS retido, somados, nao podem ultrapassar o valor original.</p>}
    <button type="button" disabled={salvando || invalido || (caixa <= 0 && iss <= 0)} onClick={confirmar} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{salvando ? 'Registrando...' : `Confirmar recebimento de ${moeda(caixa)}`}</button>
    <style jsx>{`.input-modal{margin-top:4px;height:42px;width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:0 12px;font-size:14px}`}</style>
  </div></div>
}

function Campo({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-black text-slate-600">{label}<div className="mt-1">{children}</div></label> }
function Resumo({ label, value, destaque = false }: { label: string; value: number; destaque?: boolean }) { return <div><p className="text-xs font-bold text-slate-500">{label}</p><p className={`font-black ${destaque ? 'text-lg text-emerald-700' : 'text-slate-950'}`}>{moeda(value)}</p></div> }
function Aviso({ cor, children }: { cor: 'red' | 'green' | 'amber'; children: ReactNode }) { const classe = cor === 'red' ? 'bg-red-50 text-red-700' : cor === 'green' ? 'bg-emerald-50 text-emerald-700' : 'border border-amber-200 bg-amber-50 text-amber-800'; return <div className={`rounded-xl p-4 text-sm font-bold ${classe}`}>{children}</div> }
function Status({ parcela }: { parcela: Parcela }) { const classe = parcela.status === 'RECEBIDO' ? 'bg-emerald-100 text-emerald-700' : parcela.status === 'CANCELADO' ? 'bg-slate-100 text-slate-600' : vencida(parcela) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'; return <span className={`rounded-full px-2 py-1 text-xs font-black ${classe}`}>{parcela.status === 'PENDENTE' && vencida(parcela) ? 'VENCIDO' : parcela.status}</span> }
function saldo(os: Ordem) { return Math.max(Number(os.cliente_total ?? os.total ?? 0) - Number(os.valor_recebido_cliente ?? 0) - Number(os.desconto_recebimento_cliente ?? 0) - Number(os.iss_retido_cliente ?? 0), 0) }
function nomeCliente(relacao?: Relacao) { const item = Array.isArray(relacao) ? relacao[0] : relacao; return item?.nome ?? '-' }
function numero(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
function moeda(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) }
function hoje() { return new Date().toISOString().slice(0, 10) }
function dataPt(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') }
function dataHora(value: string) { return new Date(value).toLocaleString('pt-BR') }
function vencida(parcela: Parcela) { return parcela.status === 'PENDENTE' && parcela.vencimento < hoje() }
