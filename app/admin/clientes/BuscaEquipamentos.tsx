'use client'

import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type RelacaoNome = { nome?: string | null } | Array<{ nome?: string | null }> | null
type ClienteEquipamento = {
  id: number
  nome?: string | null
  cpf_cnpj?: string | null
  whatsapp?: string | null
  cidade?: string | null
  estado?: string | null
}
type OrdemHistorico = {
  id: number
  numero_os?: string | null
  created_at?: string | null
  status?: string | null
  defeito?: string | null
  diagnostico_tecnico?: string | null
  servico_executado?: string | null
}
type Equipamento = {
  id: number
  cliente_id: number
  modelo: string
  numero_serie?: string | null
  categorias?: RelacaoNome
  marcas?: RelacaoNome
  clientes?: ClienteEquipamento | ClienteEquipamento[] | null
  total_os: number
  ultima_os?: string | null
  ultimo_atendimento?: string | null
  status_atual?: string | null
  garantia_asc?: { ativa: boolean; ate: string; origem_numero_os?: string | null; servico_executado?: string | null } | null
  historico: OrdemHistorico[]
}

export default function BuscaEquipamentos() {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<Equipamento[]>([])
  const [buscando, setBuscando] = useState(false)
  const [pesquisado, setPesquisado] = useState(false)
  const [erro, setErro] = useState('')
  const [abertoId, setAbertoId] = useState<number | null>(null)

  async function pesquisar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busca.trim().length < 2) {
      setErro('Digite ao menos dois caracteres.')
      return
    }
    setBuscando(true)
    setPesquisado(true)
    setErro('')
    try {
      const response = await adminFetch(`/api/admin/clientes/equipamentos/busca?busca=${encodeURIComponent(busca.trim())}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao buscar equipamentos.')
      setResultados((payload?.equipamentos ?? []) as Equipamento[])
    } catch (error) {
      setResultados([])
      setErro(error instanceof Error ? error.message : 'Erro ao buscar equipamentos.')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-blue-50 px-4 py-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Consulta rápida</p>
        <h2 className="mt-1 text-xl font-black text-slate-950">Buscar equipamento e histórico</h2>
        <p className="mt-1 text-sm text-slate-600">Pesquise pelo número de série, cliente, CPF/CNPJ, telefone, modelo ou número da OS.</p>
        <form onSubmit={pesquisar} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Ex.: número de série ou nome do cliente" className="h-11 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none focus:border-blue-500" />
          <button disabled={buscando} className="h-11 rounded-lg bg-blue-700 px-6 text-sm font-black text-white disabled:opacity-50">{buscando ? 'Buscando...' : 'Buscar equipamento'}</button>
        </form>
        {erro && <p className="mt-2 text-sm font-bold text-red-700">{erro}</p>}
      </div>

      {pesquisado && !buscando && !erro && resultados.length === 0 && <p className="p-5 text-sm text-slate-500">Nenhum equipamento encontrado.</p>}
      {resultados.length > 0 && (
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {resultados.map((equipamento) => {
            const cliente = primeiro(equipamento.clientes)
            const aberto = abertoId === equipamento.id
            return (
              <article key={equipamento.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase text-orange-600">{nomeRelacao(equipamento.categorias)} · {nomeRelacao(equipamento.marcas)}</p>
                    <h3 className="text-lg font-black text-slate-950">{equipamento.modelo || 'Equipamento sem modelo'}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-600">Série: {equipamento.numero_serie || 'não informada'}</p>
                  </div>
                  {equipamento.garantia_asc?.ativa && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Garantia ASC até {dataCurta(equipamento.garantia_asc.ate)}</span>}
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-black text-slate-950">{cliente?.nome || 'Cliente não localizado'}</p>
                  <p className="text-slate-600">{cliente?.cpf_cnpj || 'Sem CPF/CNPJ'} · {cliente?.whatsapp || 'Sem telefone'}</p>
                  <p className="text-xs text-slate-500">{[cliente?.cidade, cliente?.estado].filter(Boolean).join(' / ') || 'Cidade não informada'}</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <Resumo label="Atendimentos" valor={String(equipamento.total_os)} />
                  <Resumo label="Última OS" valor={equipamento.ultima_os || '-'} />
                  <Resumo label="Status" valor={status(equipamento.status_atual)} />
                </div>
                {equipamento.garantia_asc?.ativa && equipamento.garantia_asc.servico_executado && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-bold text-emerald-800">Serviço coberto: {equipamento.garantia_asc.servico_executado}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/admin/os?nova=1&clienteId=${equipamento.cliente_id}&equipamentoId=${equipamento.id}`} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-black text-white">Abrir nova OS</Link>
                  <button type="button" onClick={() => setAbertoId(aberto ? null : equipamento.id)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-black text-slate-700">{aberto ? 'Ocultar histórico' : `Ver histórico (${equipamento.total_os})`}</button>
                </div>
                {aberto && <Historico ordens={equipamento.historico} />}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Historico({ ordens }: { ordens: OrdemHistorico[] }) {
  if (!ordens.length) return <p className="mt-3 text-xs text-slate-500">Este equipamento ainda não possui OS vinculada.</p>
  return <div className="mt-4 space-y-2 border-t pt-3">{ordens.map((ordem) => <div key={ordem.id} className="rounded-lg border border-slate-200 p-3 text-xs"><div className="flex justify-between gap-3"><Link href={`/admin/os/${ordem.id}`} className="font-black text-blue-700">{ordem.numero_os || `OS #${ordem.id}`}</Link><span className="font-bold text-slate-500">{dataCurta(ordem.created_at)}</span></div><p className="mt-1 text-slate-700"><b>Defeito:</b> {ordem.defeito || '-'}</p><p className="text-slate-700"><b>Serviço:</b> {ordem.servico_executado || '-'}</p></div>)}</div>
}

function Resumo({ label, valor }: { label: string; valor: string }) { return <div className="rounded-lg bg-slate-100 p-2"><p className="font-bold text-slate-500">{label}</p><p className="mt-1 truncate font-black text-slate-900" title={valor}>{valor}</p></div> }
function primeiro<T>(valor: T | T[] | null | undefined) { return Array.isArray(valor) ? valor[0] : valor }
function nomeRelacao(valor?: RelacaoNome) { return primeiro(valor)?.nome || 'Não informado' }
function dataCurta(valor?: string | null) { return valor ? new Date(valor).toLocaleDateString('pt-BR') : '-' }
function status(valor?: string | null) { return String(valor ?? 'SEM OS').replaceAll('_', ' ') }
