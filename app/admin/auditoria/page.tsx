'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Evento = {
  id: number
  unidade_id?: number | null
  modulo: string
  entidade: string
  entidade_id?: string | null
  acao: 'CRIACAO' | 'ALTERACAO' | 'EXCLUSAO'
  descricao: string
  usuario_nome: string
  usuario_email?: string | null
  valores_anteriores?: Record<string, unknown> | null
  valores_novos?: Record<string, unknown> | null
  campos_alterados?: string[]
  ip?: string | null
  user_agent?: string | null
  criado_em: string
}

type Usuario = { nome: string; email: string }
type Unidade = { id: number; codigo: string; tipo: string; nome_fantasia: string }
type Filtros = {
  busca: string
  modulo: string
  acao: string
  usuario: string
  unidadeId: string
  dataInicio: string
  dataFim: string
}

const hoje = new Date()
const trintaDiasAtras = new Date(hoje)
trintaDiasAtras.setDate(hoje.getDate() - 30)

const filtrosIniciais: Filtros = {
  busca: '',
  modulo: '',
  acao: '',
  usuario: '',
  unidadeId: '',
  dataInicio: trintaDiasAtras.toISOString().slice(0, 10),
  dataFim: hoje.toISOString().slice(0, 10),
}

export default function AuditoriaPage() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [modulos, setModulos] = useState<string[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais)
  const [filtrosAplicados, setFiltrosAplicados] = useState<Filtros>(filtrosIniciais)
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [estruturaPendente, setEstruturaPendente] = useState(false)
  const [aberto, setAberto] = useState<number | null>(null)
  const limite = 50

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const params = new URLSearchParams({ pagina: String(pagina), limite: String(limite) })
      Object.entries(filtrosAplicados).forEach(([chave, valor]) => {
        if (valor) params.set(chave, valor)
      })
      const response = await adminFetch(`/api/admin/auditoria?${params}`, { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar auditoria.')
      setEventos((data?.eventos ?? []) as Evento[])
      setTotal(Number(data?.total ?? 0))
      setModulos((data?.modulos ?? []) as string[])
      setUsuarios((data?.usuarios ?? []) as Usuario[])
      setUnidades((data?.unidades ?? []) as Unidade[])
      setEstruturaPendente(Boolean(data?.estruturaPendente))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar auditoria.')
    } finally {
      setLoading(false)
    }
  }, [filtrosAplicados, pagina])

  useEffect(() => {
    void Promise.resolve().then(carregar)
  }, [carregar])

  const totalPaginas = Math.max(Math.ceil(total / limite), 1)
  const resumo = useMemo(() => ({
    alteracoes: eventos.filter((item) => item.acao === 'ALTERACAO').length,
    criacoes: eventos.filter((item) => item.acao === 'CRIACAO').length,
    exclusoes: eventos.filter((item) => item.acao === 'EXCLUSAO').length,
  }), [eventos])

  function aplicarFiltros() {
    setPagina(1)
    setFiltrosAplicados({ ...filtros })
  }

  function limparFiltros() {
    setFiltros(filtrosIniciais)
    setPagina(1)
    setFiltrosAplicados(filtrosIniciais)
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">Acesso master</p>
        <h1 className="text-3xl font-black text-slate-950">Auditoria do sistema</h1>
        <p className="mt-1 text-sm text-slate-600">
          Registro imutável de usuário, data, origem e valores anteriores e novos.
        </p>
      </header>

      {estruturaPendente && (
        <Aviso classe="border-amber-200 bg-amber-50 text-amber-900">
          Execute o arquivo <b>supabase-add-auditoria-completa.sql</b> no Supabase para ativar a auditoria.
        </Aviso>
      )}
      {erro && <Aviso classe="border-red-200 bg-red-50 text-red-700">{erro}</Aviso>}

      <section className="grid gap-3 sm:grid-cols-3">
        <Resumo label="Alterações nesta página" valor={resumo.alteracoes} classe="border-blue-200 bg-blue-50 text-blue-900" />
        <Resumo label="Criações nesta página" valor={resumo.criacoes} classe="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <Resumo label="Exclusões nesta página" valor={resumo.exclusoes} classe="border-red-200 bg-red-50 text-red-900" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Campo label="Busca">
            <input
              value={filtros.busca}
              onChange={(event) => setFiltros((atual) => ({ ...atual, busca: event.target.value }))}
              onKeyDown={(event) => event.key === 'Enter' && aplicarFiltros()}
              placeholder="OS, usuário ou registro..."
              className={inputClasse}
            />
          </Campo>
          <Campo label="Módulo">
            <select value={filtros.modulo} onChange={(event) => setFiltros((atual) => ({ ...atual, modulo: event.target.value }))} className={inputClasse}>
              <option value="">Todos os módulos</option>
              {modulos.map((item) => <option key={item} value={item}>{rotulo(item)}</option>)}
            </select>
          </Campo>
          <Campo label="Ação">
            <select value={filtros.acao} onChange={(event) => setFiltros((atual) => ({ ...atual, acao: event.target.value }))} className={inputClasse}>
              <option value="">Todas as ações</option>
              <option value="CRIACAO">Criação</option>
              <option value="ALTERACAO">Alteração</option>
              <option value="EXCLUSAO">Exclusão</option>
            </select>
          </Campo>
          <Campo label="Usuário">
            <select value={filtros.usuario} onChange={(event) => setFiltros((atual) => ({ ...atual, usuario: event.target.value }))} className={inputClasse}>
              <option value="">Todos os usuários</option>
              {usuarios.map((item) => <option key={item.email} value={item.email}>{item.nome} — {item.email}</option>)}
            </select>
          </Campo>
          <Campo label="Unidade">
            <select value={filtros.unidadeId} onChange={(event) => setFiltros((atual) => ({ ...atual, unidadeId: event.target.value }))} className={inputClasse}>
              <option value="">Todas as unidades</option>
              {unidades.map((item) => <option key={item.id} value={item.id}>{item.tipo === 'MATRIZ' ? 'Matriz' : 'Filial'} — {item.nome_fantasia}</option>)}
            </select>
          </Campo>
          <Campo label="Data inicial">
            <input type="date" value={filtros.dataInicio} onChange={(event) => setFiltros((atual) => ({ ...atual, dataInicio: event.target.value }))} className={inputClasse} />
          </Campo>
          <Campo label="Data final">
            <input type="date" value={filtros.dataFim} onChange={(event) => setFiltros((atual) => ({ ...atual, dataFim: event.target.value }))} className={inputClasse} />
          </Campo>
          <div className="flex items-end gap-2">
            <button type="button" onClick={aplicarFiltros} className="flex-1 rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-white hover:bg-orange-700">Aplicar</button>
            <button type="button" onClick={limparFiltros} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Limpar</button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-black text-slate-900">{total.toLocaleString('pt-BR')} eventos encontrados</p>
          <button type="button" onClick={() => void carregar()} className="text-sm font-bold text-orange-700 hover:text-orange-800">Atualizar</button>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Carregando auditoria...</p>
        ) : eventos.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Nenhum evento encontrado para os filtros selecionados.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {eventos.map((evento) => (
              <article key={evento.id}>
                <button type="button" onClick={() => setAberto((id) => id === evento.id ? null : evento.id)} className="grid w-full gap-3 p-4 text-left hover:bg-slate-50 md:grid-cols-[155px_125px_1fr_220px_42px] md:items-center">
                  <div>
                    <p className="text-sm font-black text-slate-950">{dataHora(evento.criado_em)}</p>
                    <p className="text-xs text-slate-500">Evento #{evento.id}</p>
                  </div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${acaoClasse(evento.acao)}`}>{rotulo(evento.acao)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{rotulo(evento.modulo)} · {rotulo(evento.entidade)}</p>
                    <p className="truncate text-xs text-slate-600">{evento.entidade_id ? `Registro ${evento.entidade_id} · ` : ''}{campos(evento)}</p>
                  </div>
                  <div>
                    <p className="truncate text-sm font-bold text-slate-900">{evento.usuario_nome}</p>
                    <p className="truncate text-xs text-slate-500">{evento.usuario_email || 'Processo automático'}</p>
                  </div>
                  <span className="text-right text-xl font-black text-slate-400">{aberto === evento.id ? '−' : '+'}</span>
                </button>
                {aberto === evento.id && <Detalhes evento={evento} />}
              </article>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina((valor) => Math.max(valor - 1, 1))} className={botaoPagina}>Anterior</button>
          <p className="text-sm font-bold text-slate-600">Página {pagina} de {totalPaginas}</p>
          <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((valor) => Math.min(valor + 1, totalPaginas))} className={botaoPagina}>Próxima</button>
        </div>
      </section>
    </div>
  )
}

function Detalhes({ evento }: { evento: Evento }) {
  const chaves = [...new Set([
    ...Object.keys(evento.valores_anteriores ?? {}),
    ...Object.keys(evento.valores_novos ?? {}),
  ])].sort()

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 grid gap-3 text-xs md:grid-cols-3">
        <Info label="Descrição" valor={evento.descricao} />
        <Info label="Endereço de acesso" valor={evento.ip || 'Não informado'} />
        <Info label="Navegador/dispositivo" valor={evento.user_agent || 'Não informado'} />
      </div>
      {chaves.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr><th className="p-3">Campo</th><th className="p-3">Valor anterior</th><th className="p-3">Novo valor</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chaves.map((chave) => (
                <tr key={chave}>
                  <td className="p-3 font-black text-slate-800">{rotulo(chave)}</td>
                  <td className="max-w-md break-words bg-red-50/50 p-3 text-slate-700">{formatarValor(evento.valores_anteriores?.[chave])}</td>
                  <td className="max-w-md break-words bg-emerald-50/50 p-3 text-slate-700">{formatarValor(evento.valores_novos?.[chave])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-slate-500">Este evento não possui campos comparáveis.</p>}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600">{label}</span>{children}</label>
}

function Resumo({ label, valor, classe }: { label: string; valor: number; classe: string }) {
  return <div className={`rounded-2xl border p-4 ${classe}`}><p className="text-xs font-black uppercase tracking-wide">{label}</p><p className="mt-1 text-2xl font-black">{valor}</p></div>
}

function Aviso({ classe, children }: { classe: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border p-4 text-sm font-bold ${classe}`}>{children}</div>
}

function Info({ label, valor }: { label: string; valor: string }) {
  return <div><p className="font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-slate-800">{valor}</p></div>
}

function dataHora(value: string) {
  return new Date(value).toLocaleString('pt-BR')
}

function rotulo(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letra) => letra.toUpperCase())
}

function campos(evento: Evento) {
  const lista = evento.campos_alterados ?? []
  return lista.length ? `${lista.length} campo(s): ${lista.slice(0, 4).map(rotulo).join(', ')}${lista.length > 4 ? '...' : ''}` : evento.descricao
}

function formatarValor(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function acaoClasse(acao: Evento['acao']) {
  if (acao === 'CRIACAO') return 'bg-emerald-100 text-emerald-800'
  if (acao === 'EXCLUSAO') return 'bg-red-100 text-red-800'
  return 'bg-blue-100 text-blue-800'
}

const inputClasse = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-orange-500'
const botaoPagina = 'rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
