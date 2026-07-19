'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type BaseCalculo = 'COMPETENCIA' | 'CAIXA'
type Resumo = {
  receitaBruta: number
  deducoes: number
  receitaLiquida: number
  custosDiretos: number
  lucroBruto: number
  despesasOperacionais: number
  receitasFinanceiras: number
  despesasFinanceiras: number
  despesasNaoOperacionais: number
  investimentos: number
  resultadoOperacional: number
  resultadoLiquido: number
  margemBruta: number
  margemOperacional: number
}
type Dre = {
  filtros: { inicio: string; fim: string; base: BaseCalculo; consolidado: boolean }
  resumo: Resumo
  linhas: {
    receitaServicos: number
    receitaPecasOs: number
    receitaVendas: number
    descontos: number
    impostosSobreVendas: number
    receitasFinanceiras: number
    custoPecasOs: number
    custoVendas: number
    custoTecnicos: number
    custosContas: number
  }
  despesasCategorias: Array<{ categoria: string; valor: number }>
  meses: Array<{ chave: string; label: string; receita: number; custos: number; despesas: number; resultado: number }>
  contagens: { ordens: number; vendas: number; despesas: number }
  avisos: string[]
  classificacaoPendente: boolean
  detalhes: Record<string, Detalhe[]>
}

type Detalhe = { id: string; origem: string; documento: string; descricao: string; data: string | null; valor: number }

