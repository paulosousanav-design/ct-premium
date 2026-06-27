'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type AbaFinanceiro = 'receber' | 'tecnicos'
type FiltroFinanceiro = 'TODOS' | 'PENDENTE' | 'FATURADO' | 'RECEBIDO'

type RelacaoNome = { nome?: string | null; responsavel?: string | null; nome_fantasia?: string | null; razao_social?: string | null }

type OrdemFinanceira = {
  id: number
  numero_os: string | null
  created_at: string | null
  status: string | null
  status_financeiro: string | null
  data_pagamento?: string | null
  total: number | string | null
  tecnico_total?: number | string | null
  tecnico_status_pagamento?: string | null
  tecnico_pago_em?: string | null
  cliente_total?: number | string | null
  parceiro_id?: number | null
  garantia?: boolean | null
  tipo_atendimento?: string | null
  numero_nota_fiscal?: string | null
  clientes?: RelacaoNome | RelacaoNome[] | null
  parceiros?: RelacaoNome | RelacaoNome[] | null
}

type DocumentoTecnico = {
  id: number
  os_id?: number | null
  parceiro_id: number | null
  tipo: string | null
  valor: number | string | null
  nome_arquivo: string | null
  url: string | null
  observacao: string | null
  status: string | null
  criado_em: string | null
  pago_em?: string | null
}

type HistoricoFinanceiro = {
  id: number
  os_id: number | null
  documento_id: number | null
  tipo: string | null
  status_anterior: string | null
  status_novo: string | null
  valor: number | string | null
  descricao: string | null
  responsavel: string | null
  criado_em: string | null
}

