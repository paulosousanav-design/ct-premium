'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/admin-fetch'

type OrdemServico = {
  id: number
  numero_os: string
  status: string
  modelo: string | null
  categoria_nome?: string
  marca_nome?: string
  created_at: string
  finalizada_em: string | null
  cliente_nome?: string
  garantia: boolean | null
  total: number | string | null
  cliente_total?: number | string | null
  status_financeiro?: string | null
  tecnico_nome?: string
}

type OrdemServicoSupabase = Omit<OrdemServico, 'categoria_nome' | 'marca_nome' | 'cliente_nome' | 'tecnico_nome'> & {
  clientes?: RelacaoNome | RelacaoNome[] | null
  categorias?: RelacaoNome | RelacaoNome[] | null
  marcas?: RelacaoNome | RelacaoNome[] | null
  parceiros?: RelacaoTecnico | RelacaoTecnico[] | null
}

type RelacaoNome = { nome: string | null }
type RelacaoTecnico = { responsavel?: string | null; nome_fantasia?: string | null }

export default function FinalizadasPage() {
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [unidadeNome, setUnidadeNome] = useState('Unidade selecionada')

  const carregarOrdens = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/finalizadas')
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar as OS finalizadas.')
      const data = payload?.data

      setOrdens(
        ((data ?? []) as unknown as OrdemServicoSupabase[]).map((item) => {
          const tecnico = primeiraRelacao(item.parceiros)
          return {
            ...item,
            categoria_nome: primeiraRelacao(item.categorias)?.nome ?? '',
            marca_nome: primeiraRelacao(item.marcas)?.nome ?? '',
            cliente_nome: primeiraRelacao(item.clientes)?.nome ?? '-',
            tecnico_nome: tecnico?.responsavel ?? tecnico?.nome_fantasia ?? '-',
          }
        })
      )

      setUnidadeNome(String(payload?.unidadeNome ?? 'Unidade selecionada'))
    } catch (error) {
      setErro(formatarErro(error, 'Erro ao carregar as OS finalizadas.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(carregarOrdens)
  }, [carregarOrdens])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return ordens.filter((os) => {
      const data = dataFinalizacao(os).slice(0, 10)
      if (inicio && data < inicio) return false
      if (fim && data > fim) return false
      if (!termo) return true
      return [os.numero_os, os.cliente_nome, os.categoria_nome, os.marca_nome, os.modelo, os.tecnico_nome, os.status_financeiro]
        .filter(Boolean).join(' ').toLowerCase().includes(termo)
    })
  }, [busca, fim, inicio, ordens])

  const resumo = useMemo(() => ({
    quantidade: filtradas.length,
    total: filtradas.reduce((soma, os) => soma + valorOs(os), 0),
    garantias: filtradas.filter((os) => os.garantia).length,
    recebidas: filtradas.filter((os) => String(os.status_financeiro ?? '').toUpperCase() === 'RECEBIDO').length,
  }), [filtradas])

  function exportarExcel() {
    if (!filtradas.length) return window.alert('Nenhuma OS encontrada com os filtros informados.')
    const html = montarRelatorioHtml(filtradas, { unidadeNome, inicio, fim, busca, formato: 'excel' })
    baixarArquivo(`\ufeff${html}`, `os-finalizadas-${dataArquivo()}.xls`, 'application/vnd.ms-excel;charset=utf-8')
  }

  function exportarPdf() {
    if (!filtradas.length) return window.alert('Nenhuma OS encontrada com os filtros informados.')
    const janela = window.open('', '_blank', 'width=1100,height=820')
    if (!janela) return window.alert('Permita a abertura de janelas para gerar o relatório em PDF.')
    janela.document.write(montarRelatorioHtml(filtradas, { unidadeNome, inicio, fim, busca, formato: 'pdf' }))
    janela.document.close()
  }

  return (
    <main className="p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-950 md:text-3xl">Cofre de OS Finalizadas</h1>
              <p className="mt-1 text-sm text-slate-500">Ordens encerradas, protegidas e disponíveis para relatório.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportarExcel} disabled={loading} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 disabled:opacity-50">Relatório Excel</button>
              <button type="button" onClick={exportarPdf} disabled={loading} className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-black text-red-700 disabled:opacity-50">Relatório PDF</button>
              <button type="button" onClick={() => void carregarOrdens()} disabled={loading} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Atualizar</button>
            </div>
          </div>
        </header>

        {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1.5fr_180px_180px_auto] lg:items-end">
            <Campo label="Buscar">
              <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="OS, cliente, equipamento ou técnico..." className="input-relatorio" />
            </Campo>
            <Campo label="Finalizada de">
              <input type="date" value={inicio} onChange={(event) => setInicio(event.target.value)} className="input-relatorio" />
            </Campo>
            <Campo label="Finalizada até">
              <input type="date" value={fim} onChange={(event) => setFim(event.target.value)} className="input-relatorio" />
            </Campo>
            <button type="button" onClick={() => { setBusca(''); setInicio(''); setFim('') }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700">Limpar filtros</button>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ResumoCard label="OS no relatório" valor={String(resumo.quantidade)} />
          <ResumoCard label="Valor total" valor={formatCurrency(resumo.total)} />
          <ResumoCard label="Em garantia" valor={String(resumo.garantias)} />
          <ResumoCard label="Financeiro recebido" valor={String(resumo.recebidas)} />
        </div>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div><h2 className="font-black text-slate-950">OS finalizadas</h2><p className="text-xs text-slate-500">{unidadeNome}</p></div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{filtradas.length} registros</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">OS</th><th className="p-3">Cliente</th><th className="p-3">Equipamento</th><th className="p-3">Técnico</th><th className="p-3">Garantia</th><th className="p-3">Total</th><th className="p-3">Financeiro</th><th className="p-3">Finalizada em</th><th className="p-3">Ações</th></tr></thead>
              <tbody>
                {loading ? <LinhaMensagem texto="Carregando..." /> : filtradas.length === 0 ? <LinhaMensagem texto="Nenhuma OS finalizada encontrada." /> : filtradas.map((os) => (
                  <tr key={os.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-black text-slate-950">{os.numero_os ?? '-'}</td><td className="p-3">{os.cliente_nome ?? '-'}</td><td className="p-3 font-bold">{formatarEquipamento(os)}</td><td className="p-3">{os.tecnico_nome ?? '-'}</td><td className="p-3">{os.garantia ? 'SIM' : 'NÃO'}</td><td className="p-3 font-black">{formatCurrency(valorOs(os))}</td><td className="p-3">{formatarStatusFinanceiro(os.status_financeiro)}</td><td className="p-3 whitespace-nowrap">{formatDate(dataFinalizacao(os))}</td><td className="p-3"><Link href={`/admin/os/${os.id}`} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Visualizar</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <style jsx global>{`.input-relatorio{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.65rem .8rem;font-size:.875rem;outline:none}.input-relatorio:focus{border-color:#10b981;box-shadow:0 0 0 2px rgba(16,185,129,.12)}`}</style>
    </main>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-600">{label}</span>{children}</label> }
function ResumoCard({ label, valor }: { label: string; valor: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-950 md:text-2xl">{valor}</p></div> }
function LinhaMensagem({ texto }: { texto: string }) { return <tr><td colSpan={9} className="p-7 text-center font-bold text-slate-500">{texto}</td></tr> }
function primeiraRelacao<T>(relacao?: T | T[] | null) { return Array.isArray(relacao) ? relacao[0] : relacao }
function valorOs(os: OrdemServico) { return toNumber(os.cliente_total ?? os.total) }
function dataFinalizacao(os: OrdemServico) { return os.finalizada_em ?? os.created_at }
function formatarEquipamento(os: OrdemServico) { return [os.categoria_nome, os.marca_nome, os.modelo].filter(Boolean).join(' / ') || '-' }
function toNumber(value: number | string | null | undefined) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
function formatCurrency(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0) }
function formatDate(value: string) { return new Date(value).toLocaleString('pt-BR') }
function formatarStatusFinanceiro(value?: string | null) { const status = String(value ?? 'PENDENTE').toUpperCase(); return ({ RECEBIDO: 'Recebido', PARCIAL: 'Parcial', FATURADO: 'Faturado', PENDENTE: 'Pendente' } as Record<string, string>)[status] ?? status }
function formatarErro(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
function dataArquivo() { return new Date().toISOString().slice(0, 10) }
function escapeHtml(value: unknown) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char) }
function baixarArquivo(conteudo: string, nome: string, tipo: string) { const blob = new Blob([conteudo], { type: tipo }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = nome; link.click(); URL.revokeObjectURL(url) }

function montarRelatorioHtml(ordens: OrdemServico[], contexto: { unidadeNome: string; inicio: string; fim: string; busca: string; formato: 'excel' | 'pdf' }) {
  const total = ordens.reduce((soma, os) => soma + valorOs(os), 0)
  const periodo = contexto.inicio || contexto.fim ? `${contexto.inicio ? formatDateInput(contexto.inicio) : 'início'} a ${contexto.fim ? formatDateInput(contexto.fim) : 'hoje'}` : 'Todo o período'
  const linhas = ordens.map((os) => `<tr><td>${escapeHtml(os.numero_os)}</td><td>${escapeHtml(os.cliente_nome)}</td><td>${escapeHtml(formatarEquipamento(os))}</td><td>${escapeHtml(os.tecnico_nome)}</td><td>${os.garantia ? 'SIM' : 'NÃO'}</td><td class="money">${escapeHtml(formatCurrency(valorOs(os)))}</td><td>${escapeHtml(formatarStatusFinanceiro(os.status_financeiro))}</td><td>${escapeHtml(formatDate(dataFinalizacao(os)))}</td></tr>`).join('')
  const autoPrint = contexto.formato === 'pdf' ? '<script>window.onload=()=>window.print()</script>' : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>Relatório de OS Finalizadas</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#0f172a;margin:0;font-size:11px}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f97316;padding-bottom:12px;margin-bottom:14px}.brand{font-size:20px;font-weight:900}.subtitle{font-size:13px;font-weight:800;margin-top:3px}.meta{text-align:right;color:#475569}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}.card{border:1px solid #cbd5e1;border-radius:7px;padding:9px}.card small{display:block;text-transform:uppercase;color:#64748b;font-weight:700}.card b{display:block;font-size:15px;margin-top:3px}table{width:100%;border-collapse:collapse}th{background:#0f172a;color:white;text-align:left;padding:7px;font-size:9px;text-transform:uppercase}td{padding:7px;border-bottom:1px solid #e2e8f0;vertical-align:top}.money{white-space:nowrap;font-weight:700}.footer{margin-top:14px;border-top:1px solid #cbd5e1;padding-top:7px;color:#64748b;font-size:9px}</style></head><body><div class="header"><div><div class="brand">Chame o Técnico</div><div class="subtitle">Relatório de OS Finalizadas</div><div>${escapeHtml(contexto.unidadeNome)}</div></div><div class="meta">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}<br>Período: ${escapeHtml(periodo)}${contexto.busca ? `<br>Busca: ${escapeHtml(contexto.busca)}` : ''}</div></div><div class="summary"><div class="card"><small>OS finalizadas</small><b>${ordens.length}</b></div><div class="card"><small>Valor total</small><b>${escapeHtml(formatCurrency(total))}</b></div><div class="card"><small>Em garantia</small><b>${ordens.filter((os) => os.garantia).length}</b></div></div><table><thead><tr><th>OS</th><th>Cliente</th><th>Equipamento</th><th>Técnico</th><th>Garantia</th><th>Total</th><th>Financeiro</th><th>Finalizada em</th></tr></thead><tbody>${linhas}</tbody></table><div class="footer">Chame o Técnico • www.chameotecnico.com.br • ${ordens.length} registro(s)</div>${autoPrint}</body></html>`
}

function formatDateInput(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') }
