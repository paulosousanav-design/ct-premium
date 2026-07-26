'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Evento = {
  id: number
  tipo: 'ERRO' | 'ALERTA' | 'SAUDE'
  gravidade: 'INFO' | 'ATENCAO' | 'CRITICO'
  status: 'ABERTO' | 'RESOLVIDO' | 'IGNORADO'
  modulo: string
  origem: string
  rota?: string | null
  metodo?: string | null
  codigo?: string | null
  mensagem: string
  detalhes?: Record<string, unknown> | null
  ocorrencias: number
  primeira_ocorrencia_em: string
  ultima_ocorrencia_em: string
  resolvido_em?: string | null
  resolvido_por_nome?: string | null
  resolucao_observacao?: string | null
}

type Saude = {
  status: 'SAUDAVEL' | 'ATENCAO' | 'FALHA'
  latenciaMs: number
  verificadoEm: string
  verificacoes: Array<{ tabela: string; critica: boolean; ok: boolean; erro?: string | null }>
  storage: Array<{ nome: string; critica: boolean; ok: boolean; erro?: string | null }>
}

type Resumo = { abertos: number; criticos: number; recorrentes: number; ultimas24h: number }
type Filtros = { busca: string; status: string; gravidade: string; modulo: string }

const filtrosIniciais: Filtros = { busca: '', status: 'ABERTO', gravidade: '', modulo: '' }

