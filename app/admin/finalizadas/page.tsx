'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getUnidadeSelecionadaId } from '@/lib/unidade-client'

type OrdemServico = {
  id: number
  numero_os: string
  status: string
  modelo: string
  categoria_nome?: string
  marca_nome?: string
  created_at: string
  cliente_nome?: string
}

type OrdemServicoSupabase = {
  id: number
  numero_os: string
  status: string
  modelo: string
  created_at: string
  clientes?: RelacaoNome | RelacaoNome[] | null
  categorias?: RelacaoNome | RelacaoNome[] | null
  marcas?: RelacaoNome | RelacaoNome[] | null
}

type RelacaoNome = { nome: string | null }

export default function FinalizadasPage() {
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [loading, setLoading] = useState(true)

  const carregarOrdens = useCallback(async () => {
    setLoading(true)

    const unidadeId = getUnidadeSelecionadaId()
    let query = supabase
      .from('ordens_servico')
      .select(`
        id,
        numero_os,
        status,
        modelo,
        created_at,
        clientes:cliente_id (
          nome
        ),
        categorias:categoria_id (
          nome
        ),
        marcas:marca_id (
          nome
        )
      `)
      .eq('status', 'FINALIZADA')
      .order('created_at', { ascending: false })
    if (unidadeId) query = query.eq('unidade_id', unidadeId)
    const { data, error } = await query

    if (!error && data) {
      setOrdens(
        (data as unknown as OrdemServicoSupabase[]).map((item) => ({
          id: item.id,
          numero_os: item.numero_os,
          status: item.status,
          modelo: item.modelo,
          categoria_nome: primeiraRelacao(item.categorias)?.nome ?? '',
          marca_nome: primeiraRelacao(item.marcas)?.nome ?? '',
          created_at: item.created_at,
          cliente_nome: primeiraRelacao(item.clientes)?.nome ?? '-',
        }))
      )
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(carregarOrdens)
  }, [carregarOrdens])

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          Cofre de OS Finalizadas
        </h1>

        <p className="text-slate-500">
          Ordens encerradas e protegidas
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left">OS</th>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left">Equipamento</th>
              <th className="px-4 py-3 text-left">Finalizada em</th>
              <th className="px-4 py-3 text-left">Ações</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center">
                  Carregando...
                </td>
              </tr>
            ) : ordens.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center">
                  Nenhuma OS finalizada.
                </td>
              </tr>
            ) : (
              ordens.map((os) => (
                <tr key={os.id} className="border-t">
                  <td className="px-4 py-3 font-medium">
                    {os.numero_os}
                  </td>

                  <td className="px-4 py-3">
                    {os.cliente_nome}
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {formatarEquipamento(os)}
                  </td>

                  <td className="px-4 py-3">
                    {new Date(os.created_at).toLocaleString('pt-BR')}
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/os/${os.id}`}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-white"
                    >
                      Visualizar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}

function primeiraRelacao(relacao?: RelacaoNome | RelacaoNome[] | null) {
  return Array.isArray(relacao) ? relacao[0] : relacao
}

function formatarEquipamento(os: OrdemServico) {
  return [os.categoria_nome, os.marca_nome, os.modelo].filter(Boolean).join(' / ') || '-'
}
