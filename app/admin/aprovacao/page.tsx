'use client'

import { useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type OrcamentoFiltro = 'TODOS' | 'REVISAO' | 'PENDENTE' | 'APROVADO' | 'REPROVADO'

type OSItem = {
  id: number
  numero_os: string | null
  status: string | null
  orcamento_status: string | null
  orcamento_resposta_em: string | null
  total: number | string | null
  valor_pecas?: number | string | null
  valor_mao_obra?: number | string | null
  desconto?: number | string | null
  tecnico_valor_pecas?: number | string | null
  tecnico_valor_mao_obra?: number | string | null
  tecnico_desconto?: number | string | null
  tecnico_total?: number | string | null
  cliente_valor_pecas?: number | string | null
  cliente_valor_mao_obra?: number | string | null
  cliente_desconto?: number | string | null
  cliente_total?: number | string | null
  garantia: boolean | null
  created_at: string
  modelo: string | null
  diagnostico_tecnico?: string | null
  servico_executado?: string | null
  pecas_utilizadas?: string | null
  categoria_id: number | null
  marca_id: number | null
  cliente_id: number | null
  fotos_count?: number
  cliente_nome?: string | null
  cliente_whatsapp?: string | null
  categoria_nome?: string | null
  marca_nome?: string | null
}

export default function AprovacaoPage() {
  const [lista, setLista] = useState<OSItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<OrcamentoFiltro>('REVISAO')
  const [processandoId, setProcessandoId] = useState<number | null>(null)

  useEffect(() => {
    void carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/aprovacao')
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar aprovações.')
      setLista((payload?.data ?? []) as OSItem[])
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao carregar aprovações.'))
    } finally {
      setLoading(false)
    }
  }

  async function alterarStatus(id: number, novoStatus: 'APROVADO' | 'REPROVADO') {
    setProcessandoId(id)
    setErro('')

    try {
      const valorVisitaTecnico =
        novoStatus === 'REPROVADO'
          ? pedirValorVisitaTecnico()
          : null

      if (novoStatus === 'REPROVADO' && valorVisitaTecnico === null) {
        setProcessandoId(null)
        return
      }

      const response = await adminFetch('/api/admin/aprovacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'ALTERAR_STATUS', id, novoStatus, valorVisitaTecnico }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao atualizar orçamento.')

      await carregar()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao atualizar orçamento.'))
    } finally {
      setProcessandoId(null)
    }
}

 async function reenviarWhatsApp(item: OSItem) {
  if (!podeEnviarCliente(item)) {
    setErro(getMotivoBloqueioEnvio(item))
    return
  }

  const whatsapp = limparTelefone(item.cliente_whatsapp ?? '')
  if (!whatsapp) {
    setErro('Cliente sem WhatsApp cadastrado.')
    return
  }

  setProcessandoId(item.id)
  setErro('')

  try {
    const response = await adminFetch('/api/admin/aprovacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'ENVIAR_CLIENTE', id: item.id }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error ?? 'Erro ao liberar orçamento para o cliente.')
  } catch (err) {
    setErro(formatarErro(err, 'Erro ao liberar orcamento para o cliente.'))
    setProcessandoId(null)
    return
  }

  const linkConsulta = criarLinkConsulta(item)
  const linkAprovar = linkConsulta
  const linkReprovar = linkConsulta
  const statusOrcamento = item.orcamento_status ?? 'PENDENTE'

  let mensagem = encodeURIComponent(
    [
      `Olá, ${item.cliente_nome ?? 'cliente'}!`,
      '',
      '🧾 Orçamento disponível para análise',
      `🔢 OS: ${item.numero_os ?? '-'}`,
      `🛠️ Equipamento: ${item.modelo ?? '-'}`,
      `💰 Valor: ${formatCurrency(toNumber(item.total))}`,
      `📌 Status: ${statusOrcamento}`,
      `🛡️ Garantia: ${item.garantia ? 'SIM' : 'NÃO'}`,
      '',
      '✅ Aprovar orçamento:',
      linkAprovar,
      '',
      '❌ Reprovar orçamento:',
      linkReprovar,
      '',
      '🔎 Ver detalhes da OS:',
      linkConsulta,
      '',
      'Ao abrir o link, confira os dados e confirme sua decisão no portal.',
    ].join('\n')
  )

  mensagem = encodeURIComponent(
    [
      `Ola, ${item.cliente_nome ?? 'cliente'}!`,
      '',
      'Orcamento disponivel para analise',
      `OS: ${item.numero_os ?? '-'}`,
      `Equipamento: ${formatarEquipamento(item)}`,
      `Valor: ${formatCurrency(toNumber(item.total))}`,
      `Status: ${statusOrcamento}`,
      `Garantia: ${item.garantia ? 'SIM' : 'NAO'}`,
      '',
      'Ver detalhes da OS:',
      linkConsulta,
      '',
      'Ao abrir o link, confira os dados e escolha se aprova ou reprova o orcamento.',
    ].join('\n')
  )

  if (false) encodeURIComponent(
    `Olá! Seu orçamento da OS ${item.numero_os ?? ''} está ${item.orcamento_status ?? 'PENDENTE'}.\n\n` +
      `Cliente: ${item.cliente_nome ?? '-'}\n` +
      `Equipamento: ${item.modelo ?? '-'}\n` +
      `Valor: ${formatCurrency(toNumber(item.total))}\n\n` +
      `Acesse a consulta informando a OS e o WhatsApp cadastrado.`
  )

  window.open(`https://wa.me/55${whatsapp}?text=${mensagem}`, '_blank', 'noopener,noreferrer')
  await carregar()
  setProcessandoId(null)
  }

  const estatisticas = useMemo(() => {
    const revisao = lista.filter((item) => item.status === 'AGUARDANDO_REVISAO').length
    const pendentes = lista.filter((item) => (item.orcamento_status ?? 'PENDENTE') === 'PENDENTE').length
    const aprovados = lista.filter((item) => item.orcamento_status === 'APROVADO').length
    const reprovados = lista.filter((item) => item.orcamento_status === 'REPROVADO').length
    const garantia = lista.filter((item) => item.garantia === true).length

    const valorTotal = lista.reduce((acc, item) => acc + toNumber(item.total), 0)
    const valorPendente = lista
      .filter((item) => (item.orcamento_status ?? 'PENDENTE') === 'PENDENTE')
      .reduce((acc, item) => acc + toNumber(item.total), 0)

    return { revisao, pendentes, aprovados, reprovados, garantia, valorTotal, valorPendente }
  }, [lista])

  const listaFiltrada = useMemo(() => {
    const termo = busca.toLowerCase().trim()

    return lista.filter((item) => {
      const statusItem = item.orcamento_status ?? 'PENDENTE'
      const bateFiltro =
        filtro === 'TODOS' ||
        (filtro === 'REVISAO' && item.status === 'AGUARDANDO_REVISAO') ||
        statusItem === filtro

      const texto = [
        item.numero_os,
        item.cliente_nome,
        item.categoria_nome,
        item.marca_nome,
        item.modelo,
        item.diagnostico_tecnico,
        item.servico_executado,
        item.pecas_utilizadas,
        item.status,
        item.orcamento_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const bateBusca = !termo || texto.includes(termo)

      return bateFiltro && bateBusca
    })
  }, [lista, busca, filtro])

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-orange-500">
                Aprovação de Orçamentos
              </p>
              <h1 className="text-3xl font-bold text-slate-900">Central de Aprovação Premium</h1>
              <p className="mt-1 text-slate-500">
                Controle de orçamentos pendentes, aprovados, reprovados e garantia.
              </p>
            </div>

            <button
              onClick={carregar}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              Atualizar
            </button>
          </div>
        </header>

        {erro && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">
            {erro}
          </div>
        )}

        <section className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 2xl:grid-cols-8">
          <MetricCard
            title="Revisao Admin"
            value={loading ? '...' : String(estatisticas.revisao)}
            tone={estatisticas.revisao > 0 ? 'warning' : 'info'}
            alert={estatisticas.revisao > 0}
          />
          <MetricCard
            title="Pendentes"
            value={loading ? '...' : String(estatisticas.pendentes)}
            tone="warning"
          />
          <MetricCard
            title="Aprovados"
            value={loading ? '...' : String(estatisticas.aprovados)}
            tone="success"
          />
          <MetricCard
            title="Reprovados"
            value={loading ? '...' : String(estatisticas.reprovados)}
            tone="critical"
          />
          <MetricCard
            title="Garantia"
            value={loading ? '...' : String(estatisticas.garantia)}
            tone="default"
          />
          <MetricCard
            title="Valor Pendente"
            value={loading ? '...' : formatCurrency(estatisticas.valorPendente)}
            tone="warning"
          />
          <MetricCard
            title="Valor Total Geral"
            value={loading ? '...' : formatCurrency(estatisticas.valorTotal)}
            tone="default"
          />
          <MetricCard
            title="Total de Registros"
            value={loading ? '...' : String(lista.length)}
            tone="default"
          />
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Filtros</h2>
              <p className="text-sm text-slate-500">
                Pesquise por OS, cliente ou equipamento.
              </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar OS, cliente, equipamento..."
                className="w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-orange-500 md:w-80"
              />

              <select
                value={filtro}
                onChange={(e) => setFiltro(e.target.value as OrcamentoFiltro)}
                className="rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-orange-500"
              >
                <option value="TODOS">Todos</option>
                <option value="REVISAO">Revisao admin</option>
                <option value="PENDENTE">Pendentes</option>
                <option value="APROVADO">Aprovados</option>
                <option value="REPROVADO">Reprovados</option>
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Lista de Orçamentos</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {listaFiltrada.length} registros
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1030px] w-full table-fixed text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="w-[118px] px-2 py-2">OS</th>
                  <th className="w-[150px] px-2 py-2">Cliente</th>
                  <th className="w-[210px] px-2 py-2">Equipamento</th>
                  <th className="w-[92px] px-2 py-2">Valor</th>
                  <th className="w-[62px] px-2 py-2">Fotos</th>
                  <th className="w-[116px] px-2 py-2">Status OS</th>
                  <th className="w-[108px] px-2 py-2">Status</th>
                  <th className="w-[155px] px-1.5 py-2">Resumo tecnico</th>
                  <th className="w-[62px] px-1.5 py-2">Garantia</th>
                  <th className="sticky right-0 z-10 w-[222px] bg-slate-50 px-2 py-2 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.5)]">Ações</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={10}>
                      Carregando...
                    </td>
                  </tr>
                ) : listaFiltrada.length > 0 ? (
                  listaFiltrada.map((os) => {
                    const podeEnviar = podeEnviarCliente(os)

                    return (
                    <tr key={os.id} className={`border-t hover:bg-slate-50 ${os.status === 'AGUARDANDO_REVISAO' ? 'bg-indigo-50/40' : ''}`}>
                      <td className="whitespace-nowrap px-2 py-2 font-medium text-slate-900">
                        {os.numero_os ?? '-'}
                      </td>
                      <td className="truncate px-2 py-2">{os.cliente_nome ?? '-'}</td>
                      <td className="truncate px-2 py-2">{formatarEquipamento(os)}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-semibold">
                        {formatCurrency(toNumber(os.total))}
                      </td>
                      <td className="px-2 py-2">
                        <FotosBadge count={os.fotos_count ?? 0} />
                      </td>
                      <td className="px-2 py-2">
                        <StatusOSBadge status={os.status ?? '-'} />
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={os.orcamento_status ?? 'PENDENTE'} />
                      </td>
                      <td className="px-1.5 py-2 text-xs text-slate-600">
                        <div className="line-clamp-2">
                          {formatarResumoTecnico(os)}
                        </div>
                      </td>
                      <td className="px-1.5 py-2">
                        <GuaranteeBadge garantia={os.garantia === true} />
                      </td>
                      <td className="sticky right-0 bg-white px-2 py-2 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.5)]">
                        <div className="grid min-w-[220px] grid-cols-2 gap-1.5">
                          <button
                            onClick={() => abrirOS(os.id)}
                            className="rounded-md bg-slate-700 px-2 py-1.5 text-[11px] font-bold text-white"
                          >
                            Abrir
                          </button>

                          <button
                            onClick={() => reenviarWhatsApp(os)}
                            disabled={processandoId === os.id || !podeEnviar}
                            title={podeEnviar ? 'Enviar orcamento ao cliente' : getMotivoBloqueioEnvio(os)}
                            className="rounded-md bg-blue-600 px-2 py-1.5 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Enviar
                          </button>

                          <button
                            onClick={() => alterarStatus(os.id, 'APROVADO')}
                            disabled={processandoId === os.id}
                            className="rounded-md bg-emerald-600 px-2 py-1.5 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Aprovar
                          </button>

                          <button
                            onClick={() => alterarStatus(os.id, 'REPROVADO')}
                            disabled={processandoId === os.id}
                            className="rounded-md bg-red-600 px-2 py-1.5 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Reprovar
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={10}>
                      Nenhum orçamento encontrado.
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

function MetricCard({
  title,
  value,
  tone = 'default',
  alert = false,
}: {
  title: string
  value: string
  tone?: 'default' | 'success' | 'warning' | 'critical' | 'info'
  alert?: boolean
}) {
  const cls =
    tone === 'success'
      ? 'border border-emerald-200 bg-emerald-50/60 text-emerald-700'
      : tone === 'info'
        ? 'border border-indigo-200 bg-indigo-50/60 text-indigo-700'
      : tone === 'warning'
        ? 'border border-amber-200 bg-amber-50/60 text-amber-700'
        : tone === 'critical'
          ? 'border border-red-200 bg-red-50/60 text-red-700'
          : 'border border-slate-200 bg-white text-slate-700'

  return (
    <div className={`min-w-0 rounded-lg px-3 py-2.5 shadow-sm ${alert ? 'animate-pulse ring-2 ring-orange-300' : ''} ${cls}`}>
      <p className="truncate text-[11px] font-semibold leading-tight opacity-90">{title}</p>
      <p
        className="mt-1 truncate text-[clamp(1rem,1.25vw,1.25rem)] font-black leading-tight text-slate-900"
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'APROVADO'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'REPROVADO'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{status}</span>
}

function StatusOSBadge({ status }: { status: string }) {
  const cls =
    status === 'AGUARDANDO_REVISAO'
      ? 'bg-indigo-100 text-indigo-700'
      : status === 'AGUARDANDO_APROVACAO'
        ? 'bg-cyan-100 text-cyan-700'
        : status === 'CRITICA'
          ? 'bg-red-100 text-red-700'
          : 'bg-slate-100 text-slate-700'

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{formatarStatusOS(status)}</span>
}

function FotosBadge({ count }: { count: number }) {
  const ok = count >= 3
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {count}/3
    </span>
  )
}

function GuaranteeBadge({ garantia }: { garantia: boolean }) {
  return garantia ? (
    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
      SIM
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
      NÃO
    </span>
  )
}

function limparTelefone(valor: string) {
  return valor.replace(/\D/g, '')
}

function podeEnviarCliente(item: OSItem) {
  return item.status === 'AGUARDANDO_REVISAO' && toNumber(item.total) > 0 && (item.fotos_count ?? 0) >= 3
}

function getMotivoBloqueioEnvio(item: OSItem) {
  if (item.status !== 'AGUARDANDO_REVISAO') return 'A OS precisa estar em revisao admin.'
  if ((item.fotos_count ?? 0) < 3) return 'A OS precisa ter no minimo 3 fotos.'
  if (toNumber(item.total) <= 0) return 'Informe um valor de orcamento maior que zero.'
  return 'Envio indisponivel.'
}

function formatarResumoTecnico(item: OSItem) {
  return [
    item.diagnostico_tecnico ? `Diag: ${item.diagnostico_tecnico}` : '',
    item.servico_executado ? `Serv: ${item.servico_executado}` : '',
    item.pecas_utilizadas ? `Pecas: ${item.pecas_utilizadas}` : '',
  ].filter(Boolean).join(' | ') || '-'
}

function formatarStatusOS(status: string) {
  const nomes: Record<string, string> = {
    AGUARDANDO_REVISAO: 'Revisao admin',
    AGUARDANDO_APROVACAO: 'Aguard. cliente',
    EM_ATENDIMENTO: 'Atendimento',
    EM_TRIAGEM: 'Triagem',
    AGUARDANDO_PECA: 'Aguard. peca',
    CRITICA: 'Critica',
    FINALIZADA: 'Finalizada',
    NOVA: 'Nova',
  }

  return nomes[status] ?? status
}

function abrirOS(id: number) {
  window.location.href = `/admin/os/${id}`
}

function criarLinkConsulta(item: OSItem) {
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'
  const url = new URL('/consulta', baseUrl)

  if (item.numero_os) url.searchParams.set('os', item.numero_os)
  if (item.cliente_whatsapp) url.searchParams.set('whatsapp', item.cliente_whatsapp)

  return url.toString()
}

function formatarEquipamento(item: OSItem) {
  const tipo = item.categoria_nome || 'Equipamento'
  const modelo = item.modelo?.trim()
  const marca = item.marca_nome?.trim()

  return [tipo, marca, modelo].filter(Boolean).join(' - ') || '-'
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0)
}

function pedirValorVisitaTecnico() {
  const resposta = window.prompt(
    'Informe o valor da visita a pagar ao tecnico nesta OS reprovada. Use 0 se nao houver pagamento.',
    '0'
  )

  if (resposta === null) return null

  const normalizado = resposta
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const valor = Number(normalizado)

  if (!Number.isFinite(valor) || valor < 0) {
    window.alert('Valor invalido. Informe um valor igual ou maior que zero.')
    return null
  }

  return Math.round(valor * 100) / 100
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function formatarErro(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message

  if (typeof err === 'string') return err

  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>

    const possiveis = [
      obj.message,
      obj.details,
      obj.hint,
      obj.code,
      obj.error,
      obj.statusText,
    ]
      .filter(Boolean)
      .map(String)

    if (possiveis.length > 0) return possiveis.join(' | ')

    try {
      return JSON.stringify(err, null, 2)
    } catch {
      return fallback
    }
  }

  return fallback
}