export default function FinanceiroPage() {
  const [aba, setAba] = useState<AbaFinanceiro>('tecnicos')
  const [ordens, setOrdens] = useState<OrdemFinanceira[]>([])
  const [documentos, setDocumentos] = useState<DocumentoTecnico[]>([])
  const [historico, setHistorico] = useState<HistoricoFinanceiro[]>([])
  const [documentosPendentes, setDocumentosPendentes] = useState(false)
  const [historicoPendente, setHistoricoPendente] = useState(false)
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<FiltroFinanceiro>('TODOS')
  const [busca, setBusca] = useState('')

  const carregarDados = useCallback(async () => {
    setLoading(true)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/financeiro')
      const data = await response.json().catch(() => null)

      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar financeiro.')

      setOrdens((data?.ordens ?? []) as OrdemFinanceira[])
      setDocumentos((data?.documentos ?? []) as DocumentoTecnico[])
      setHistorico((data?.historico ?? []) as HistoricoFinanceiro[])
      setDocumentosPendentes(Boolean(data?.documentosPendentes))
      setHistoricoPendente(Boolean(data?.historicoPendente))
    } catch (error) {
      setErro(formatarErro(error, 'Erro ao carregar financeiro.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(carregarDados)
  }, [carregarDados])

  const ordensRecebimentoFiltradas = useMemo(() => {
    return ordens.filter((os) => {
      const statusFinanceiro = os.status_financeiro ?? 'PENDENTE'
      const texto = `${os.numero_os ?? ''} ${nomeCliente(os)} ${nomeTecnico(os)}`.toLowerCase()
      const atendeFiltro = filtro === 'TODOS' || statusFinanceiro === filtro
      const atendeBusca = !busca.trim() || texto.includes(busca.trim().toLowerCase())
      return os.status === 'FINALIZADA' && valorCliente(os) > 0 && atendeFiltro && atendeBusca
    })
  }, [busca, filtro, ordens])

  const ordensTecnicos = useMemo(() => {
    return ordens.filter((os) => {
      const texto = `${os.numero_os ?? ''} ${nomeCliente(os)} ${nomeTecnico(os)}`.toLowerCase()
      const atendeBusca = !busca.trim() || texto.includes(busca.trim().toLowerCase())
      const statusPagamentoTecnico = tecnicoPago(os) ? 'RECEBIDO' : 'PENDENTE'
      const atendeFiltro = filtro === 'TODOS' || filtro === statusPagamentoTecnico

      return os.status === 'FINALIZADA' && Boolean(os.parceiro_id) && valorTecnico(os) > 0 && atendeFiltro && atendeBusca
    })
  }, [busca, filtro, ordens])

  const resumo = useMemo(() => {
    const ordensFinalizadas = ordens.filter((os) => os.status === 'FINALIZADA')
    const receberCliente = ordensFinalizadas
      .filter((os) => !ehGarantidorOuSeguradora(os) && os.status_financeiro !== 'RECEBIDO' && valorCliente(os) > 0)
      .reduce((acc, os) => acc + valorCliente(os), 0)
    const recebidoCliente = ordensFinalizadas
      .filter((os) => !ehGarantidorOuSeguradora(os) && os.status_financeiro === 'RECEBIDO' && valorCliente(os) > 0)
      .reduce((acc, os) => acc + valorCliente(os), 0)
    const receberGarantidor = ordensFinalizadas
      .filter((os) => ehGarantidorOuSeguradora(os) && os.status_financeiro !== 'RECEBIDO' && valorCliente(os) > 0)
      .reduce((acc, os) => acc + valorCliente(os), 0)
    const recebidoGarantidor = ordensFinalizadas
      .filter((os) => ehGarantidorOuSeguradora(os) && os.status_financeiro === 'RECEBIDO' && valorCliente(os) > 0)
      .reduce((acc, os) => acc + valorCliente(os), 0)
    const pagarTecnico = ordensFinalizadas
      .filter((os) => !tecnicoPago(os) && valorTecnico(os) > 0)
      .reduce((acc, os) => acc + valorTecnico(os), 0)
    const pagoTecnico = ordensFinalizadas
      .filter((os) => tecnicoPago(os) && valorTecnico(os) > 0)
      .reduce((acc, os) => acc + valorTecnico(os), 0)

    return {
      receberCliente,
      recebidoCliente,
      receberGarantidor,
      recebidoGarantidor,
      totalRecebido: recebidoCliente + recebidoGarantidor,
      caixaGeral: recebidoCliente + recebidoGarantidor - pagoTecnico,
      pagarTecnico,
      pagoTecnico,
      finalizadasTecnico: ordensFinalizadas.filter((os) => Boolean(os.parceiro_id) && valorTecnico(os) > 0).length,
    }
  }, [ordens])

  async function alterarFinanceiro(id: number, status: FiltroFinanceiro) {
    if (status === 'TODOS') return
    setSalvandoId(id)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/financeiro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'OS', id, status }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao atualizar financeiro.')
      await carregarDados()
    } catch (error) {
      setErro(formatarErro(error, 'Erro ao atualizar financeiro.'))
    } finally {
      setSalvandoId(null)
    }
  }

  async function marcarDocumentoPago(id: number) {
    setSalvandoId(id)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/financeiro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'DOCUMENTO', id }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao atualizar documento do tecnico.')
      await carregarDados()
    } catch (error) {
      setErro(formatarErro(error, 'Erro ao atualizar documento do tecnico.'))
    } finally {
      setSalvandoId(null)
    }
  }

  async function marcarTecnicoPago(id: number) {
    setSalvandoId(id)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/financeiro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'TECNICO', id }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao pagar tecnico.')
      await carregarDados()
    } catch (error) {
      setErro(formatarErro(error, 'Erro ao pagar tecnico.'))
    } finally {
      setSalvandoId(null)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Financeiro</h1>
          <p className="text-sm text-slate-500">Recebimentos de OS e pagamentos de tecnicos.</p>
        </div>

        <button onClick={carregarDados} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">
          Atualizar
        </button>
      </header>

      {erro && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Card titulo="A receber cliente" valor={formatCurrency(resumo.receberCliente)} cor="orange" />
        <Card titulo="Recebido cliente" valor={formatCurrency(resumo.recebidoCliente)} cor="green" />
        <Card titulo="Caixa geral" valor={formatCurrency(resumo.caixaGeral)} cor="blue" />
        <Card titulo="Pago tecnico" valor={formatCurrency(resumo.pagoTecnico)} cor="slate" />
        <Card titulo="A receber garantidor/seguradora" valor={formatCurrency(resumo.receberGarantidor)} cor="orange" />
        <Card titulo="Recebido garantidor/seguradora" valor={formatCurrency(resumo.recebidoGarantidor)} cor="green" />
        <Card titulo="A pagar tecnico" valor={formatCurrency(resumo.pagarTecnico)} cor="blue" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setAba('receber')
                setFiltro('TODOS')
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-black transition ${
                aba === 'receber' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Recebimentos
            </button>
            <button
              type="button"
              onClick={() => {
                setAba('tecnicos')
                setFiltro('TODOS')
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-black transition ${
                aba === 'tecnicos' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pagamento tecnicos
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
              placeholder="Buscar OS, cliente ou tecnico..."
            />
            <select
              value={filtro}
              onChange={(event) => setFiltro(event.target.value as FiltroFinanceiro)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange-500"
            >
              <option value="TODOS">Todos</option>
              {aba === 'receber' ? (
                <>
                  <option value="PENDENTE">Pendentes</option>
                  <option value="FATURADO">Faturados</option>
                  <option value="RECEBIDO">Recebidos</option>
                </>
              ) : (
                <>
                  <option value="PENDENTE">A pagar</option>
                  <option value="RECEBIDO">Pagos</option>
                </>
              )}
            </select>
          </div>
        </div>

        {aba === 'receber' ? (
          <RecebimentosTable
            loading={loading}
            ordens={ordensRecebimentoFiltradas}
            salvandoId={salvandoId}
            onStatus={alterarFinanceiro}
          />
        ) : (
          <PagamentosTecnicoTable
            loading={loading}
            ordens={ordensTecnicos}
            documentos={documentos}
            tabelaPendente={documentosPendentes}
            salvandoId={salvandoId}
            onPagar={marcarTecnicoPago}
            onDocumentoPago={marcarDocumentoPago}
          />
        )}
      </section>

      <HistoricoFinanceiroPanel historico={historico} tabelaPendente={historicoPendente} />
    </div>
  )
}

function HistoricoFinanceiroPanel({
  historico,
  tabelaPendente,
}: {
  historico: HistoricoFinanceiro[]
  tabelaPendente: boolean
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-slate-950">Histórico financeiro</h2>
          <p className="text-xs text-slate-500">Últimas baixas e mudanças registradas.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {historico.length} eventos
        </span>
      </div>

      {tabelaPendente ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          Rode o SQL atualizado para liberar o histórico financeiro.
        </div>
      ) : historico.length ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {historico.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="font-black text-slate-800">{formatarTipoHistorico(item.tipo)}</span>
                <span className="font-black text-slate-700">{formatCurrency(toNumber(item.valor))}</span>
              </div>
              <p className="mt-1 text-slate-600">{item.descricao ?? '-'}</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-400">{formatDate(item.criado_em)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Nenhum histórico financeiro registrado ainda.</p>
      )}
    </section>
  )
}

function RecebimentosTable({
  loading,
  ordens,
  salvandoId,
  onStatus,
}: {
  loading: boolean
  ordens: OrdemFinanceira[]
  salvandoId: number | null
  onStatus: (id: number, status: FiltroFinanceiro) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <th className="p-3">OS</th>
            <th className="p-3">Cliente</th>
            <th className="p-3">Valor cliente</th>
            <th className="p-3">Status</th>
            <th className="p-3">NF</th>
            <th className="p-3">Acoes</th>
          </tr>
        </thead>
        <tbody>
          {loading && <LinhaMensagem colSpan={6} texto="Carregando..." />}
          {!loading && ordens.length === 0 && <LinhaMensagem colSpan={6} texto="Nenhum registro encontrado." />}
          {!loading &&
            ordens.map((os) => (
              <tr key={os.id} className="border-t border-slate-200">
                <td className="p-3 font-bold text-slate-950">{os.numero_os ?? `#${os.id}`}</td>
                <td className="p-3">{nomeCliente(os)}</td>
                <td className="p-3 font-semibold">{formatCurrency(valorCliente(os))}</td>
                <td className="p-3"><StatusFinanceiro status={os.status_financeiro} /></td>
                <td className="p-3">{os.numero_nota_fiscal || '-'}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onStatus(os.id, 'FATURADO')}
                      disabled={salvandoId === os.id}
                      className="rounded-lg border border-orange-300 px-3 py-1 text-xs font-bold text-orange-700 disabled:opacity-50"
                    >
                      Faturar
                    </button>
                    <button
                      onClick={() => onStatus(os.id, 'RECEBIDO')}
                      disabled={salvandoId === os.id}
                      className="rounded-lg bg-green-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Recebido
                    </button>
                    <a href={`/admin/os/${os.id}`} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white">
                      Abrir
                    </a>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

function PagamentosTecnicoTable({
  loading,
  ordens,
  documentos,
  tabelaPendente,
  salvandoId,
  onPagar,
  onDocumentoPago,
}: {
  loading: boolean
  ordens: OrdemFinanceira[]
  documentos: DocumentoTecnico[]
  tabelaPendente: boolean
  salvandoId: number | null
  onPagar: (id: number) => void
  onDocumentoPago: (id: number) => void
}) {
  return (
    <div className="space-y-3 p-3">
      {tabelaPendente && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          Tabela de documentos pendente. Rode o SQL atualizado para liberar NF/recibo dos tecnicos.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="p-3">OS</th>
              <th className="p-3">Tecnico</th>
              <th className="p-3">Valor tecnico</th>
              <th className="p-3">Status tecnico</th>
              <th className="p-3">Recebimento OS</th>
              <th className="p-3">Documento</th>
              <th className="p-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LinhaMensagem colSpan={7} texto="Carregando..." />}
            {!loading && ordens.length === 0 && <LinhaMensagem colSpan={7} texto="Nenhuma OS finalizada para tecnico." />}
            {!loading &&
              ordens.map((os) => {
                const doc = documentoMaisRecente(documentos, os)

                return (
                  <tr key={os.id} className="border-t border-slate-200">
                    <td className="p-3">
                      <div className="font-bold text-slate-950">{os.numero_os ?? `#${os.id}`}</div>
                      <div className="text-xs text-slate-500">{nomeCliente(os)}</div>
                    </td>
                    <td className="p-3 font-semibold">{nomeTecnico(os)}</td>
                    <td className="p-3 font-black text-slate-950">{formatCurrency(valorTecnico(os))}</td>
                    <td className="p-3"><StatusFinanceiro status={tecnicoPago(os) ? 'RECEBIDO' : 'PENDENTE'} pagoLabel="PAGO" /></td>
                    <td className="p-3"><StatusFinanceiro status={os.status_financeiro} /></td>
                    <td className="p-3">
                      {doc ? (
                        <a
                          href={doc.url ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          title={doc.nome_arquivo ?? 'Abrir documento'}
                          className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700 hover:bg-blue-200"
                        >
                          {doc.tipo ?? 'RECIBO'} RECEBIDO
                        </a>
                      ) : (
                        <span className="text-slate-500">Sem NF/recibo</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => onPagar(os.id)}
                          disabled={salvandoId === os.id || tecnicoPago(os) || !doc}
                          title={!doc ? 'Anexe a NF/recibo do tecnico antes de marcar como pago.' : undefined}
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Marcar pago
                        </button>
                        {doc && doc.status !== 'PAGO' && (
                          <button
                            onClick={() => onDocumentoPago(doc.id)}
                            disabled={salvandoId === doc.id}
                            className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-bold text-emerald-700 disabled:opacity-50"
                          >
                            Doc pago
                          </button>
                        )}
                        <a href={`/admin/os/${os.id}`} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white">
                          Abrir OS
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LinhaMensagem({ colSpan, texto }: { colSpan: number; texto: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-5 text-sm text-slate-500">{texto}</td>
    </tr>
  )
}

function StatusFinanceiro({ status, pagoLabel = 'RECEBIDO' }: { status?: string | null; pagoLabel?: string }) {
  const atual = status ?? 'PENDENTE'
  const classe =
    atual === 'RECEBIDO'
      ? 'bg-green-100 text-green-700'
      : atual === 'FATURADO'
        ? 'bg-orange-100 text-orange-700'
        : 'bg-red-100 text-red-700'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${classe}`}>
      {atual === 'RECEBIDO' ? pagoLabel : atual}
    </span>
  )
}

function Card({
  titulo,
  valor,
  cor = 'slate',
}: {
  titulo: string
  valor: string
  cor?: 'green' | 'orange' | 'blue' | 'slate'
}) {
  const cores = {
    green: 'border-green-200 bg-green-50 text-green-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    slate: 'border-slate-200 bg-white text-slate-900',
  }

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${cores[cor]}`}>
      <p className="text-[10px] font-bold uppercase leading-tight text-slate-500">{titulo}</p>
      <p className="mt-1 text-xl font-black leading-tight tracking-normal">{valor}</p>
    </div>
  )
}

function primeiraRelacao(relacao?: RelacaoNome | RelacaoNome[] | null) {
  return Array.isArray(relacao) ? relacao[0] : relacao
}

function nomeCliente(os: OrdemFinanceira) {
  return primeiraRelacao(os.clientes)?.nome ?? '-'
}

function nomeTecnico(os: OrdemFinanceira) {
  const tecnico = primeiraRelacao(os.parceiros)
  return tecnico?.responsavel ?? tecnico?.nome_fantasia ?? tecnico?.razao_social ?? '-'
}

function valorCliente(os: OrdemFinanceira) {
  return valorPreferencial(os.cliente_total, os.total)
}

function valorTecnico(os: OrdemFinanceira) {
  return valorPreferencial(os.tecnico_total, 0)
}

function tecnicoPago(os: OrdemFinanceira) {
  if (typeof os.tecnico_status_pagamento === 'string') return os.tecnico_status_pagamento === 'RECEBIDO'
  return false
}

function ehGarantidorOuSeguradora(os: OrdemFinanceira) {
  const tipo = String(os.tipo_atendimento ?? '').toUpperCase()
  return Boolean(os.garantia) || tipo === 'GARANTIA' || tipo === 'SEGURO'
}

function documentoMaisRecente(documentos: DocumentoTecnico[], os: OrdemFinanceira) {
  return (
    documentos.find((doc) => doc.os_id === os.id) ??
    documentos.find((doc) => doc.parceiro_id === os.parceiro_id && !doc.os_id) ??
    null
  )
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0) || 0
}

function valorPreferencial(principal: number | string | null | undefined, fallback: number | string | null | undefined) {
  return principal === null || principal === undefined || principal === '' ? toNumber(fallback) : toNumber(principal)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function formatarTipoHistorico(tipo?: string | null) {
  switch (tipo) {
    case 'RECEBIMENTO_OS':
      return 'Recebimento'
    case 'PAGAMENTO_TECNICO':
      return 'Pagamento técnico'
    case 'DOCUMENTO_TECNICO':
      return 'Documento técnico'
    default:
      return tipo ?? 'Financeiro'
  }
}

function formatDate(data?: string | null) {
  if (!data) return '-'

  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code].filter(Boolean).map(String)
    if (possiveis.length > 0) return possiveis.join(' | ')
  }

  return fallback
}