export default function MonitoramentoPage() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [saude, setSaude] = useState<Saude | null>(null)
  const [resumo, setResumo] = useState<Resumo>({ abertos: 0, criticos: 0, recorrentes: 0, ultimas24h: 0 })
  const [modulos, setModulos] = useState<string[]>([])
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais)
  const [aplicados, setAplicados] = useState<Filtros>(filtrosIniciais)
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [estruturaPendente, setEstruturaPendente] = useState(false)
  const [aberto, setAberto] = useState<number | null>(null)
  const [observacoes, setObservacoes] = useState<Record<number, string>>({})
  const [salvando, setSalvando] = useState<number | null>(null)
  const limite = 50

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    setErro('')
    try {
      const params = new URLSearchParams({ pagina: String(pagina), limite: String(limite) })
      Object.entries(aplicados).forEach(([chave, valor]) => valor && params.set(chave, valor))
      const response = await adminFetch(`/api/admin/monitoramento?${params}`, { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar monitoramento.')
      setEventos((data?.eventos ?? []) as Evento[])
      setSaude((data?.saude ?? null) as Saude | null)
      setResumo((data?.resumo ?? { abertos: 0, criticos: 0, recorrentes: 0, ultimas24h: 0 }) as Resumo)
      setModulos((data?.modulos ?? []) as string[])
      setTotal(Number(data?.total ?? 0))
      setEstruturaPendente(Boolean(data?.estruturaPendente))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar monitoramento.')
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [aplicados, pagina])

  useEffect(() => {
    void Promise.resolve().then(() => carregar())
    const timer = window.setInterval(() => void carregar(true), 30_000)
    return () => window.clearInterval(timer)
  }, [carregar])

  const totalPaginas = Math.max(Math.ceil(total / limite), 1)
  const componentesFalhos = useMemo(() => saude
    ? [...saude.verificacoes, ...saude.storage].filter((item) => !item.ok)
    : [], [saude])

  async function alterarEvento(evento: Evento, acao: 'RESOLVER' | 'IGNORAR' | 'REABRIR') {
    setSalvando(evento.id)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/monitoramento', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: evento.id, acao, observacao: observacoes[evento.id] ?? '' }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao atualizar evento.')
      setMensagem(acao === 'RESOLVER' ? 'Evento marcado como resolvido.' : acao === 'IGNORAR' ? 'Evento ignorado.' : 'Evento reaberto.')
      setAberto(null)
      await carregar(true)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao atualizar evento.')
    } finally {
      setSalvando(null)
    }
  }

  function aplicarFiltros() {
    setPagina(1)
    setAplicados({ ...filtros })
  }

  function limparFiltros() {
    setFiltros(filtrosIniciais)
    setPagina(1)
    setAplicados(filtrosIniciais)
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-600">Acesso master</p>
          <h1 className="text-3xl font-black text-slate-950">Monitoramento e alertas</h1>
          <p className="mt-1 text-sm text-slate-600">Saúde da infraestrutura, falhas de APIs e erros reincidentes.</p>
        </div>
        <button type="button" onClick={() => void carregar()} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">Verificar agora</button>
      </header>

      {estruturaPendente && <Aviso classe="border-amber-200 bg-amber-50 text-amber-900">Execute o arquivo <b>supabase-add-monitoramento-sistema.sql</b> no Supabase.</Aviso>}
      {erro && <Aviso classe="border-red-200 bg-red-50 text-red-700">{erro}</Aviso>}
      {mensagem && <Aviso classe="border-emerald-200 bg-emerald-50 text-emerald-700">{mensagem}</Aviso>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <ResumoCard label="Saúde do sistema" valor={saude?.status ?? 'VERIFICANDO'} tom={saude?.status === 'SAUDAVEL' ? 'green' : saude?.status === 'ATENCAO' ? 'amber' : 'red'} />
        <ResumoCard label="Alertas abertos" valor={resumo.abertos} tom={resumo.abertos ? 'amber' : 'green'} />
        <ResumoCard label="Críticos" valor={resumo.criticos} tom={resumo.criticos ? 'red' : 'green'} />
        <ResumoCard label="Reincidentes (3+)" valor={resumo.recorrentes} tom={resumo.recorrentes ? 'red' : 'slate'} />
        <ResumoCard label="Ocorridos em 24h" valor={resumo.ultimas24h} tom="blue" />
      </section>

      {saude && (
        <section className={`rounded-2xl border p-4 shadow-sm ${saude.status === 'SAUDAVEL' ? 'border-emerald-200 bg-emerald-50' : saude.status === 'ATENCAO' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-black text-slate-950">Diagnóstico da infraestrutura</h2>
              <p className="text-sm text-slate-600">{saude.latenciaMs} ms · verificado em {dataHora(saude.verificadoEm)}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-800">{saude.verificacoes.filter((item) => item.ok).length + saude.storage.filter((item) => item.ok).length}/{saude.verificacoes.length + saude.storage.length} componentes saudáveis</span>
          </div>
          {componentesFalhos.length > 0
            ? <div className="mt-3 flex flex-wrap gap-2">{componentesFalhos.map((item) => <span key={'tabela' in item ? item.tabela : item.nome} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-red-700">{'tabela' in item ? item.tabela : `Storage ${item.nome}`}</span>)}</div>
            : <p className="mt-3 text-sm font-bold text-emerald-800">Todos os bancos e armazenamentos verificados estão disponíveis.</p>}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Campo label="Busca">
            <input value={filtros.busca} onChange={(event) => setFiltros((atual) => ({ ...atual, busca: event.target.value }))} onKeyDown={(event) => event.key === 'Enter' && aplicarFiltros()} placeholder="Mensagem, rota ou código..." className={inputClasse} />
          </Campo>
          <Campo label="Status">
            <select value={filtros.status} onChange={(event) => setFiltros((atual) => ({ ...atual, status: event.target.value }))} className={inputClasse}>
              <option value="">Todos</option><option value="ABERTO">Abertos</option><option value="RESOLVIDO">Resolvidos</option><option value="IGNORADO">Ignorados</option>
            </select>
          </Campo>
          <Campo label="Gravidade">
            <select value={filtros.gravidade} onChange={(event) => setFiltros((atual) => ({ ...atual, gravidade: event.target.value }))} className={inputClasse}>
              <option value="">Todas</option><option value="CRITICO">Crítico</option><option value="ATENCAO">Atenção</option><option value="INFO">Informativo</option>
            </select>
          </Campo>
          <Campo label="Módulo">
            <select value={filtros.modulo} onChange={(event) => setFiltros((atual) => ({ ...atual, modulo: event.target.value }))} className={inputClasse}>
              <option value="">Todos</option>{modulos.map((item) => <option key={item} value={item}>{rotulo(item)}</option>)}
            </select>
          </Campo>
          <div className="flex items-end gap-2">
            <button type="button" onClick={aplicarFiltros} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-700">Aplicar</button>
            <button type="button" onClick={limparFiltros} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">Limpar</button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-black text-slate-900">{total.toLocaleString('pt-BR')} eventos encontrados</div>
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Executando diagnóstico...</p>
          : eventos.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Nenhum alerta encontrado. O sistema está operando sem falhas registradas.</p>
            : <div className="divide-y divide-slate-200">{eventos.map((evento) => (
              <article key={evento.id}>
                <button type="button" onClick={() => setAberto((id) => id === evento.id ? null : evento.id)} className="grid w-full gap-3 p-4 text-left hover:bg-slate-50 md:grid-cols-[115px_150px_1fr_170px_42px] md:items-center">
                  <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${gravidadeClasse(evento.gravidade)}`}>{rotulo(evento.gravidade)}</span>
                  <div><p className="text-xs font-black text-slate-900">{rotulo(evento.modulo)}</p><p className="text-xs text-slate-500">{evento.origem}</p></div>
                  <div className="min-w-0"><p className="truncate text-sm font-black text-slate-950">{evento.mensagem}</p><p className="truncate text-xs text-slate-500">{evento.metodo} {evento.rota || 'Origem interna'}{evento.codigo ? ` · ${evento.codigo}` : ''}</p></div>
                  <div><p className="text-sm font-black text-slate-900">{evento.ocorrencias} ocorrência(s)</p><p className="text-xs text-slate-500">{dataHora(evento.ultima_ocorrencia_em)}</p></div>
                  <span className="text-right text-xl font-black text-slate-400">{aberto === evento.id ? '−' : '+'}</span>
                </button>
                {aberto === evento.id && (
                  <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 text-xs md:grid-cols-4">
                      <Info label="Primeira ocorrência" valor={dataHora(evento.primeira_ocorrencia_em)} />
                      <Info label="Última ocorrência" valor={dataHora(evento.ultima_ocorrencia_em)} />
                      <Info label="Status" valor={rotulo(evento.status)} />
                      <Info label="Identificador" valor={`#${evento.id}`} />
                    </div>
                    {evento.detalhes && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-200">{JSON.stringify(evento.detalhes, null, 2)}</pre>}
                    {evento.status === 'ABERTO' ? (
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <Campo label="Observação da resolução">
                          <input value={observacoes[evento.id] ?? ''} onChange={(event) => setObservacoes((atual) => ({ ...atual, [evento.id]: event.target.value }))} placeholder="O que foi verificado ou corrigido?" className={inputClasse} />
                        </Campo>
                        <div className="flex gap-2">
                          <button disabled={salvando === evento.id} onClick={() => void alterarEvento(evento, 'RESOLVER')} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Resolver</button>
                          <button disabled={salvando === evento.id} onClick={() => void alterarEvento(evento, 'IGNORAR')} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">Ignorar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-slate-600">{evento.resolvido_por_nome ? `${rotulo(evento.status)} por ${evento.resolvido_por_nome}` : rotulo(evento.status)}{evento.resolucao_observacao ? ` · ${evento.resolucao_observacao}` : ''}</p>
                        <button disabled={salvando === evento.id} onClick={() => void alterarEvento(evento, 'REABRIR')} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">Reabrir</button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}</div>}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <button disabled={pagina <= 1} onClick={() => setPagina((valor) => Math.max(valor - 1, 1))} className={botaoPagina}>Anterior</button>
          <p className="text-sm font-bold text-slate-600">Página {pagina} de {totalPaginas}</p>
          <button disabled={pagina >= totalPaginas} onClick={() => setPagina((valor) => Math.min(valor + 1, totalPaginas))} className={botaoPagina}>Próxima</button>
        </div>
      </section>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 flex-1"><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600">{label}</span>{children}</label>
}

function ResumoCard({ label, valor, tom }: { label: string; valor: string | number; tom: 'green' | 'amber' | 'red' | 'blue' | 'slate' }) {
  const classes = { green: 'border-emerald-200 bg-emerald-50 text-emerald-900', amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-900', blue: 'border-blue-200 bg-blue-50 text-blue-900', slate: 'border-slate-200 bg-white text-slate-900' }
  return <div className={`rounded-2xl border p-4 ${classes[tom]}`}><p className="text-xs font-black uppercase tracking-wide">{label}</p><p className="mt-1 text-2xl font-black">{valor}</p></div>
}

function Aviso({ classe, children }: { classe: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border p-4 text-sm font-bold ${classe}`}>{children}</div>
}

function Info({ label, valor }: { label: string; valor: string }) {
  return <div><p className="font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-slate-800">{valor}</p></div>
}

function gravidadeClasse(gravidade: Evento['gravidade']) {
  if (gravidade === 'CRITICO') return 'bg-red-100 text-red-800'
  if (gravidade === 'ATENCAO') return 'bg-amber-100 text-amber-800'
  return 'bg-blue-100 text-blue-800'
}

function dataHora(value: string) {
  return new Date(value).toLocaleString('pt-BR')
}

function rotulo(value: string) {
  return String(value).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letra) => letra.toUpperCase())
}

const inputClasse = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-red-500'
const botaoPagina = 'rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
