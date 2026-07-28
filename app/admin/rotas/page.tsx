'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Rota = {
  id: number
  numero_rota: string | null
  origem: string
  destino: string
  data_inicio: string
  data_fim?: string | null
  parceiro_id?: number | null
  motorista_nome?: string | null
  veiculo?: string | null
  km_total: number
  km_planejado?: number
  duracao_planejada_min?: number
  retorna_origem?: boolean
  ordem_otimizada?: number[] | null
  rota_calculada_em?: string | null
  metodo_rateio: 'IGUAL' | 'RECEITA' | 'QUILOMETRAGEM'
  status: 'PLANEJADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'
  observacao?: string | null
}

type Despesa = {
  id: number
  rota_id: number
  tipo: string
  descricao?: string | null
  valor: number
  data_despesa: string
}

type OrdemResumo = {
  id: number
  numero_os?: string | null
  status?: string | null
  modelo?: string | null
  cliente_total?: number | null
  total?: number | null
  clientes?: { nome?: string | null } | Array<{ nome?: string | null }> | null
  garantidores?: { nome?: string | null } | Array<{ nome?: string | null }> | null
}

type Vinculo = {
  id: number
  rota_id: number
  os_id: number
  finalidade: 'COLETA' | 'ATENDIMENTO' | 'ENTREGA' | 'RETORNO' | 'OUTRA'
  km_referencia: number
  receita_referencia: number
  percentual_rateio: number
  custo_rateado: number
  ordem?: OrdemResumo | null
}

type Tecnico = {
  id: number
  responsavel?: string | null
  nome_fantasia?: string | null
}

type Payload = {
  estruturaPendente: boolean
  rotas: Rota[]
  despesas: Despesa[]
  vinculos: Vinculo[]
  ordensDisponiveis: OrdemResumo[]
  tecnicos: Tecnico[]
  mapasConfigurado: boolean
  calculoKmPendente: boolean
}

const hoje = () => new Date().toISOString().slice(0, 10)
const formRotaInicial = {
  origem: 'Naviraí',
  destino: '',
  dataInicio: hoje(),
  dataFim: '',
  parceiroId: '',
  motoristaNome: '',
  veiculo: '',
  kmTotal: '',
  metodoRateio: 'RECEITA',
  observacao: '',
}

