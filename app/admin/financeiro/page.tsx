'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type AbaFinanceiro = 'receber' | 'tecnicos' | 'contas'
type FiltroFinanceiro = 'TODOS' | 'PENDENTE' | 'FATURADO' | 'PARCIAL' | 'RECEBIDO'

type RelacaoNome = { nome?: string | null; responsavel?: string | null; nome_fantasia?: string | null; razao_social?: string | null }

type OrdemFinanceira = {
  id: number
  numero_os: string | null
  created_at: string | null
  status: string | null
  status_financeiro: string | null
  data_pagamento?: string | null
  data_ultimo_recebimento?: string | null
  forma_recebimento?: string | null
  total: number | string | null
  valor_recebido_cliente?: number | string | null
  tecnico_total?: number | string | null
  tecnico_status_pagamento?: string | null
  tecnico_pago_em?: string | null
  forma_pagamento_tecnico?: string | null
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

type ContaPagar = {
  id: number
  descricao: string | null
  fornecedor: string | null
  categoria: string | null
  valor: number | string | null
  vencimento: string | null
  status: string | null
  forma_pagamento?: string | null
  pago_em?: string | null
  observacao?: string | null
  criado_em?: string | null
}

type ContaForm = {
  descricao: string
  fornecedor: string
  categoria: string
  valor: string
  vencimento: string
  observacao: string
}

const contaInicial: ContaForm = {
  descricao: '',
  fornecedor: '',
  categoria: 'OPERACIONAL',
  valor: '',
  vencimento: '',
  observacao: '',
}

const categoriasConta = [
  { value: 'OPERACIONAL', label: 'Operacional' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
  { value: 'IMPOSTOS', label: 'Impostos' },
  { value: 'FORNECEDOR', label: 'Fornecedor' },
  { value: 'PECAS_ESTOQUE', label: 'Pecas/estoque' },
  { value: 'DESLOCAMENTO', label: 'Deslocamento' },
  { value: 'COMBUSTIVEL', label: 'Combustivel' },
  { value: 'SISTEMAS', label: 'Sistemas' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'ALUGUEL', label: 'Aluguel' },
  { value: 'CONTABILIDADE', label: 'Contabilidade' },
  { value: 'TAXAS_BANCARIAS', label: 'Taxas bancarias' },
  { value: 'OUTROS', label: 'Outros' },
]

export default function FinanceiroPage() {
  const [aba, setAba] = useState<AbaFinanceiro>('tecnicos')
  const [ordens, setOrdens] = useState<OrdemFinanceira[]>([])
  const [documentos, setDocumentos] = useState<DocumentoTecnico[]>([])
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([])
  const [historico, setHistorico] = useState<HistoricoFinanceiro[]>([])
  const [documentosPendentes, setDocumentosPendentes] = useState(false)
  const [contasPagarPendente, setContasPagarPendente] = useState(false)
  const [historicoPendente, setHistoricoPendente] = useState(false)
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<FiltroFinanceiro>('TODOS')
  const [busca, setBusca] = useState('')
  const [contaForm, setContaForm] = useState<ContaForm>(contaInicial)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/financeiro')
      const data = await response.json().catch(() => null)

      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar financeiro.')

      setOrdens((data?.ordens ?? []) as OrdemFinanceira[])
      setDocumentos((data?.documentos ?? []) as DocumentoTecnico[])
      setContasPagar((data?.contasPagar ?? []) as ContaPagar[])
      setHistorico((data?.historico ?? []) as HistoricoFinanceiro[])
      setDocumentosPendentes(Boolean(data?.documentosPendentes))
      setContasPagarPendente(Boolean(data?.contasPagarPendente))
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

  const contasFiltradas = useMemo(() => {
    return contasPagar.filter((conta) => {
      const status = String(conta.status ?? 'PENDENTE').toUpperCase()
      const texto = `${conta.descricao ?? ''} ${conta.fornecedor ?? ''} ${conta.categoria ?? ''}`.toLowerCase()
      const atendeFiltro = filtro === 'TODOS' || (filtro === 'RECEBIDO' ? status === 'PAGO' : status === filtro)
      const atendeBusca = !busca.trim() || texto.includes(busca.trim().toLowerCase())

      return atendeFiltro && atendeBusca
    })
  }, [busca, contasPagar, filtro])

  const resumo = useMemo(() => {
    const ordensFinalizadas = ordens.filter((os) => os.status === 'FINALIZADA')
    const ordensComRecebimento = ordens.filter((os) => valorRecebidoCliente(os) > 0)
    const receberCliente = ordensFinalizadas
      .filter((os) => !ehGarantidorOuSeguradora(os) && saldoCliente(os) > 0)
      .reduce((acc, os) => acc + saldoCliente(os), 0)
    const recebidoCliente = ordensComRecebimento
      .filter((os) => !ehGarantidorOuSeguradora(os) && valorRecebidoCliente(os) > 0)
      .reduce((acc, os) => acc + valorRecebidoCliente(os), 0)
    const receberGarantidor = ordensFinalizadas
      .filter((os) => ehGarantidorOuSeguradora(os) && saldoCliente(os) > 0)
      .reduce((acc, os) => acc + saldoCliente(os), 0)
    const recebidoGarantidor = ordensComRecebimento
      .filter((os) => ehGarantidorOuSeguradora(os) && valorRecebidoCliente(os) > 0)
      .reduce((acc, os) => acc + valorRecebidoCliente(os), 0)
    const pagarTecnico = ordensFinalizadas
      .filter((os) => !tecnicoPago(os) && valorTecnico(os) > 0)
      .reduce((acc, os) => acc + valorTecnico(os), 0)
    const pagoTecnico = ordensFinalizadas
      .filter((os) => tecnicoPago(os) && valorTecnico(os) > 0)
      .reduce((acc, os) => acc + valorTecnico(os), 0)
    const contasPendentes = contasPagar
      .filter((conta) => String(conta.status ?? 'PENDENTE').toUpperCase() === 'PENDENTE')
      .reduce((acc, conta) => acc + toNumber(conta.valor), 0)
    const contasPagas = contasPagar
      .filter((conta) => String(conta.status ?? '').toUpperCase() === 'PAGO')
      .reduce((acc, conta) => acc + toNumber(conta.valor), 0)

    return {
      receberCliente,
      recebidoCliente,
      receberGarantidor,
      recebidoGarantidor,
      totalRecebido: recebidoCliente + recebidoGarantidor,
      caixaGeral: recebidoCliente + recebidoGarantidor - pagoTecnico - contasPagas,
      pagarTecnico,
      pagoTecnico,
      contasPendentes,
      contasPagas,
      finalizadasTecnico: ordensFinalizadas.filter((os) => Boolean(os.parceiro_id) && valorTecnico(os) > 0).length,
    }
  }, [contasPagar, ordens])

  const visaoMensal = useMemo(() => {
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59)
    const ordensFinalizadas = ordens.filter((os) => os.status === 'FINALIZADA')
    const recebidasMes = ordens.filter((os) =>
      valorRecebidoCliente(os) > 0 && estaNoPeriodo(os.data_ultimo_recebimento ?? os.data_pagamento ?? os.created_at, inicioMes, fimMes)
    )
    const tecnicosPagosMes = ordensFinalizadas.filter((os) =>
      tecnicoPago(os) && estaNoPeriodo(os.tecnico_pago_em ?? os.created_at, inicioMes, fimMes)
    )
    const contasPagasMes = contasPagar.filter((conta) =>
      String(conta.status ?? '').toUpperCase() === 'PAGO' && estaNoPeriodo(conta.pago_em ?? conta.criado_em, inicioMes, fimMes)
    )
    const contasVencidas = contasPagar.filter((conta) =>
      String(conta.status ?? 'PENDENTE').toUpperCase() === 'PENDENTE' &&
      conta.vencimento &&
      new Date(`${conta.vencimento}T23:59:59`).getTime() < hoje.getTime()
    )

    const recebidoClienteMes = recebidasMes
      .filter((os) => !ehGarantidorOuSeguradora(os))
      .reduce((acc, os) => acc + valorRecebidoCliente(os), 0)
    const recebidoGarantidorMes = recebidasMes
      .filter((os) => ehGarantidorOuSeguradora(os))
      .reduce((acc, os) => acc + valorRecebidoCliente(os), 0)
    const pagoTecnicoMes = tecnicosPagosMes.reduce((acc, os) => acc + valorTecnico(os), 0)
    const contasPagasValorMes = contasPagasMes.reduce((acc, conta) => acc + toNumber(conta.valor), 0)
    const despesasPorCategoria = montarDespesasPorCategoria(contasPagasMes)

    return {
      label: hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      recebidoCliente: recebidoClienteMes,
      recebidoGarantidor: recebidoGarantidorMes,
      recebidoTotal: recebidoClienteMes + recebidoGarantidorMes,
      pagoTecnico: pagoTecnicoMes,
      contasPagas: contasPagasValorMes,
      lucroLiquido: recebidoClienteMes + recebidoGarantidorMes - pagoTecnicoMes - contasPagasValorMes,
      contasVencidas: contasVencidas.reduce((acc, conta) => acc + toNumber(conta.valor), 0),
      contasVencidasQtd: contasVencidas.length,
      despesasPorCategoria,
    }
  }, [contasPagar, ordens])

  async function criarContaPagar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSalvandoId(-1)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/financeiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contaForm),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao criar conta a pagar.')

      setContaForm(contaInicial)
      await carregarDados()
    } catch (error) {
      setErro(formatarErro(error, 'Erro ao criar conta a pagar.'))
    } finally {
      setSalvandoId(null)
    }
  }

  async function marcarContaPaga(id: number) {
    const forma = pedirFormaPagamento('Forma de pagamento da conta')
    if (!forma) return
    setSalvandoId(id)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/financeiro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'CONTA', id, status: 'PAGO', forma }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao pagar conta.')
      await carregarDados()
    } catch (error) {
      setErro(formatarErro(error, 'Erro ao pagar conta.'))
    } finally {
      setSalvandoId(null)
    }
  }

  async function alterarFinanceiro(id: number, status: FiltroFinanceiro) {
    if (status === 'TODOS') return
    const ordem = ordens.find((item) => item.id === id)
    const pagamento = status === 'PARCIAL' || status === 'RECEBIDO'
    const forma = pagamento ? pedirFormaPagamento('Forma de recebimento') : null
    const valor = pagamento && ordem ? pedirValorRecebimento(ordem, status === 'RECEBIDO') : null
    if (pagamento && (!forma || valor === null)) return
    setSalvandoId(id)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/financeiro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'OS', id, status, forma, valor }),
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
    const forma = pedirFormaPagamento('Forma de pagamento ao tecnico')
    if (!forma) return
    setSalvandoId(id)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/financeiro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'TECNICO', id, forma }),
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
        <Card titulo="Contas a pagar" valor={formatCurrency(resumo.contasPendentes)} cor="orange" />
        <Card titulo="Contas pagas" valor={formatCurrency(resumo.contasPagas)} cor="slate" />
      </div>

      <MonthlyFinancePanel data={visaoMensal} />

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
            <button
              type="button"
              onClick={() => {
                setAba('contas')
                setFiltro('TODOS')
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-black transition ${
                aba === 'contas' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Contas a pagar
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
                  <option value="PARCIAL">Parciais</option>
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
        ) : aba === 'tecnicos' ? (
          <PagamentosTecnicoTable
            loading={loading}
            ordens={ordensTecnicos}
            documentos={documentos}
            tabelaPendente={documentosPendentes}
            salvandoId={salvandoId}
            onPagar={marcarTecnicoPago}
            onDocumentoPago={marcarDocumentoPago}
          />
        ) : (
          <ContasPagarPanel
            loading={loading}
            contas={contasFiltradas}
            tabelaPendente={contasPagarPendente}
            salvandoId={salvandoId}
            form={contaForm}
            onFormChange={setContaForm}
            onSubmit={criarContaPagar}
            onPagar={marcarContaPaga}
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
            <th className="p-3">Recebido</th>
            <th className="p-3">Saldo</th>
            <th className="p-3">Status</th>
            <th className="p-3">Forma</th>
            <th className="p-3">NF</th>
            <th className="p-3">Acoes</th>
          </tr>
        </thead>
        <tbody>
          {loading && <LinhaMensagem colSpan={9} texto="Carregando..." />}
          {!loading && ordens.length === 0 && <LinhaMensagem colSpan={9} texto="Nenhum registro encontrado." />}
          {!loading &&
            ordens.map((os) => {
              const saldo = saldoCliente(os)
              return (
                <tr key={os.id} className="border-t border-slate-200">
                  <td className="p-3 font-bold text-slate-950">{os.numero_os ?? `#${os.id}`}</td>
                  <td className="p-3">{nomeCliente(os)}</td>
                  <td className="p-3 font-semibold">{formatCurrency(valorCliente(os))}</td>
                  <td className="p-3 font-semibold text-emerald-700">{formatCurrency(valorRecebidoCliente(os))}</td>
                  <td className="p-3 font-semibold text-orange-700">{formatCurrency(saldo)}</td>
                  <td className="p-3"><StatusFinanceiro status={os.status_financeiro} /></td>
                  <td className="p-3">{formatarFormaPagamento(os.forma_recebimento)}</td>
                  <td className="p-3">{os.numero_nota_fiscal || '-'}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => onStatus(os.id, 'FATURADO')}
                        disabled={salvandoId === os.id || os.status_financeiro === 'RECEBIDO'}
                        className="rounded-lg border border-orange-300 px-3 py-1 text-xs font-bold text-orange-700 disabled:opacity-50"
                      >
                        Faturar
                      </button>
                      <button
                        onClick={() => onStatus(os.id, 'PARCIAL')}
                        disabled={salvandoId === os.id || saldo <= 0}
                        className="rounded-lg border border-green-300 px-3 py-1 text-xs font-bold text-green-700 disabled:opacity-50"
                      >
                        Receber parcial
                      </button>
                      <button
                        onClick={() => onStatus(os.id, 'RECEBIDO')}
                        disabled={salvandoId === os.id || saldo <= 0}
                        className="rounded-lg bg-green-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                      >
                        Receber saldo
                      </button>
                      <a href={`/admin/os/${os.id}`} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white">
                        Abrir
                      </a>
                    </div>
                  </td>
                </tr>
              )
            })}
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
              <th className="p-3">Forma</th>
              <th className="p-3">Recebimento OS</th>
              <th className="p-3">Documento</th>
              <th className="p-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LinhaMensagem colSpan={8} texto="Carregando..." />}
            {!loading && ordens.length === 0 && <LinhaMensagem colSpan={8} texto="Nenhuma OS finalizada para tecnico." />}
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
                    <td className="p-3">{formatarFormaPagamento(os.forma_pagamento_tecnico)}</td>
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

function ContasPagarPanel({
  loading,
  contas,
  tabelaPendente,
  salvandoId,
  form,
  onFormChange,
  onSubmit,
  onPagar,
}: {
  loading: boolean
  contas: ContaPagar[]
  tabelaPendente: boolean
  salvandoId: number | null
  form: ContaForm
  onFormChange: (form: ContaForm) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onPagar: (id: number) => void
}) {
  return (
    <div className="space-y-4 p-3">
      {tabelaPendente && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          Rode o SQL de contas a pagar para liberar o lançamento manual de despesas.
        </div>
      )}

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1.2fr_1fr_150px_140px_150px_auto] lg:items-end">
        <FinanceField
          label="Descrição"
          value={form.descricao}
          onChange={(value) => onFormChange({ ...form, descricao: value })}
          placeholder="Ex.: Aluguel, internet, contador"
          disabled={tabelaPendente}
        />
        <FinanceField
          label="Fornecedor"
          value={form.fornecedor}
          onChange={(value) => onFormChange({ ...form, fornecedor: value })}
          placeholder="Nome do fornecedor"
          disabled={tabelaPendente}
        />
        <FinanceSelect
          label="Categoria"
          value={form.categoria}
          onChange={(value) => onFormChange({ ...form, categoria: value })}
          disabled={tabelaPendente}
        />
        <FinanceField
          label="Valor"
          value={form.valor}
          onChange={(value) => onFormChange({ ...form, valor: value })}
          type="number"
          step="0.01"
          min="0"
          disabled={tabelaPendente}
        />
        <FinanceField
          label="Vencimento"
          value={form.vencimento}
          onChange={(value) => onFormChange({ ...form, vencimento: value })}
          type="date"
          disabled={tabelaPendente}
        />
        <button
          type="submit"
          disabled={tabelaPendente || salvandoId === -1}
          className="h-10 rounded-lg bg-slate-900 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Lançar
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="p-3">Conta</th>
              <th className="p-3">Categoria</th>
              <th className="p-3">Vencimento</th>
              <th className="p-3">Valor</th>
              <th className="p-3">Status</th>
              <th className="p-3">Forma</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LinhaMensagem colSpan={7} texto="Carregando..." />}
            {!loading && contas.length === 0 && <LinhaMensagem colSpan={7} texto="Nenhuma conta encontrada." />}
            {!loading &&
              contas.map((conta) => {
                const status = String(conta.status ?? 'PENDENTE').toUpperCase()
                return (
                  <tr key={conta.id} className="border-t border-slate-200">
                    <td className="p-3">
                      <div className="font-bold text-slate-950">{conta.descricao ?? '-'}</div>
                      <div className="text-xs text-slate-500">{conta.fornecedor ?? '-'}</div>
                    </td>
                    <td className="p-3">{formatarCategoriaConta(conta.categoria)}</td>
                    <td className="p-3">{formatDate(conta.vencimento)}</td>
                    <td className="p-3 font-black text-slate-950">{formatCurrency(toNumber(conta.valor))}</td>
                    <td className="p-3"><StatusFinanceiro status={status === 'PAGO' ? 'RECEBIDO' : status} pagoLabel="PAGO" /></td>
                    <td className="p-3">{formatarFormaPagamento(conta.forma_pagamento)}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => onPagar(conta.id)}
                        disabled={status === 'PAGO' || salvandoId === conta.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Marcar pago
                      </button>
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

function MonthlyFinancePanel({
  data,
}: {
  data: {
    label: string
    recebidoCliente: number
    recebidoGarantidor: number
    recebidoTotal: number
    pagoTecnico: number
    contasPagas: number
    lucroLiquido: number
    contasVencidas: number
    contasVencidasQtd: number
    despesasPorCategoria: Array<{ categoria: string; valor: number }>
  }
}) {
  const maiorDespesa = Math.max(...data.despesasPorCategoria.map((item) => item.valor), 1)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-black text-slate-950">Visao financeira do mes</h2>
          <p className="text-xs font-semibold uppercase text-slate-500">{data.label}</p>
        </div>
        {data.contasVencidasQtd > 0 && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
            {data.contasVencidasQtd} conta(s) vencida(s): {formatCurrency(data.contasVencidas)}
          </span>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <MiniFinanceCard label="Recebido cliente" value={formatCurrency(data.recebidoCliente)} tone="green" />
        <MiniFinanceCard label="Recebido garantidor" value={formatCurrency(data.recebidoGarantidor)} tone="green" />
        <MiniFinanceCard label="Total recebido" value={formatCurrency(data.recebidoTotal)} tone="blue" />
        <MiniFinanceCard label="Pago tecnico" value={formatCurrency(data.pagoTecnico)} tone="slate" />
        <MiniFinanceCard label="Contas pagas" value={formatCurrency(data.contasPagas)} tone="orange" />
        <MiniFinanceCard label="Lucro liquido" value={formatCurrency(data.lucroLiquido)} tone={data.lucroLiquido >= 0 ? 'green' : 'red'} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Despesas pagas por categoria</h3>
            <span className="text-xs font-bold text-slate-500">{data.despesasPorCategoria.length} categorias</span>
          </div>

          {data.despesasPorCategoria.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma conta paga neste mes.</p>
          ) : (
            <div className="space-y-2">
              {data.despesasPorCategoria.slice(0, 8).map((item) => (
                <div key={item.categoria}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="font-black text-slate-700">{formatarCategoriaConta(item.categoria)}</span>
                    <span className="font-black text-slate-950">{formatCurrency(item.valor)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-orange-500"
                      style={{ width: `${Math.max(6, (item.valor / maiorDespesa) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-950 p-3 text-white">
          <h3 className="text-sm font-black">Leitura rapida</h3>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            O lucro liquido considera o que entrou no mes menos pagamentos de tecnicos e contas pagas no mes.
            Contas pendentes seguem aparecendo como compromisso futuro, sem baixar o caixa ate marcar como pago.
          </p>
          <div className="mt-3 rounded-lg bg-white/10 p-3">
            <p className="text-xs uppercase text-slate-300">Resultado do mes</p>
            <p className={`mt-1 text-2xl font-black ${data.lucroLiquido >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {formatCurrency(data.lucroLiquido)}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function MiniFinanceCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'green' | 'blue' | 'orange' | 'slate' | 'red'
}) {
  const tones = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
    red: 'border-red-200 bg-red-50 text-red-800',
  }

  return (
    <div className={`min-w-0 rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <p className="truncate text-[10px] font-black uppercase opacity-75">{label}</p>
      <p className="mt-1 truncate text-lg font-black" title={value}>{value}</p>
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
      : atual === 'PARCIAL'
        ? 'bg-blue-100 text-blue-700'
      : atual === 'FATURADO'
        ? 'bg-orange-100 text-orange-700'
        : 'bg-red-100 text-red-700'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${classe}`}>
      {atual === 'RECEBIDO' ? pagoLabel : atual}
    </span>
  )
}

function FinanceField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  step,
  min,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  step?: string
  min?: string
  disabled?: boolean
}) {
  return (
    <label className="block text-xs font-black text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        step={step}
        min={min}
        disabled={disabled}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
    </label>
  )
}

function FinanceSelect({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block text-xs font-black text-slate-700">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
      >
        {categoriasConta.map((categoria) => (
          <option key={categoria.value} value={categoria.value}>
            {categoria.label}
          </option>
        ))}
      </select>
    </label>
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

function valorRecebidoCliente(os: OrdemFinanceira) {
  const recebido = toNumber(os.valor_recebido_cliente)
  if (recebido > 0) return Math.min(recebido, valorCliente(os))
  return os.status_financeiro === 'RECEBIDO' ? valorCliente(os) : 0
}

function saldoCliente(os: OrdemFinanceira) {
  return Math.max(valorCliente(os) - valorRecebidoCliente(os), 0)
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

function estaNoPeriodo(value: string | null | undefined, inicio: Date, fim: Date) {
  if (!value) return false
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  return time >= inicio.getTime() && time <= fim.getTime()
}

function montarDespesasPorCategoria(contas: ContaPagar[]) {
  const mapa = new Map<string, number>()

  for (const conta of contas) {
    const categoria = String(conta.categoria ?? 'OUTROS').toUpperCase()
    mapa.set(categoria, (mapa.get(categoria) ?? 0) + toNumber(conta.valor))
  }

  return Array.from(mapa.entries())
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor)
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

function pedirFormaPagamento(titulo: string) {
  const resposta = window.prompt(`${titulo}: PIX, CARTAO, DEPOSITO, BOLETO ou DINHEIRO`, 'PIX')
  if (resposta === null) return null

  const forma = resposta.trim().toUpperCase()
  const permitidas = ['PIX', 'CARTAO', 'DEPOSITO', 'BOLETO', 'DINHEIRO']

  if (!permitidas.includes(forma)) {
    window.alert('Forma inválida. Use PIX, CARTAO, DEPOSITO, BOLETO ou DINHEIRO.')
    return null
  }

  return forma
}

function pedirValorRecebimento(os: OrdemFinanceira, usarSaldoComoPadrao: boolean) {
  const saldo = saldoCliente(os)
  if (saldo <= 0) {
    window.alert('Esta OS nao possui saldo em aberto.')
    return null
  }

  const valorPadrao = usarSaldoComoPadrao ? saldo : 0
  const resposta = window.prompt(
    `Valor recebido agora. Saldo atual: ${formatCurrency(saldo)}`,
    valorPadrao > 0 ? String(valorPadrao.toFixed(2)).replace('.', ',') : ''
  )
  if (resposta === null) return null

  const valor = Number(resposta.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(valor) || valor <= 0 || valor > saldo) {
    window.alert(`Valor invalido. Informe um valor maior que zero e ate ${formatCurrency(saldo)}.`)
    return null
  }

  return valor
}

function formatarFormaPagamento(forma?: string | null) {
  const value = String(forma ?? '').toUpperCase()
  const labels: Record<string, string> = {
    PIX: 'PIX',
    CARTAO: 'Cartão',
    DEPOSITO: 'Depósito',
    BOLETO: 'Boleto',
    DINHEIRO: 'Dinheiro',
  }

  return labels[value] ?? '-'
}

function formatarCategoriaConta(categoria?: string | null) {
  const value = String(categoria ?? '').toUpperCase()
  const labels = Object.fromEntries(categoriasConta.map((item) => [item.value, item.label]))

  return labels[value] ?? (value || '-')
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
