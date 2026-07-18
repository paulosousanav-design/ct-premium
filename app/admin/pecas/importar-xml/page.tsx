'use client'

import Link from 'next/link'
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Peca = {
  id: number
  codigo: string | null
  descricao: string
  valor_custo: number | string | null
  valor_venda: number | string | null
  estoque: number | string | null
}

type ItemConferencia = {
  numeroItem: number
  codigo: string
  codigoBarras: string
  descricao: string
  ncm: string
  cfop: string
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  pecaId: string
  custoUnitario: string
  atualizarCusto: boolean
  valorVenda: string
  categoria: string
  marca: string
  estoqueMinimo: string
  localizacao: string
}

type Parcela = { numero: string; vencimento: string; valor: string }
type Nfe = {
  chaveAcesso: string
  modelo: string
  serie: string
  numero: string
  dataEmissao: string
  fornecedorCnpj: string
  fornecedorNome: string
  valorProdutos: number
  valorFrete: number
  valorSeguro: number
  valorDesconto: number
  valorOutro: number
  valorTotal: number
}
type Importacao = {
  id: number
  numero: string | null
  serie: string | null
  fornecedor_nome: string | null
  fornecedor_cnpj: string | null
  valor_total: number | string
  importado_por: string
  importado_em: string
}

export default function ImportarXmlNfePage() {
  const [xml, setXml] = useState('')
  const [arquivo, setArquivo] = useState('')
  const [nfe, setNfe] = useState<Nfe | null>(null)
  const [pecas, setPecas] = useState<Peca[]>([])
  const [itens, setItens] = useState<ItemConferencia[]>([])
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [pagamentos, setPagamentos] = useState<Array<{ forma: string; valor: number }>>([])
  const [gerarContas, setGerarContas] = useState(false)
  const [ratearDiferenca, setRatearDiferenca] = useState(true)
  const [historico, setHistorico] = useState<Importacao[]>([])
  const [estruturaPendente, setEstruturaPendente] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    void Promise.resolve().then(carregarHistorico)
  }, [])

  const totalParcelas = useMemo(
    () => parcelas.reduce((total, parcela) => total + numero(parcela.valor), 0),
    [parcelas]
  )

  async function carregarHistorico() {
    try {
      const response = await adminFetch('/api/admin/pecas/importar-xml')
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao carregar importacoes.')
      setHistorico(payload?.importacoes ?? [])
      setEstruturaPendente(Boolean(payload?.estruturaPendente))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar importacoes.')
    }
  }

  async function selecionarArquivo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setErro('')
    setMensagem('')
    setNfe(null)
    if (!file.name.toLowerCase().endsWith('.xml')) {
      setErro('Selecione um arquivo com extensao .xml.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErro('O XML excede o limite de 5 MB.')
      return
    }
    setArquivo(file.name)
    setXml(await file.text())
  }

  async function analisar() {
    setProcessando(true)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/pecas/importar-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'ANALISAR', xml }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao analisar XML.')
      const nota = payload.nfe as Nfe
      const diferenca = nota.valorTotal - nota.valorProdutos
      const itensPreparados = (payload.itens as Array<ItemConferencia & { pecaSugeridaId: number | null }>).map((item) => {
        const acrescimo = nota.valorProdutos > 0 ? diferenca * (item.valorTotal / nota.valorProdutos) : 0
        return {
          ...item,
          pecaId: item.pecaSugeridaId ? String(item.pecaSugeridaId) : '',
          custoUnitario: casas((item.valorTotal + acrescimo) / item.quantidade, 6),
          atualizarCusto: true,
          valorVenda: '',
          categoria: '',
          marca: '',
          estoqueMinimo: '0',
          localizacao: '',
        }
      })
      const parcelasXml = (payload.parcelas as Array<{ numero: string; vencimento: string; valor: number }>).map((parcela) => ({
        numero: parcela.numero,
        vencimento: parcela.vencimento,
        valor: casas(parcela.valor, 2),
      }))
      setNfe(nota)
      setPecas(payload.pecas ?? [])
      setItens(itensPreparados)
      setPagamentos(payload.pagamentos ?? [])
      setParcelas(parcelasXml.length ? parcelasXml : [{ numero: '1', vencimento: '', valor: casas(nota.valorTotal, 2) }])
      setGerarContas(parcelasXml.length > 0)
      setRatearDiferenca(true)
      setMensagem('XML lido. Confira os vinculos, custos e vencimentos antes de confirmar.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao analisar XML.')
    } finally {
      setProcessando(false)
    }
  }

  function alterarRateio(ativo: boolean) {
    setRatearDiferenca(ativo)
    if (!nfe) return
    const diferenca = ativo ? nfe.valorTotal - nfe.valorProdutos : 0
    setItens((atuais) => atuais.map((item) => ({
      ...item,
      custoUnitario: casas((item.valorTotal + (nfe.valorProdutos > 0 ? diferenca * (item.valorTotal / nfe.valorProdutos) : 0)) / item.quantidade, 6),
    })))
  }

  function atualizarItem(index: number, campo: keyof ItemConferencia, valor: string | boolean) {
    setItens((atuais) => atuais.map((item, posicao) => posicao === index ? { ...item, [campo]: valor } : item))
  }

  function atualizarParcela(index: number, campo: keyof Parcela, valor: string) {
    setParcelas((atuais) => atuais.map((parcela, posicao) => posicao === index ? { ...parcela, [campo]: valor } : parcela))
  }

  function adicionarParcela() {
    setParcelas((atuais) => [...atuais, { numero: String(atuais.length + 1), vencimento: '', valor: '' }])
  }

  async function confirmar() {
    if (!nfe) return
    setProcessando(true)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/pecas/importar-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'CONFIRMAR', xml, itens, parcelas, gerarContas }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao confirmar importacao.')
      setMensagem(`NF-e importada com sucesso: ${payload.itens} item(ns) no estoque e ${payload.parcelas} parcela(s) em contas a pagar.`)
      setNfe(null)
      setItens([])
      setParcelas([])
      setXml('')
      setArquivo('')
      await carregarHistorico()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao confirmar importacao.')
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-orange-600">Entrada de mercadoria</p>
          <h1 className="text-2xl font-black text-slate-950">Importar XML da NF-e</h1>
          <p className="text-sm text-slate-500">Confira produtos, estoque e vencimentos antes de efetivar a entrada.</p>
        </div>
        <Link href="/admin/pecas" className="rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-bold text-white">Voltar para Pecas</Link>
      </header>

      {erro && <Aviso cor="red">{erro}</Aviso>}
      {mensagem && <Aviso cor="green">{mensagem}</Aviso>}
      {estruturaPendente && <Aviso cor="amber">Rode o arquivo supabase-add-importacao-xml-nfe.sql no Supabase antes de usar esta tela.</Aviso>}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">1. Selecionar a NF-e de compra</h2>
        <p className="mt-1 text-sm text-slate-500">Aceita NF-e de produtos modelo 55. O arquivo nao altera nada durante a analise.</p>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-sm font-bold text-slate-700">
            Arquivo XML
            <input type="file" accept=".xml,text/xml,application/xml" onChange={selecionarArquivo} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <button type="button" disabled={!xml || processando || estruturaPendente} onClick={analisar} className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
            {processando ? 'Processando...' : 'Ler e conferir XML'}
          </button>
        </div>
        {arquivo && <p className="mt-2 text-xs font-bold text-slate-500">Selecionado: {arquivo}</p>}
      </section>

      {nfe && (
        <>
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-orange-600">NF-e {nfe.numero} / serie {nfe.serie}</p>
                <h2 className="text-lg font-black text-slate-950">{nfe.fornecedorNome}</h2>
                <p className="text-sm text-slate-500">CNPJ/CPF {nfe.fornecedorCnpj} · Emissao {data(nfe.dataEmissao)}</p>
                <p className="mt-1 break-all text-xs text-slate-400">Chave {nfe.chaveAcesso}</p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-xs font-bold uppercase text-slate-500">Total da nota</p>
                <p className="text-2xl font-black text-slate-950">{moeda(nfe.valorTotal)}</p>
                <p className="text-xs text-slate-500">Produtos {moeda(nfe.valorProdutos)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">2. Conferir pecas e custos</h2>
            <div className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-bold text-slate-800">Formacao do custo de entrada</p>
                <p className="text-xs text-slate-500">A diferenca entre produtos e total da nota pode ser rateada proporcionalmente.</p>
              </div>
              <select value={ratearDiferenca ? 'RATEAR' : 'PRODUTOS'} onChange={(event) => alterarRateio(event.target.value === 'RATEAR')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold">
                <option value="RATEAR">Ratear diferenca da NF-e</option>
                <option value="PRODUTOS">Usar somente valor dos produtos</option>
              </select>
            </div>
            <div className="mt-4 space-y-3">
              {itens.map((item, index) => {
                const nova = !item.pecaId
                return (
                  <article key={item.numeroItem} className="rounded-xl border border-slate-200 p-4">
                    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.65fr_0.65fr]">
                      <div>
                        <p className="text-xs font-black uppercase text-orange-600">Item {item.numeroItem} · codigo {item.codigo || '-'}</p>
                        <p className="font-black text-slate-950">{item.descricao}</p>
                        <p className="text-xs text-slate-500">NCM {item.ncm || '-'} · CFOP {item.cfop || '-'} · GTIN {item.codigoBarras || '-'}</p>
                      </div>
                      <Campo label="Peca no sistema">
                        <select value={item.pecaId} onChange={(event) => atualizarItem(index, 'pecaId', event.target.value)} className={inputClass}>
                          <option value="">Cadastrar como nova peca</option>
                          {pecas.map((peca) => <option key={peca.id} value={peca.id}>{peca.codigo ? `${peca.codigo} - ` : ''}{peca.descricao} (est. {numero(peca.estoque)})</option>)}
                        </select>
                      </Campo>
                      <Campo label="Quantidade"><input value={casas(item.quantidade, 4)} readOnly className={`${inputClass} bg-slate-50`} /></Campo>
                      <Campo label="Total no XML"><input value={moeda(item.valorTotal)} readOnly className={`${inputClass} bg-slate-50`} /></Campo>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                      <Campo label="Custo unitario de entrada"><input type="number" min="0" step="0.000001" value={item.custoUnitario} onChange={(event) => atualizarItem(index, 'custoUnitario', event.target.value)} className={inputClass} /></Campo>
                      {nova ? <Campo label="Descricao da nova peca"><input value={item.descricao} onChange={(event) => atualizarItem(index, 'descricao', event.target.value)} className={inputClass} /></Campo> : (
                        <label className="flex items-center gap-2 self-end rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700">
                          <input type="checkbox" checked={item.atualizarCusto} onChange={(event) => atualizarItem(index, 'atualizarCusto', event.target.checked)} /> Atualizar custo da peca
                        </label>
                      )}
                      {nova && <Campo label="Valor de venda"><input type="number" min="0" step="0.01" value={item.valorVenda} onChange={(event) => atualizarItem(index, 'valorVenda', event.target.value)} className={inputClass} /></Campo>}
                      {nova && <Campo label="Categoria"><input value={item.categoria} onChange={(event) => atualizarItem(index, 'categoria', event.target.value)} className={inputClass} /></Campo>}
                      {nova && <Campo label="Marca"><input value={item.marca} onChange={(event) => atualizarItem(index, 'marca', event.target.value)} className={inputClass} /></Campo>}
                      {nova && <Campo label="Estoque minimo"><input type="number" min="0" step="0.01" value={item.estoqueMinimo} onChange={(event) => atualizarItem(index, 'estoqueMinimo', event.target.value)} className={inputClass} /></Campo>}
                      {nova && <Campo label="Localizacao"><input value={item.localizacao} onChange={(event) => atualizarItem(index, 'localizacao', event.target.value)} className={inputClass} /></Campo>}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">3. Contas a pagar</h2>
                <p className="text-sm text-slate-500">Os vencimentos e valores podem ser corrigidos antes da confirmacao.</p>
                {pagamentos.length > 0 && <p className="mt-1 text-xs text-slate-500">Pagamento informado no XML: {pagamentos.map((item) => `${item.forma} (${moeda(item.valor)})`).join(', ')}</p>}
              </div>
              <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-black text-slate-800">
                <input type="checkbox" checked={gerarContas} onChange={(event) => setGerarContas(event.target.checked)} /> Gerar contas a pagar
              </label>
            </div>
            {gerarContas && (
              <div className="mt-4 space-y-2">
                {parcelas.map((parcela, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[0.5fr_1fr_1fr_auto] md:items-end">
                    <Campo label="Parcela"><input value={parcela.numero} onChange={(event) => atualizarParcela(index, 'numero', event.target.value)} className={inputClass} /></Campo>
                    <Campo label="Vencimento"><input type="date" value={parcela.vencimento} onChange={(event) => atualizarParcela(index, 'vencimento', event.target.value)} className={inputClass} /></Campo>
                    <Campo label="Valor"><input type="number" min="0.01" step="0.01" value={parcela.valor} onChange={(event) => atualizarParcela(index, 'valor', event.target.value)} className={inputClass} /></Campo>
                    <button type="button" disabled={parcelas.length === 1} onClick={() => setParcelas((atuais) => atuais.filter((_, posicao) => posicao !== index))} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-30">Remover</button>
                  </div>
                ))}
                <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center md:justify-between">
                  <button type="button" onClick={adicionarParcela} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">+ Adicionar parcela</button>
                  <p className={`text-sm font-black ${Math.abs(totalParcelas - nfe.valorTotal) <= 0.02 ? 'text-emerald-700' : 'text-red-700'}`}>Soma: {moeda(totalParcelas)} · NF-e: {moeda(nfe.valorTotal)}</p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border-2 border-slate-900 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Confirmar entrada</h2>
            <p className="mt-1 text-sm text-slate-500">Ao confirmar, o estoque sera atualizado e esta chave nao podera ser importada novamente.</p>
            <button type="button" disabled={processando || (gerarContas && Math.abs(totalParcelas - nfe.valorTotal) > 0.02)} onClick={confirmar} className="mt-4 w-full rounded-lg bg-orange-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
              {processando ? 'Confirmando...' : 'Confirmar importacao da NF-e'}
            </button>
          </section>
        </>
      )}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Importacoes recentes</h2>
        {historico.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nenhuma NF-e importada nesta unidade.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-2">NF-e</th><th className="p-2">Fornecedor</th><th className="p-2">Total</th><th className="p-2">Importada em</th><th className="p-2">Usuario</th></tr></thead>
              <tbody>{historico.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="p-2 font-bold">{item.numero || '-'} / {item.serie || '-'}</td><td className="p-2">{item.fornecedor_nome || '-'}<br /><span className="text-xs text-slate-400">{item.fornecedor_cnpj}</span></td><td className="p-2 font-bold">{moeda(numero(item.valor_total))}</td><td className="p-2">{new Date(item.importado_em).toLocaleString('pt-BR')}</td><td className="p-2 text-xs">{item.importado_por}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
function Campo({ label, children }: { label: string; children: ReactNode }) { return <label className="text-xs font-bold text-slate-600">{label}{children}</label> }
function Aviso({ cor, children }: { cor: 'red' | 'green' | 'amber'; children: ReactNode }) {
  const classe = cor === 'red' ? 'bg-red-50 text-red-700' : cor === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
  return <div className={`rounded-xl px-4 py-3 text-sm font-bold ${classe}`}>{children}</div>
}
function numero(valor: unknown) { const parsed = Number(String(valor ?? '0').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0 }
function casas(valor: number, decimais: number) { return String(Number(valor.toFixed(decimais))) }
function moeda(valor: number) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function data(valor: string) { const parsed = new Date(valor); return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('pt-BR') }