function periodoInicial() {
  const hoje = new Date()
  return {
    inicio: dataInput(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    fim: dataInput(hoje),
  }
}

export default function DrePage() {
  const periodo = useMemo(() => periodoInicial(), [])
  const [inicio, setInicio] = useState(periodo.inicio)
  const [fim, setFim] = useState(periodo.fim)
  const [base, setBase] = useState<BaseCalculo>('COMPETENCIA')
  const [dados, setDados] = useState<Dre | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [detalheAtivo, setDetalheAtivo] = useState<{ chave: string; titulo: string } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const params = new URLSearchParams({ inicio, fim, base })
      const response = await adminFetch(`/api/admin/dre?${params.toString()}`)
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Não foi possível calcular o DRE.')
      setDados(payload as Dre)
      setDetalheAtivo(null)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível calcular o DRE.')
    } finally {
      setCarregando(false)
    }
  }, [base, fim, inicio])

  useEffect(() => {
    const timer = window.setTimeout(() => void carregar(), 0)
    return () => window.clearTimeout(timer)
  }, [carregar])

  function aplicarAtalho(meses: number) {
    const hoje = new Date()
    const inicial = new Date(hoje.getFullYear(), hoje.getMonth() - meses + 1, 1)
    setInicio(dataInput(inicial))
    setFim(dataInput(hoje))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-col gap-3 rounded-2xl bg-slate-950 p-5 text-white shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-400">Gestão financeira</p>
          <h1 className="mt-1 text-2xl font-black">DRE gerencial</h1>
          <p className="mt-1 text-sm text-slate-300">Receitas, custos, despesas e resultado do período.</p>
        </div>
        <button type="button" onClick={() => window.print()} className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black hover:bg-slate-900">
          Imprimir DRE
        </button>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm print:hidden">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
          <Campo label="Data inicial">
            <input type="date" value={inicio} onChange={(event) => setInicio(event.target.value)} className="input-dre" />
          </Campo>
          <Campo label="Data final">
            <input type="date" value={fim} onChange={(event) => setFim(event.target.value)} className="input-dre" />
          </Campo>
          <Campo label="Regime de visualização">
            <select value={base} onChange={(event) => setBase(event.target.value as BaseCalculo)} className="input-dre">
              <option value="COMPETENCIA">Competência — operação realizada</option>
              <option value="CAIXA">Caixa — valores recebidos e pagos</option>
            </select>
          </Campo>
          <button type="button" onClick={() => void carregar()} className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white hover:bg-orange-700">
            Atualizar
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Atalho onClick={() => aplicarAtalho(1)}>Mês atual</Atalho>
          <Atalho onClick={() => aplicarAtalho(3)}>Últimos 3 meses</Atalho>
          <Atalho onClick={() => aplicarAtalho(6)}>Últimos 6 meses</Atalho>
          <Atalho onClick={() => aplicarAtalho(12)}>Últimos 12 meses</Atalho>
        </div>
      </section>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}
      {carregando && <div className="rounded-xl bg-white p-5 text-sm font-bold text-slate-600 shadow-sm">Calculando o DRE...</div>}

      {!carregando && dados && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="Receita líquida" valor={dados.resumo.receitaLiquida} detalhe={`${dados.contagens.ordens} OS • ${dados.contagens.vendas} vendas`} />
            <Card label="Lucro bruto" valor={dados.resumo.lucroBruto} detalhe={`Margem ${percent(dados.resumo.margemBruta)}`} tom={dados.resumo.lucroBruto >= 0 ? 'green' : 'red'} />
            <Card label="Despesas operacionais" valor={dados.resumo.despesasOperacionais} detalhe={`${dados.contagens.despesas} lançamentos`} tom="amber" />
            <Card label="Resultado líquido gerencial" valor={dados.resumo.resultadoLiquido} detalhe={`Margem ${percent(dados.resumo.margemOperacional)}`} tom={dados.resumo.resultadoLiquido >= 0 ? 'green' : 'red'} destaque />
          </div>

          {dados.avisos.map((aviso) => (
            <div key={aviso} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{aviso}</div>
          ))}
          {dados.classificacaoPendente && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">Execute o arquivo <code>supabase-add-classificacao-dre.sql</code> para liberar a classificação contábil individual das contas.</div>}

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-black text-slate-950">Demonstrativo do resultado</h2>
              <p className="text-xs text-slate-500">{formatDate(dados.filtros.inicio)} a {formatDate(dados.filtros.fim)} • {dados.filtros.base === 'COMPETENCIA' ? 'Regime de competência' : 'Visão de caixa gerencial'}</p>
            </div>
            <div className="divide-y divide-slate-100 text-sm">
              <Linha label="(+) Receita bruta" valor={dados.resumo.receitaBruta} forte />
              <Linha label="Serviços de OS" valor={dados.linhas.receitaServicos} nivel={1} onDetalhe={() => setDetalheAtivo({ chave: 'receitaServicos', titulo: 'Receitas de serviços de OS' })} />
              <Linha label="Peças aplicadas em OS" valor={dados.linhas.receitaPecasOs} nivel={1} onDetalhe={() => setDetalheAtivo({ chave: 'receitaPecasOs', titulo: 'Receitas de peças aplicadas em OS' })} />
              <Linha label="Vendas de balcão" valor={dados.linhas.receitaVendas} nivel={1} onDetalhe={() => setDetalheAtivo({ chave: 'receitaVendas', titulo: 'Vendas de balcão' })} />
              <Linha label="(-) Descontos comerciais" valor={-dados.linhas.descontos} onDetalhe={() => setDetalheAtivo({ chave: 'descontos', titulo: 'Descontos comerciais' })} />
              <Linha label="(-) Impostos sobre vendas e serviços" valor={-dados.linhas.impostosSobreVendas} onDetalhe={() => setDetalheAtivo({ chave: 'impostosSobreVendas', titulo: 'Impostos sobre vendas e serviços' })} />
              <Linha label="(=) Receita líquida" valor={dados.resumo.receitaLiquida} forte fundo="blue" />
              <Linha label="(-) Custos diretos" valor={-dados.resumo.custosDiretos} forte />
              <Linha label="Custo das peças utilizadas em OS" valor={-dados.linhas.custoPecasOs} nivel={1} onDetalhe={() => setDetalheAtivo({ chave: 'custoPecasOs', titulo: 'Custos das peças utilizadas em OS' })} />
              <Linha label="Custo dos produtos vendidos" valor={-dados.linhas.custoVendas} nivel={1} onDetalhe={() => setDetalheAtivo({ chave: 'custoVendas', titulo: 'Custos dos produtos vendidos' })} />
              <Linha label="Técnicos próprios, terceiros e comissões" valor={-dados.linhas.custoTecnicos} nivel={1} onDetalhe={() => setDetalheAtivo({ chave: 'custoTecnicos', titulo: 'Custos técnicos e comissões' })} />
              <Linha label="Outros custos diretos lançados" valor={-dados.linhas.custosContas} nivel={1} onDetalhe={() => setDetalheAtivo({ chave: 'custosContas', titulo: 'Outros custos diretos' })} />
              <Linha label="(=) Lucro bruto" valor={dados.resumo.lucroBruto} forte fundo={dados.resumo.lucroBruto >= 0 ? 'green' : 'red'} />
              <Linha label="(-) Despesas operacionais" valor={-dados.resumo.despesasOperacionais} forte />
              {dados.despesasCategorias.map((item) => <Linha key={item.categoria} label={formatLabel(item.categoria)} valor={-item.valor} nivel={1} onDetalhe={() => setDetalheAtivo({ chave: `despesa:${item.categoria}`, titulo: `Despesas — ${formatLabel(item.categoria)}` })} />)}
              <Linha label="(=) Resultado operacional" valor={dados.resumo.resultadoOperacional} forte grande fundo={dados.resumo.resultadoOperacional >= 0 ? 'green' : 'red'} />
              <Linha label="(+) Receitas financeiras (juros e multas)" valor={dados.resumo.receitasFinanceiras} onDetalhe={() => setDetalheAtivo({ chave: 'receitasFinanceiras', titulo: 'Receitas financeiras' })} />
              <Linha label="(-) Despesas financeiras" valor={-dados.resumo.despesasFinanceiras} onDetalhe={() => setDetalheAtivo({ chave: 'despesasFinanceiras', titulo: 'Despesas financeiras' })} />
              <Linha label="(-) Despesas não operacionais" valor={-dados.resumo.despesasNaoOperacionais} onDetalhe={() => setDetalheAtivo({ chave: 'despesasNaoOperacionais', titulo: 'Despesas não operacionais' })} />
              <Linha label="(=) Resultado líquido gerencial" valor={dados.resumo.resultadoLiquido} forte grande fundo={dados.resumo.resultadoLiquido >= 0 ? 'green' : 'red'} />
              <Linha label="Investimentos no período (fora do DRE)" valor={-dados.resumo.investimentos} onDetalhe={() => setDetalheAtivo({ chave: 'investimentos', titulo: 'Investimentos — não reduzem o resultado' })} />
            </div>
          </section>

          {detalheAtivo && <PainelDetalhes titulo={detalheAtivo.titulo} itens={dados.detalhes[detalheAtivo.chave] ?? []} onFechar={() => setDetalheAtivo(null)} />}

          {dados.meses.length > 0 && (
            <section className="overflow-hidden rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-slate-950">Evolução mensal</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="p-3">Mês</th><th className="p-3 text-right">Receita</th><th className="p-3 text-right">Custos diretos</th><th className="p-3 text-right">Despesas</th><th className="p-3 text-right">Resultado</th></tr></thead>
                  <tbody>{dados.meses.map((mes) => <tr key={mes.chave} className="border-b border-slate-100 last:border-0"><td className="p-3 font-black capitalize">{mes.label}</td><td className="p-3 text-right">{money(mes.receita)}</td><td className="p-3 text-right text-red-700">{money(mes.custos)}</td><td className="p-3 text-right text-amber-700">{money(mes.despesas)}</td><td className={`p-3 text-right font-black ${mes.resultado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{money(mes.resultado)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}

          <p className="px-2 pb-5 text-xs leading-5 text-slate-600">
            DRE gerencial para apoio à decisão. A classificação contábil e tributária oficial deve ser validada pelo contador da empresa.
          </p>
        </>
      )}

      <style jsx global>{`
        .input-dre { width: 100%; border: 1px solid #cbd5e1; border-radius: 0.75rem; background: white; padding: 0.75rem; font-size: 0.875rem; font-weight: 700; color: #0f172a; outline: none; }
        .input-dre:focus { border-color: #f97316; box-shadow: 0 0 0 2px rgba(249,115,22,.12); }
        @media print { aside, header button, .print\\:hidden { display: none !important; } main { padding: 0 !important; } body, main { background: white !important; } }
      `}</style>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-600">{label}</span>{children}</label>
}

function Atalho({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 hover:border-orange-300 hover:text-orange-700">{children}</button>
}

function Card({ label, valor, detalhe, tom = 'blue', destaque = false }: { label: string; valor: number; detalhe: string; tom?: 'blue' | 'green' | 'amber' | 'red'; destaque?: boolean }) {
  const cores = { blue: 'border-blue-200 text-blue-700', green: 'border-emerald-200 text-emerald-700', amber: 'border-amber-200 text-amber-700', red: 'border-red-200 text-red-700' }
  return <div className={`rounded-2xl border bg-white p-4 shadow-sm ${cores[tom]} ${destaque ? 'ring-2 ring-current ring-offset-1' : ''}`}><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{money(valor)}</p><p className="mt-1 text-xs font-bold text-slate-500">{detalhe}</p></div>
}

function Linha({ label, valor, nivel = 0, forte = false, grande = false, fundo, onDetalhe }: { label: string; valor: number; nivel?: number; forte?: boolean; grande?: boolean; fundo?: 'blue' | 'green' | 'red'; onDetalhe?: () => void }) {
  const fundos = { blue: 'bg-blue-50', green: 'bg-emerald-50', red: 'bg-red-50' }
  const conteudo = <><span className={nivel ? 'pl-5 text-slate-600' : 'text-slate-900'}>{label}{onDetalhe && <span className="ml-2 text-[10px] font-black uppercase text-blue-600 print:hidden">ver itens</span>}</span><span className={`${valor < 0 ? 'text-red-700' : valor > 0 && forte ? 'text-emerald-700' : 'text-slate-900'} whitespace-nowrap`}>{money(valor)}</span></>
  const classe = `flex w-full items-center justify-between gap-4 px-5 py-3 text-left ${fundo ? fundos[fundo] : ''} ${forte ? 'font-black' : ''} ${grande ? 'text-lg' : ''}`
  return onDetalhe ? <button type="button" onClick={onDetalhe} className={`${classe} transition hover:bg-blue-50`}>{conteudo}</button> : <div className={classe}>{conteudo}</div>
}

function PainelDetalhes({ titulo, itens, onFechar }: { titulo: string; itens: Detalhe[]; onFechar: () => void }) {
  return <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm print:hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-blue-50 px-5 py-4"><div><h2 className="font-black text-slate-950">{titulo}</h2><p className="text-xs font-bold text-slate-500">{itens.length} lançamento(s) • Total {money(itens.reduce((total, item) => total + item.valor, 0))}</p></div><button type="button" onClick={onFechar} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">Fechar</button></div><div className="max-h-[430px] overflow-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Data</th><th className="p-3">Origem</th><th className="p-3">Documento</th><th className="p-3">Descrição</th><th className="p-3 text-right">Valor</th></tr></thead><tbody>{itens.length === 0 ? <tr><td colSpan={5} className="p-5 text-center text-slate-500">Nenhum lançamento compõe esta linha no período.</td></tr> : itens.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-3 whitespace-nowrap">{item.data ? new Date(item.data).toLocaleDateString('pt-BR') : '-'}</td><td className="p-3 font-bold">{item.origem}</td><td className="p-3 font-black text-blue-700">{item.documento}</td><td className="p-3 text-slate-600">{item.descricao}</td><td className="p-3 text-right font-black">{money(item.valor)}</td></tr>)}</tbody></table></div></section>
}

function money(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0) }
function percent(value: number) { return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value || 0)}%` }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') }
function formatLabel(value: string) { return value.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g, (letra) => letra.toLocaleUpperCase('pt-BR')) }
function dataInput(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
