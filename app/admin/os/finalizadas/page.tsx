'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type OSItem = {
  id: number
  numero_os: string | null
  status: string | null
  prioridade: string | null
  garantia: boolean | null
  total: number | string | null
  created_at: string
  finalizada_em: string | null
  modelo: string | null
  categoria_id: number | null
  marca_id: number | null
  cliente_id: number | null
  cliente_nome?: string | null
  categoria_nome?: string | null
  marca_nome?: string | null
}

export default function FinalizadasPage() {
  const router = useRouter()

  const [lista, setLista] = useState<OSItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    void carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    setErro('')

    try {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select(
          'id, numero_os, status, prioridade, garantia, total, created_at, finalizada_em, modelo, categoria_id, marca_id, cliente_id'
        )
        .eq('status', 'FINALIZADA')
        .order('finalizada_em', { ascending: false, nullsFirst: false })

      if (error) throw error

      const ordens = data ?? []
      const clienteIds = Array.from(
        new Set(ordens.map((item) => item.cliente_id).filter(Boolean))
      ) as number[]
      const categoriaIds = Array.from(
        new Set(ordens.map((item) => item.categoria_id).filter(Boolean))
      ) as number[]
      const marcaIds = Array.from(
        new Set(ordens.map((item) => item.marca_id).filter(Boolean))
      ) as number[]

      let clientesMap = new Map<number, string | null>()
      let categoriasMap = new Map<number, string | null>()
      let marcasMap = new Map<number, string | null>()

      if (clienteIds.length > 0) {
        const { data: clientesData, error: clientesError } = await supabase
          .from('clientes')
          .select('id, nome')
          .in('id', clienteIds)

        if (clientesError) throw clientesError

        clientesMap = new Map((clientesData ?? []).map((c) => [c.id, c.nome ?? null]))
      }

      if (categoriaIds.length > 0) {
        const { data: categoriasData, error: categoriasError } = await supabase
          .from('categorias')
          .select('id, nome')
          .in('id', categoriaIds)

        if (categoriasError) throw categoriasError

        categoriasMap = new Map((categoriasData ?? []).map((c) => [c.id, c.nome ?? null]))
      }

      if (marcaIds.length > 0) {
        const { data: marcasData, error: marcasError } = await supabase
          .from('marcas')
          .select('id, nome')
          .in('id', marcaIds)

        if (marcasError) throw marcasError

        marcasMap = new Map((marcasData ?? []).map((m) => [m.id, m.nome ?? null]))
      }

      const formatado: OSItem[] = ordens.map((item) => ({
        ...item,
        cliente_nome: item.cliente_id ? clientesMap.get(item.cliente_id) ?? '-' : '-',
        categoria_nome: item.categoria_id ? categoriasMap.get(item.categoria_id) ?? null : null,
        marca_nome: item.marca_id ? marcasMap.get(item.marca_id) ?? null : null,
      }))

      setLista(formatado)
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao carregar as finalizadas.'))
    } finally {
      setLoading(false)
    }
  }

  const filtradas = useMemo(() => {
    const termo = busca.toLowerCase().trim()
    if (!termo) return lista

    return lista.filter((item) => {
      const texto = [
        item.numero_os,
        item.cliente_nome,
        item.categoria_nome,
        item.marca_nome,
        item.modelo,
        item.prioridade,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return texto.includes(termo)
    })
  }, [lista, busca])

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">
                Ordens Finalizadas
              </p>
              <h1 className="text-3xl font-bold text-slate-900">Tela de finalizadas</h1>
              <p className="mt-1 text-slate-500">
                Essas OS ficam bloqueadas para edição até desbloqueio com senha master.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/os')}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Voltar para OS
              </button>

              <button
                onClick={carregar}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              >
                Atualizar
              </button>
            </div>
          </div>
        </header>

        {erro && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">
            {erro}
          </div>
        )}

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Pesquisar</h2>
              <p className="text-sm text-slate-500">Busque por OS, cliente ou equipamento.</p>
            </div>

            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar..."
              className="w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-emerald-500 md:w-80"
            />
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Lista de finalizadas</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {filtradas.length} registros
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3">OS</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Equipamento</th>
                  <th className="px-4 py-3">Garantia</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Finalizada em</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                      Carregando...
                    </td>
                  </tr>
                ) : filtradas.length > 0 ? (
                  filtradas.map((os) => (
                    <tr key={os.id} className="border-t hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {os.numero_os ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{os.cliente_nome ?? '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                        {formatarEquipamento(os)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            os.garantia
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {os.garantia ? 'SIM' : 'NÃO'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {formatCurrency(toNumber(os.total))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {formatDate(os.finalizada_em ?? os.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => router.push(`/admin/os/${os.id}`)}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                        >
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                      Nenhuma OS finalizada encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR')
}

function formatarEquipamento(os: OSItem) {
  return [os.categoria_nome, os.marca_nome, os.modelo].filter(Boolean).join(' / ') || '-'
}

function formatarErro(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return fallback
}