export default function RotasPage() {
  const [data, setData] = useState<Payload>({ estruturaPendente: false, rotas: [], despesas: [], vinculos: [], ordensDisponiveis: [], tecnicos: [], mapasConfigurado: false, calculoKmPendente: false })
  const [rotaSelecionadaId, setRotaSelecionadaId] = useState<number | null>(null)
  const [formRota, setFormRota] = useState(formRotaInicial)
  const [novaRotaAberta, setNovaRotaAberta] = useState(false)
  const [despesa, setDespesa] = useState({ tipo: 'COMBUSTIVEL', descricao: '', valor: '', dataDespesa: hoje() })
  const [osId, setOsId] = useState('')
  const [finalidade, setFinalidade] = useState<Vinculo['finalidade']>('ATENDIMENTO')
  const [kmReferencia, setKmReferencia] = useState('')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/rotas', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar rotas.')
      const recebido = payload as Payload
      setData(recebido)
      setRotaSelecionadaId((atual) => atual && recebido.rotas.some((item) => item.id === atual) ? atual : recebido.rotas[0]?.id ?? null)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar rotas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const rota = useMemo(() => data.rotas.find((item) => item.id === rotaSelecionadaId) ?? null, [data.rotas, rotaSelecionadaId])
  const despesasRota = useMemo(() => data.despesas.filter((item) => item.rota_id === rotaSelecionadaId), [data.despesas, rotaSelecionadaId])
  const vinculosRota = useMemo(() => data.vinculos.filter((item) => item.rota_id === rotaSelecionadaId), [data.vinculos, rotaSelecionadaId])
  const ordensDisponiveisRota = useMemo(() => {
    const vinculadasNestaRota = new Set(vinculosRota.map((item) => item.os_id))
    return data.ordensDisponiveis.filter((item) => !vinculadasNestaRota.has(item.id))
  }, [data.ordensDisponiveis, vinculosRota])
  const totalDespesas = useMemo(() => despesasRota.reduce((acc, item) => acc + Number(item.valor ?? 0), 0), [despesasRota])
  const receitaRota = useMemo(() => vinculosRota.reduce((acc, item) => acc + Number(item.receita_referencia ?? 0), 0), [vinculosRota])
  const rotaEditavel = rota ? rota.status === 'PLANEJADA' || rota.status === 'EM_ANDAMENTO' : false

  async function acao(body: Record<string, unknown>, sucesso: string) {
    setSalvando(true)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/rotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Não foi possível concluir a operação.')
      setMensagem(sucesso)
      await carregar()
      return payload
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao atualizar rota.')
      return null
    } finally {
      setSalvando(false)
    }
  }

  async function criarRota(event: FormEvent) {
    event.preventDefault()
    const payload = await acao({ acao: 'CRIAR', ...formRota }, 'Rota criada com sucesso.')
    if (payload?.id) {
      setRotaSelecionadaId(Number(payload.id))
      setFormRota(formRotaInicial)
      setNovaRotaAberta(false)
    }
  }

  async function adicionarDespesa(event: FormEvent) {
    event.preventDefault()
    if (!rota) return
    const resultado = await acao({ acao: 'ADICIONAR_DESPESA', rotaId: rota.id, ...despesa }, 'Despesa adicionada e rateio recalculado.')
    if (resultado) setDespesa({ tipo: 'COMBUSTIVEL', descricao: '', valor: '', dataDespesa: hoje() })
  }

  async function vincularOs(event: FormEvent) {
    event.preventDefault()
    if (!rota) return
    const resultado = await acao({ acao: 'VINCULAR_OS', rotaId: rota.id, osId, finalidade, kmReferencia }, 'OS vinculada e rateio recalculado.')
    if (resultado) {
      setOsId('')
      setFinalidade('ATENDIMENTO')
      setKmReferencia('')
    }
  }

  function alterarMetodo(metodoRateio: Rota['metodo_rateio']) {
    if (!rota) return
    void acao({ acao: 'ATUALIZAR', rotaId: rota.id, metodoRateio }, 'Método de rateio atualizado.')
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="flex flex-col gap-3 rounded-2xl bg-slate-950 p-5 text-white shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-400">Controle operacional</p>
            <h1 className="text-2xl font-black">Gestão de Rotas</h1>
            <p className="mt-1 text-sm text-slate-300">Uma viagem, várias ordens e despesas rateadas automaticamente.</p>
          </div>
          <button type="button" onClick={() => setNovaRotaAberta((value) => !value)} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600">
            {novaRotaAberta ? 'Fechar cadastro' : '+ Nova rota'}
          </button>
        </header>

        {data.estruturaPendente && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            Execute o arquivo <span className="font-black">supabase-add-gestao-rotas.sql</span> no SQL Editor do Supabase para liberar esta área.
          </div>
        )}
        {!data.estruturaPendente && data.calculoKmPendente && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            Para liberar o cálculo automático de quilômetros, execute <span className="font-black">supabase-add-calculo-km-rotas.sql</span> no Supabase.
          </div>
        )}
        {!data.estruturaPendente && !data.mapasConfigurado && (
          <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm font-bold text-blue-900">
            Configure <span className="font-black">GOOGLE_MAPS_API_KEY</span> no servidor para calcular distâncias e tempo de viagem.
          </div>
        )}
        {erro && <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}
        {mensagem && <div className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{mensagem}</div>}

        {novaRotaAberta && !data.estruturaPendente && (
          <form onSubmit={criarRota} className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-black text-slate-950">Dados da nova rota</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Campo label="Origem"><input required value={formRota.origem} onChange={(e) => setFormRota({ ...formRota, origem: e.target.value })} className="input" /></Campo>
              <Campo label="Destino(s)"><input required value={formRota.destino} onChange={(e) => setFormRota({ ...formRota, destino: e.target.value })} placeholder="Campo Grande, Sidrolândia..." className="input" /></Campo>
              <Campo label="Data inicial"><input required type="date" value={formRota.dataInicio} onChange={(e) => setFormRota({ ...formRota, dataInicio: e.target.value })} className="input" /></Campo>
              <Campo label="Data final"><input type="date" value={formRota.dataFim} onChange={(e) => setFormRota({ ...formRota, dataFim: e.target.value })} className="input" /></Campo>
              <Campo label="Técnico/motorista cadastrado">
                <select value={formRota.parceiroId} onChange={(e) => setFormRota({ ...formRota, parceiroId: e.target.value })} className="input">
                  <option value="">Não selecionar</option>
                  {data.tecnicos.map((item) => <option key={item.id} value={item.id}>{nomeTecnico(item)}</option>)}
                </select>
              </Campo>
              <Campo label="Motorista (texto livre)"><input value={formRota.motoristaNome} onChange={(e) => setFormRota({ ...formRota, motoristaNome: e.target.value })} className="input" /></Campo>
              <Campo label="Veículo"><input value={formRota.veiculo} onChange={(e) => setFormRota({ ...formRota, veiculo: e.target.value })} placeholder="Modelo / placa" className="input" /></Campo>
              <Campo label="Quilometragem total"><input type="number" min="0" step="0.01" value={formRota.kmTotal} onChange={(e) => setFormRota({ ...formRota, kmTotal: e.target.value })} className="input" /></Campo>
              <Campo label="Método de rateio">
                <select value={formRota.metodoRateio} onChange={(e) => setFormRota({ ...formRota, metodoRateio: e.target.value })} className="input">
                  <option value="RECEITA">Proporcional ao valor da OS</option>
                  <option value="IGUAL">Igual entre as OS</option>
                  <option value="QUILOMETRAGEM">Por quilometragem</option>
                </select>
              </Campo>
              <label className="md:col-span-2 xl:col-span-3"><span className="text-xs font-black text-slate-600">Observação</span><input value={formRota.observacao} onChange={(e) => setFormRota({ ...formRota, observacao: e.target.value })} className="input mt-1" /></label>
            </div>
            <button disabled={salvando} className="mt-4 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50">Criar rota</button>
          </form>
        )}

        {!data.estruturaPendente && (
          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">Rotas cadastradas</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{data.rotas.length}</span></div>
              {loading ? <p className="text-sm text-slate-500">Carregando...</p> : data.rotas.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma rota cadastrada.</p> : (
                <div className="max-h-[780px] space-y-2 overflow-y-auto pr-1">
                  {data.rotas.map((item) => {
                    const total = data.despesas.filter((despesaItem) => despesaItem.rota_id === item.id).reduce((acc, despesaItem) => acc + Number(despesaItem.valor), 0)
                    const totalOs = data.vinculos.filter((vinculo) => vinculo.rota_id === item.id).length
                    return <button key={item.id} type="button" onClick={() => setRotaSelecionadaId(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${rotaSelecionadaId === item.id ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <div className="flex items-start justify-between gap-2"><div><p className="font-black text-slate-950">{item.numero_rota ?? `Rota #${item.id}`}</p><p className="mt-0.5 text-xs font-bold text-slate-600">{item.origem} → {item.destino}</p></div><Status status={item.status} /></div>
                      <div className="mt-3 flex justify-between text-xs text-slate-500"><span>{dataPt(item.data_inicio)} · {totalOs} OS</span><b className="text-slate-800">{moeda(total)}</b></div>
                    </button>
                  })}
                </div>
              )}
            </section>

            {rota ? (
              <div className="space-y-5">
                <section className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div><p className="text-xs font-black uppercase tracking-wide text-orange-600">{rota.numero_rota}</p><h2 className="text-2xl font-black text-slate-950">{rota.origem} → {rota.destino}</h2><p className="mt-1 text-sm text-slate-500">{dataPt(rota.data_inicio)}{rota.data_fim ? ` a ${dataPt(rota.data_fim)}` : ''} · {rota.veiculo || 'Veículo não informado'} · {rota.km_total || 0} km</p></div>
                    <ControlesStatusRota
                      key={`${rota.id}-${rota.status}`}
                      rota={rota}
                      salvando={salvando}
                      onAcao={acao}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Resumo label="Ordens vinculadas" value={String(vinculosRota.length)} />
                    <Resumo label="Receita das OS" value={moeda(receitaRota)} />
                    <Resumo label="Despesas da rota" value={moeda(totalDespesas)} tom="amber" />
                    <Resumo label="Resultado bruto da rota" value={moeda(receitaRota - totalDespesas)} tom={receitaRota - totalDespesas >= 0 ? 'green' : 'red'} />
                  </div>
                  <CalculoMapaRota
                    key={`${rota.id}-${rota.rota_calculada_em ?? 'sem-calculo'}-${rota.status}`}
                    rota={rota}
                    vinculos={vinculosRota}
                    salvando={salvando}
                    disponivel={data.mapasConfigurado && !data.calculoKmPendente}
                    editavel={rotaEditavel}
                    onAcao={acao}
                  />
                  <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Campo label="Forma de distribuir as despesas">
                      <select value={rota.metodo_rateio} onChange={(e) => alterarMetodo(e.target.value as Rota['metodo_rateio'])} disabled={salvando || !rotaEditavel} className="input">
                        <option value="RECEITA">Proporcional ao valor da OS</option>
                        <option value="IGUAL">Igual entre todas as OS</option>
                        <option value="QUILOMETRAGEM">Proporcional à quilometragem</option>
                      </select>
                    </Campo>
                    <div className="rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-800">{explicacaoRateio(rota.metodo_rateio)}</div>
                    <button type="button" disabled={salvando || !rotaEditavel} onClick={() => void acao({ acao: 'ATUALIZAR', rotaId: rota.id, metodoRateio: rota.metodo_rateio }, 'Valores das OS e rateio atualizados.')} className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-black text-blue-700 disabled:opacity-50">Recalcular valores</button>
                  </div>
                  {!rotaEditavel && (
                    <p className="mt-3 rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-600">
                      Esta rota está encerrada. Os vínculos, despesas e valores rateados estão protegidos contra alterações.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-black">Ordens atendidas na rota</h3>
                  {rotaEditavel && (
                    <form onSubmit={vincularOs} className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_130px_auto]">
                      <select required value={osId} onChange={(e) => setOsId(e.target.value)} className="input">
                        <option value="">Selecione uma OS desta unidade</option>
                        {ordensDisponiveisRota.map((ordem) => <option key={ordem.id} value={ordem.id}>{ordem.numero_os} · {nomePagador(ordem)} · {ordem.modelo ?? '-'}</option>)}
                      </select>
                      <select value={finalidade} onChange={(e) => setFinalidade(e.target.value as Vinculo['finalidade'])} className="input">
                        <option value="COLETA">Coleta</option><option value="ATENDIMENTO">Atendimento</option><option value="ENTREGA">Entrega</option><option value="RETORNO">Retorno</option><option value="OUTRA">Outra</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={kmReferencia} onChange={(e) => setKmReferencia(e.target.value)} placeholder="Km da OS" className="input" />
                      <button disabled={salvando} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Vincular OS</button>
                    </form>
                  )}
                  <div className="mt-4 space-y-2">
                    {vinculosRota.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma OS vinculada.</p> : vinculosRota.map((item) => (
                      <div key={item.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_120px_130px_120px_auto] md:items-center">
                        <div><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/os/${item.os_id}`} className="font-black text-blue-700 hover:underline">{item.ordem?.numero_os ?? `OS #${item.os_id}`}</Link><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">{labelFinalidade(item.finalidade)}</span></div><p className="text-xs text-slate-500">{item.ordem ? nomePagador(item.ordem) : '-'} · Receita {moeda(item.receita_referencia)}</p></div>
                        <p className="text-xs"><span className="block text-slate-500">Peso</span><b>{Number(item.percentual_rateio).toFixed(2)}%</b></p>
                        <label className="text-xs text-slate-500">Km de referência<input type="number" disabled={!rotaEditavel} defaultValue={item.km_referencia} onBlur={(e) => rotaEditavel && void acao({ acao: 'ATUALIZAR_KM_OS', rotaId: rota.id, vinculoId: item.id, kmReferencia: e.target.value }, 'Quilometragem e rateio atualizados.')} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-500" /></label>
                        <p className="text-sm"><span className="block text-xs text-slate-500">Custo rateado</span><b className="text-amber-700">{moeda(item.custo_rateado)}</b></p>
                        {rotaEditavel ? <button type="button" disabled={salvando} onClick={() => window.confirm('Desvincular esta OS da rota?') && void acao({ acao: 'DESVINCULAR_OS', rotaId: rota.id, vinculoId: item.id }, 'OS desvinculada e rateio recalculado.')} className="text-xs font-black text-red-600">Desvincular</button> : <span className="text-xs font-bold text-slate-400">Fechado</span>}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-black">Despesas da viagem</h3>
                  {rotaEditavel && (
                    <form onSubmit={adicionarDespesa} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[170px_160px_minmax(0,1fr)_150px_auto]">
                      <select value={despesa.tipo} onChange={(e) => setDespesa({ ...despesa, tipo: e.target.value })} className="input">
                        <option value="COMBUSTIVEL">Combustível</option><option value="PEDAGIO">Pedágio</option><option value="ALIMENTACAO">Alimentação</option><option value="HOSPEDAGEM">Hospedagem</option><option value="ESTACIONAMENTO">Estacionamento</option><option value="OUTRA">Outra</option>
                      </select>
                      <input required type="date" value={despesa.dataDespesa} onChange={(e) => setDespesa({ ...despesa, dataDespesa: e.target.value })} className="input" />
                      <input value={despesa.descricao} onChange={(e) => setDespesa({ ...despesa, descricao: e.target.value })} placeholder="Descrição opcional" className="input" />
                      <input required type="number" min="0.01" step="0.01" value={despesa.valor} onChange={(e) => setDespesa({ ...despesa, valor: e.target.value })} placeholder="Valor" className="input" />
                      <button disabled={salvando} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Adicionar</button>
                    </form>
                  )}
                  <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Data</th><th>Tipo</th><th>Descrição</th><th className="text-right">Valor</th><th className="text-right">Ação</th></tr></thead><tbody>
                    {despesasRota.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="py-3">{dataPt(item.data_despesa)}</td><td className="font-bold">{labelTipo(item.tipo)}</td><td>{item.descricao || '-'}</td><td className="text-right font-black">{moeda(item.valor)}</td><td className="text-right">{rotaEditavel ? <button type="button" disabled={salvando} onClick={() => window.confirm('Excluir esta despesa?') && void acao({ acao: 'EXCLUIR_DESPESA', rotaId: rota.id, despesaId: item.id }, 'Despesa excluída e rateio recalculado.')} className="text-xs font-black text-red-600">Excluir</button> : <span className="text-xs font-bold text-slate-400">Fechado</span>}</td></tr>)}
                    {despesasRota.length === 0 && <tr><td colSpan={5} className="border-t py-4 text-center text-slate-500">Nenhuma despesa registrada.</td></tr>}
                  </tbody><tfoot><tr className="border-t-2 border-slate-300"><td colSpan={3} className="py-3 font-black">Total da rota</td><td className="text-right text-lg font-black">{moeda(totalDespesas)}</td><td /></tr></tfoot></table></div>
                </section>
              </div>
            ) : <section className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Cadastre ou selecione uma rota.</section>}
          </div>
        )}
      </div>
      <style jsx>{`.input{width:100%;height:42px;border:1px solid #cbd5e1;border-radius:9px;padding:0 12px;background:#fff;font-size:14px;color:#0f172a;outline:none}.input:focus{border-color:#f97316;box-shadow:0 0 0 2px rgba(249,115,22,.12)}`}</style>
    </main>
  )
}

function CalculoMapaRota({
  rota,
  vinculos,
  salvando,
  disponivel,
  editavel,
  onAcao,
}: {
  rota: Rota
  vinculos: Vinculo[]
  salvando: boolean
  disponivel: boolean
  editavel: boolean
  onAcao: (body: Record<string, unknown>, sucesso: string) => Promise<unknown>
}) {
  const [retornaOrigem, setRetornaOrigem] = useState(rota.retorna_origem !== false)
  const kmPlanejado = Number(rota.km_planejado ?? 0)
  const kmReal = Number(rota.km_total ?? 0)
  const desvio = kmPlanejado > 0 && kmReal > 0 ? Math.round(((kmReal - kmPlanejado) / kmPlanejado) * 10_000) / 100 : null
  const ordemIds = Array.isArray(rota.ordem_otimizada) ? rota.ordem_otimizada.map(Number) : []
  const ordem = ordemIds
    .map((osId) => vinculos.find((item) => item.os_id === osId))
    .filter((item): item is Vinculo => Boolean(item))

  return (
    <div className="mt-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-blue-50 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Planejamento inteligente</p>
          <h3 className="text-base font-black text-slate-950">Distância calculada pelos endereços das OS</h3>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {retornaOrigem ? 'Percurso com retorno ao ponto de origem.' : `Percurso encerrando em ${rota.destino}.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MapaResumo label="Km planejado" value={kmPlanejado > 0 ? `${numeroKm(kmPlanejado)} km` : '-'} />
          <MapaResumo label="Tempo estimado" value={rota.duracao_planejada_min ? formatarDuracao(rota.duracao_planejada_min) : '-'} />
          <MapaResumo label="Km realizado" value={kmReal > 0 ? `${numeroKm(kmReal)} km` : '-'} />
          <MapaResumo label="Desvio" value={desvio === null ? '-' : `${desvio > 0 ? '+' : ''}${desvio}%`} destaque={desvio !== null && Math.abs(desvio) > 10} />
        </div>
      </div>

      {editavel && (
        <div className="mt-4 flex flex-col gap-3 border-t border-emerald-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={retornaOrigem} onChange={(event) => setRetornaOrigem(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Retornar ao endereço de origem após a última OS
          </label>
          <button
            type="button"
            disabled={salvando || !disponivel || vinculos.length === 0}
            onClick={() => void onAcao(
              { acao: 'CALCULAR_DISTANCIA', rotaId: rota.id, retornaOrigem },
              'Rota calculada pelo Google Maps. Quilômetros e rateio das OS foram atualizados.'
            )}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Calcular e otimizar rota
          </button>
        </div>
      )}

      {!disponivel && editavel && (
        <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs font-bold text-amber-800">
          Cálculo aguardando o SQL e a chave da Google Maps Platform.
        </p>
      )}

      {ordem.length > 0 && (
        <div className="mt-4 border-t border-emerald-200 pt-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Ordem sugerida das paradas</p>
          <div className="flex flex-wrap gap-2">
            {ordem.map((item, index) => (
              <span key={item.id} className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700">
                {index + 1}. {item.ordem?.numero_os ?? `OS #${item.os_id}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ControlesStatusRota({
  rota,
  salvando,
  onAcao,
}: {
  rota: Rota
  salvando: boolean
  onAcao: (body: Record<string, unknown>, sucesso: string) => Promise<unknown>
}) {
  const [dataFim, setDataFim] = useState(rota.data_fim || hoje())
  const [kmTotal, setKmTotal] = useState(rota.km_total > 0 ? String(rota.km_total) : '')

  if (rota.status === 'PLANEJADA') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Status status={rota.status} />
        <button
          type="button"
          disabled={salvando}
          onClick={() => void onAcao({ acao: 'INICIAR_ROTA', rotaId: rota.id }, 'Rota iniciada. Despesas e atendimentos podem ser registrados durante a viagem.')}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Iniciar rota
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => window.confirm('Cancelar esta rota planejada?') && void onAcao({ acao: 'CANCELAR_ROTA', rotaId: rota.id }, 'Rota cancelada.')}
          className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-700 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    )
  }

  if (rota.status === 'EM_ANDAMENTO') {
    return (
      <div className="w-full max-w-xl rounded-xl border border-blue-200 bg-blue-50 p-3 lg:w-auto">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-black text-blue-900">Fechamento da rota</p>
          <Status status={rota.status} />
        </div>
        <div className="grid gap-2 sm:grid-cols-[145px_145px_auto]">
          <label className="text-[10px] font-black uppercase text-blue-800">
            Data final
            <input type="date" value={dataFim} onChange={(event) => setDataFim(event.target.value)} className="mt-1 h-[42px] w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500" />
          </label>
          <label className="text-[10px] font-black uppercase text-blue-800">
            Km total realizado
            <input type="number" min="0.01" step="0.01" value={kmTotal} onChange={(event) => setKmTotal(event.target.value)} className="mt-1 h-[42px] w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500" />
          </label>
          <button
            type="button"
            disabled={salvando || !dataFim || Number(kmTotal) <= 0}
            onClick={() => window.confirm('Concluir a rota e proteger os valores rateados?') && void onAcao({ acao: 'CONCLUIR_ROTA', rotaId: rota.id, dataFim, kmTotal }, 'Rota concluída. O rateio foi recalculado e os valores foram protegidos.')}
            className="self-end rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Concluir rota
          </button>
        </div>
        <button
          type="button"
          disabled={salvando}
          onClick={() => window.confirm('Cancelar esta rota em andamento?') && void onAcao({ acao: 'CANCELAR_ROTA', rotaId: rota.id }, 'Rota cancelada.')}
          className="mt-2 text-[11px] font-black text-red-700"
        >
          Cancelar rota
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Status status={rota.status} />
      <button
        type="button"
        disabled={salvando}
        onClick={() => window.confirm('Reabrir esta rota permitirá alterar vínculos, despesas e rateio. Continuar?') && void onAcao({ acao: 'REABRIR_ROTA', rotaId: rota.id }, 'Rota reaberta para ajustes.')}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Reabrir rota
      </button>
    </div>
  )
}

function MapaResumo({ label, value, destaque = false }: { label: string; value: string; destaque?: boolean }) {
  return <div className={`min-w-28 rounded-xl border bg-white px-3 py-2 ${destaque ? 'border-amber-300 text-amber-800' : 'border-white text-slate-900'}`}><p className="text-[9px] font-black uppercase text-slate-500">{label}</p><p className="mt-0.5 text-sm font-black">{value}</p></div>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-black text-slate-600">{label}<div className="mt-1">{children}</div></label> }
function Resumo({ label, value, tom = 'slate' }: { label: string; value: string; tom?: 'slate' | 'green' | 'amber' | 'red' }) {
  const cores = { slate: 'bg-slate-50 text-slate-950', green: 'bg-emerald-50 text-emerald-800', amber: 'bg-amber-50 text-amber-800', red: 'bg-red-50 text-red-800' }
  return <div className={`rounded-xl p-3 ${cores[tom]}`}><p className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>
}
function Status({ status }: { status: Rota['status'] }) {
  const cores = status === 'CONCLUIDA' ? 'bg-emerald-100 text-emerald-800' : status === 'EM_ANDAMENTO' ? 'bg-blue-100 text-blue-800' : status === 'CANCELADA' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
  return <span className={`rounded-full px-2 py-1 text-[10px] font-black ${cores}`}>{status.replaceAll('_', ' ')}</span>
}
function nomeTecnico(item: Tecnico) { return item.responsavel || item.nome_fantasia || `Técnico #${item.id}` }
function nomePagador(ordem: OrdemResumo) {
  const garantidor = Array.isArray(ordem.garantidores) ? ordem.garantidores[0] : ordem.garantidores
  const cliente = Array.isArray(ordem.clientes) ? ordem.clientes[0] : ordem.clientes
  return garantidor?.nome || cliente?.nome || 'Cliente não identificado'
}
function moeda(value: number | string | null | undefined) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0)) }
function dataPt(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') }
function labelTipo(value: string) { return ({ COMBUSTIVEL: 'Combustível', PEDAGIO: 'Pedágio', ALIMENTACAO: 'Alimentação', HOSPEDAGEM: 'Hospedagem', ESTACIONAMENTO: 'Estacionamento', OUTRA: 'Outra' } as Record<string, string>)[value] ?? value }
function labelFinalidade(value: Vinculo['finalidade']) { return ({ COLETA: 'Coleta', ATENDIMENTO: 'Atendimento', ENTREGA: 'Entrega', RETORNO: 'Retorno', OUTRA: 'Outra' } as Record<string, string>)[value] ?? value }
function numeroKm(value: number) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value) }
function formatarDuracao(value: number) {
  const minutos = Math.max(Math.round(Number(value) || 0), 0)
  const horas = Math.floor(minutos / 60)
  const restante = minutos % 60
  return horas > 0 ? `${horas}h ${restante}min` : `${restante}min`
}
function explicacaoRateio(value: Rota['metodo_rateio']) {
  if (value === 'IGUAL') return 'Todas as OS recebem a mesma parcela das despesas, independentemente do valor ou distância.'
  if (value === 'QUILOMETRAGEM') return 'Cada OS absorve as despesas conforme os quilômetros de referência informados no vínculo.'
  return 'As OS com maior faturamento absorvem proporcionalmente uma parcela maior das despesas da viagem.'
}
