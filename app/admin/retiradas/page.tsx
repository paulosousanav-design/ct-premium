'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Relacao = { nome?: string | null; cpf_cnpj?: string | null; whatsapp?: string | null }
type OrdemRetirada = {
  id: number
  numero_os?: string | null
  status?: string | null
  finalizada_em?: string | null
  modelo?: string | null
  numero_serie?: string | null
  defeito?: string | null
  equipamento_entrega_status?: string | null
  aguardando_retirada_em?: string | null
  cliente_avisado_em?: string | null
  cliente_aviso_meio?: string | null
  clientes?: Relacao | Relacao[] | null
  categorias?: Relacao | Relacao[] | null
  marcas?: Relacao | Relacao[] | null
}
type Modal = { tipo: 'AGUARDAR' | 'AVISAR' | 'ENTREGAR'; ordem: OrdemRetirada } | null

export default function RetiradasPage() {
  const [ordens, setOrdens] = useState<OrdemRetirada[]>([])
  const [estruturaPendente, setEstruturaPendente] = useState(false)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('TODOS')
  const [modal, setModal] = useState<Modal>(null)
  const [meio, setMeio] = useState('WHATSAPP')
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [observacao, setObservacao] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/retiradas')
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar retiradas.')
      setEstruturaPendente(Boolean(payload?.estruturaPendente))
      setOrdens((payload?.ordens ?? []) as OrdemRetirada[])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar retiradas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void Promise.resolve().then(carregar) }, [carregar])

  const filtradas = useMemo(() => ordens.filter((ordem) => {
    const dias = diasAguardando(ordem)
    const texto = `${ordem.numero_os ?? ''} ${nomeCliente(ordem)} ${equipamento(ordem)}`.toLowerCase()
    const atendeBusca = !busca.trim() || texto.includes(busca.trim().toLowerCase())
    const atendeFiltro = filtro === 'TODOS'
      || (filtro === 'DEFINIR' && ordem.equipamento_entrega_status === 'PENDENTE_DEFINICAO')
      || (filtro === 'AGUARDANDO' && ordem.equipamento_entrega_status === 'AGUARDANDO_RETIRADA')
      || (filtro === 'NAO_AVISADO' && ordem.equipamento_entrega_status === 'AGUARDANDO_RETIRADA' && !ordem.cliente_avisado_em)
      || (filtro === 'ATRASADO' && dias >= 7)
    return atendeBusca && atendeFiltro
  }), [busca, filtro, ordens])

  const resumo = useMemo(() => ({
    definir: ordens.filter((item) => item.equipamento_entrega_status === 'PENDENTE_DEFINICAO').length,
    aguardando: ordens.filter((item) => item.equipamento_entrega_status === 'AGUARDANDO_RETIRADA').length,
    naoAvisados: ordens.filter((item) => item.equipamento_entrega_status === 'AGUARDANDO_RETIRADA' && !item.cliente_avisado_em).length,
    seteDias: ordens.filter((item) => diasAguardando(item) >= 7).length,
  }), [ordens])

  function abrirModal(tipo: NonNullable<Modal>['tipo'], ordem: OrdemRetirada) {
    setModal({ tipo, ordem })
    setMeio(tipo === 'AGUARDAR' ? 'NAO_AVISADO' : 'WHATSAPP')
    setNome(nomeCliente(ordem))
    setDocumento('')
    setObservacao('')
    setErro('')
    setMensagem('')
  }

  async function requisicao(acao: string, ordem: OrdemRetirada, dados: Record<string, unknown> = {}) {
    setSalvando(true)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/retiradas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ordem.id, acao, ...dados }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao atualizar retirada.')
      setModal(null)
      setMensagem(acao === 'REGISTRAR_ENTREGA' ? 'Entrega registrada e comprovante preparado.' : 'Situação do equipamento atualizada.')
      await carregar()
      if (acao === 'REGISTRAR_ENTREGA') imprimirComprovante(ordem, String(dados.nome ?? ''), String(dados.documento ?? ''), String(dados.observacao ?? ''), payload?.registradoEm)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao atualizar retirada.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarModal() {
    if (!modal) return
    if (modal.tipo === 'AGUARDAR') await requisicao('AGUARDAR_RETIRADA', modal.ordem, { meio })
    if (modal.tipo === 'AVISAR') await requisicao('REGISTRAR_AVISO', modal.ordem, { meio })
    if (modal.tipo === 'ENTREGAR') await requisicao('REGISTRAR_ENTREGA', modal.ordem, { nome, documento, observacao })
  }

  async function marcarAtendimentoLocal(ordem: OrdemRetirada) {
    if (!window.confirm('Confirmar que o equipamento não ficou na empresa ou que já está com o cliente?')) return
    await requisicao('ATENDIMENTO_LOCAL', ordem, { observacao: 'Atendimento realizado no local ou equipamento ja estava com o cliente.' })
  }

  return <main className="min-h-screen bg-slate-100 p-3 md:p-5">
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div><h1 className="text-3xl font-black text-slate-950">Retirada de equipamentos</h1><p className="text-sm text-slate-500">Custódia, avisos ao cliente e comprovantes de entrega</p></div>
        <Link href="/admin/os" className="rounded-lg bg-slate-950 px-4 py-2.5 text-center text-sm font-bold text-white">Voltar às OS</Link>
      </header>

      {estruturaPendente && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">Rode o arquivo <code>supabase-add-controle-retirada.sql</code> no Supabase para ativar este painel.</div>}
      {erro && <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{mensagem}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Definir situação" valor={resumo.definir} cor="text-amber-700" />
        <Card label="Aguardando retirada" valor={resumo.aguardando} cor="text-blue-700" />
        <Card label="Cliente não avisado" valor={resumo.naoAvisados} cor="text-orange-700" />
        <Card label="7 dias ou mais" valor={resumo.seteDias} cor="text-red-700" />
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_240px]">
          <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por OS, cliente ou equipamento..." className="input" />
          <select value={filtro} onChange={(event) => setFiltro(event.target.value)} className="input">
            <option value="TODOS">Todos os pendentes</option><option value="DEFINIR">Definir situação</option><option value="AGUARDANDO">Aguardando retirada</option><option value="NAO_AVISADO">Cliente não avisado</option><option value="ATRASADO">7 dias ou mais</option>
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-slate-950 text-left text-xs uppercase text-white"><tr><th className="p-3">OS / cliente</th><th className="p-3">Equipamento</th><th className="p-3">Encerramento</th><th className="p-3">Situação física</th><th className="p-3">Aviso</th><th className="p-3">Alerta</th><th className="p-3">Ações</th></tr></thead>
          <tbody>{loading ? <Linha texto="Carregando..." /> : filtradas.length === 0 ? <Linha texto="Nenhum equipamento pendente neste filtro." /> : filtradas.map((ordem) => {
            const dias = diasAguardando(ordem)
            return <tr key={ordem.id} className="border-t align-top">
              <td className="p-3"><p className="font-black text-slate-950">{ordem.numero_os ?? `OS #${ordem.id}`}</p><p>{nomeCliente(ordem)}</p><p className="text-xs text-slate-500">{cliente(ordem)?.whatsapp ?? '-'}</p></td>
              <td className="p-3"><p className="font-bold">{equipamento(ordem)}</p><p className="text-xs text-slate-500">Série: {ordem.numero_serie ?? '-'}</p></td>
              <td className="p-3"><p>{ordem.status === 'ENCERRADA_SEM_REPARO' ? 'Sem reparo' : 'Finalizada'}</p><p className="text-xs text-slate-500">{dataHora(ordem.finalizada_em)}</p></td>
              <td className="p-3"><StatusEntrega status={ordem.equipamento_entrega_status} /></td>
              <td className="p-3">{ordem.cliente_avisado_em ? <><p className="font-bold text-emerald-700">{rotuloMeio(ordem.cliente_aviso_meio)}</p><p className="text-xs text-slate-500">{dataHora(ordem.cliente_avisado_em)}</p></> : <span className="font-bold text-orange-700">Não avisado</span>}</td>
              <td className="p-3"><Alerta dias={dias} pendente={ordem.equipamento_entrega_status === 'PENDENTE_DEFINICAO'} /></td>
              <td className="p-3"><div className="flex max-w-[260px] flex-wrap gap-2">
                {ordem.equipamento_entrega_status === 'PENDENTE_DEFINICAO' ? <><button onClick={() => abrirModal('AGUARDAR', ordem)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white">Ficou na empresa</button><button onClick={() => void marcarAtendimentoLocal(ordem)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">No local/já entregue</button></> : <><button onClick={() => abrirModal('AVISAR', ordem)} className="rounded-lg border border-orange-300 px-3 py-2 text-xs font-black text-orange-700">Registrar aviso</button><button onClick={() => abrirModal('ENTREGAR', ordem)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Registrar entrega</button></>}
                <Link href={`/admin/os/${ordem.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Abrir OS</Link>
              </div></td>
            </tr>
          })}</tbody>
        </table></div>
      </section>
    </div>

    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
      <h2 className="text-xl font-black text-slate-950">{modal.tipo === 'AGUARDAR' ? 'Equipamento ficou na empresa' : modal.tipo === 'AVISAR' ? 'Registrar aviso ao cliente' : 'Registrar entrega do equipamento'}</h2>
      <p className="mt-1 text-sm text-slate-500">{modal.ordem.numero_os} • {nomeCliente(modal.ordem)}</p>
      <div className="mt-5 space-y-4">
        {(modal.tipo === 'AGUARDAR' || modal.tipo === 'AVISAR') && <label className="block text-sm font-bold">{modal.tipo === 'AGUARDAR' ? 'Avisar o cliente agora' : 'Forma do aviso'}<select value={meio} onChange={(event) => setMeio(event.target.value)} className="input mt-1">{modal.tipo === 'AGUARDAR' && <option value="NAO_AVISADO">Ainda não avisado</option>}<option value="WHATSAPP">WhatsApp</option><option value="TELEFONE">Telefone</option><option value="PRESENCIAL">Presencial</option><option value="EMAIL">E-mail</option></select></label>}
        {modal.tipo === 'ENTREGAR' && <><label className="block text-sm font-bold">Nome de quem retirou<input value={nome} onChange={(event) => setNome(event.target.value)} className="input mt-1" /></label><label className="block text-sm font-bold">CPF/documento — opcional<input value={documento} onChange={(event) => setDocumento(event.target.value)} className="input mt-1" /></label><label className="block text-sm font-bold">Observação — opcional<textarea rows={3} value={observacao} onChange={(event) => setObservacao(event.target.value)} className="input mt-1" /></label></>}
      </div>
      <div className="mt-5 flex justify-end gap-3"><button disabled={salvando} onClick={() => setModal(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-black disabled:opacity-60">Cancelar</button><button disabled={salvando} onClick={() => void confirmarModal()} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{salvando ? 'Salvando...' : 'Confirmar'}</button></div>
    </div></div>}
  </main>
}

function Card({ label, valor, cor }: { label: string; valor: number; cor: string }) { return <div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className={`mt-2 text-3xl font-black ${cor}`}>{valor}</p></div> }
function Linha({ texto }: { texto: string }) { return <tr><td colSpan={7} className="p-8 text-center text-slate-500">{texto}</td></tr> }
function StatusEntrega({ status }: { status?: string | null }) { const pendente = status === 'PENDENTE_DEFINICAO'; return <span className={`rounded-full px-2 py-1 text-xs font-black ${pendente ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{pendente ? 'DEFINIR SITUAÇÃO' : 'AGUARDANDO RETIRADA'}</span> }
function Alerta({ dias, pendente }: { dias: number; pendente: boolean }) { if (pendente) return <span className="font-black text-amber-700">Ação necessária</span>; const cls = dias >= 30 ? 'bg-red-600 text-white' : dias >= 15 ? 'bg-red-100 text-red-700' : dias >= 7 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'; return <span className={`rounded-full px-2 py-1 text-xs font-black ${cls}`}>{dias} dia{dias === 1 ? '' : 's'}</span> }
function relacao(value?: Relacao | Relacao[] | null) { return Array.isArray(value) ? value[0] : value }
function cliente(ordem: OrdemRetirada) { return relacao(ordem.clientes) }
function nomeCliente(ordem: OrdemRetirada) { return cliente(ordem)?.nome ?? 'Cliente não identificado' }
function equipamento(ordem: OrdemRetirada) { return [relacao(ordem.categorias)?.nome, relacao(ordem.marcas)?.nome, ordem.modelo].filter(Boolean).join(' • ') || 'Equipamento não informado' }
function dataHora(value?: string | null) { return value ? new Date(value).toLocaleString('pt-BR') : '-' }
function diasAguardando(ordem: OrdemRetirada) { if (ordem.equipamento_entrega_status !== 'AGUARDANDO_RETIRADA') return 0; const inicio = new Date(ordem.aguardando_retirada_em ?? ordem.finalizada_em ?? '').getTime(); return Number.isFinite(inicio) ? Math.max(0, Math.floor((Date.now() - inicio) / 86400000)) : 0 }
function rotuloMeio(value?: string | null) { return ({ WHATSAPP: 'WhatsApp', TELEFONE: 'Telefone', PRESENCIAL: 'Presencial', EMAIL: 'E-mail' } as Record<string, string>)[String(value)] ?? '-' }

function imprimirComprovante(ordem: OrdemRetirada, nome: string, documento: string, observacao: string, registradoEm?: string) {
  const janela = window.open('', '_blank', 'width=850,height=900')
  if (!janela) return
  janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Comprovante de entrega ${esc(ordem.numero_os)}</title><style>@page{size:A4;margin:18mm}body{font-family:Arial;color:#0f172a;font-size:13px}.header{border-bottom:3px solid #f97316;padding-bottom:12px}.brand{font-size:23px;font-weight:900}.title{text-align:center;margin:30px 0 20px}.box{border:1px solid #cbd5e1;border-radius:8px;padding:14px;margin:10px 0;line-height:1.8}.grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 20px}.declaracao{margin-top:25px;line-height:1.7}.assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:70px}.linha{border-top:1px solid #0f172a;padding-top:7px;text-align:center}.footer{margin-top:60px;border-top:1px solid #cbd5e1;padding-top:8px;text-align:center;color:#64748b;font-size:10px}</style></head><body><div class="header"><div class="brand">Chame o Técnico</div><div>CT Premium • Controle de Ordens de Serviço</div></div><div class="title"><h1>Comprovante de entrega de equipamento</h1><b>${esc(ordem.numero_os)}</b></div><div class="box grid"><div><b>Cliente:</b> ${esc(nomeCliente(ordem))}</div><div><b>CPF/CNPJ:</b> ${esc(cliente(ordem)?.cpf_cnpj)}</div><div><b>Equipamento:</b> ${esc(equipamento(ordem))}</div><div><b>Nº de série:</b> ${esc(ordem.numero_serie)}</div><div><b>Entregue para:</b> ${esc(nome)}</div><div><b>Documento:</b> ${esc(documento || '-')}</div><div><b>Data da entrega:</b> ${esc(dataHora(registradoEm))}</div><div><b>Situação da OS:</b> ${esc(ordem.status)}</div></div><p class="declaracao">Declaro que recebi o equipamento acima identificado, referente à ordem de serviço informada, nas condições apresentadas no momento da entrega.</p>${observacao ? `<div class="box"><b>Observação:</b> ${esc(observacao)}</div>` : ''}<div class="assinaturas"><div class="linha">Assinatura de quem recebeu</div><div class="linha">Responsável pela entrega</div></div><div class="footer">Chame o Técnico • www.chameotecnico.com.br • Documento emitido em ${esc(new Date().toLocaleString('pt-BR'))}</div><script>window.onload=()=>window.print()</script></body></html>`)
  janela.document.close()
}
function esc(value: unknown) { return String(value ?? '-').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)) }
