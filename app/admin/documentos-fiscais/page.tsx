'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Configuracao = {
  id: number
  cnpj: string
  uf: string
  certificado_nome?: string | null
  ultimo_nsu: string
  max_nsu: string
  consulta_ativa: boolean
  ultima_consulta_em?: string | null
  ultima_consulta_status?: string | null
  ultima_consulta_erro?: string | null
}

type Unidade = { id: number; codigo: string; nome_fantasia: string; cnpj?: string | null; estado?: string | null }
type Documento = {
  id: number
  nsu: string
  schema_xml: string
  tipo_documento: 'NFE_COMPLETA' | 'RESUMO_NFE' | 'EVENTO' | 'OUTRO'
  chave_acesso?: string | null
  emitente_cnpj?: string | null
  emitente_nome?: string | null
  data_emissao?: string | null
  valor_total: number | string
  situacao_sefaz?: string | null
  descricao_evento?: string | null
  status: 'NOVA' | 'XML_DISPONIVEL' | 'IMPORTADA' | 'ARQUIVADA' | 'IGNORADA'
  nfe_importacao_id?: number | null
  recebido_em: string
}

export default function DocumentosFiscaisPage() {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [configuracao, setConfiguracao] = useState<Configuracao | null>(null)
  const [unidade, setUnidade] = useState<Unidade | null>(null)
  const [estruturaPendente, setEstruturaPendente] = useState(false)
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('ATIVOS')
  const [certificado, setCertificado] = useState<{ nome: string; base64: string }>({ nome: '', base64: '' })
  const [senha, setSenha] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const response = await adminFetch('/api/admin/documentos-fiscais', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar documentos fiscais.')
      setDocumentos(data?.documentos ?? [])
      setConfiguracao(data?.configuracao ?? null)
      setUnidade(data?.unidade ?? null)
      setEstruturaPendente(Boolean(data?.estruturaPendente))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar documentos fiscais.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return documentos.filter((item) => {
      if (status === 'ATIVOS' && ['ARQUIVADA', 'IGNORADA'].includes(item.status)) return false
      if (status !== 'ATIVOS' && status !== 'TODOS' && item.status !== status) return false
      if (!termo) return true
      return `${item.chave_acesso ?? ''} ${item.emitente_nome ?? ''} ${item.emitente_cnpj ?? ''} ${item.descricao_evento ?? ''}`.toLowerCase().includes(termo)
    })
  }, [busca, documentos, status])

  const resumo = useMemo(() => ({
    novos: documentos.filter((item) => item.status === 'NOVA').length,
    disponiveis: documentos.filter((item) => item.status === 'XML_DISPONIVEL').length,
    importados: documentos.filter((item) => item.status === 'IMPORTADA').length,
    arquivados: documentos.filter((item) => ['ARQUIVADA', 'IGNORADA'].includes(item.status)).length,
  }), [documentos])
  const unidadeFiscalPronta = String(unidade?.cnpj ?? '').replace(/\D/g, '').length === 14 && /^[A-Z]{2}$/.test(String(unidade?.estado ?? '').trim().toUpperCase())

  async function selecionarCertificado(event: ChangeEvent<HTMLInputElement>) {
    setErro('')
    const arquivo = event.target.files?.[0]
    if (!arquivo) return setCertificado({ nome: '', base64: '' })
    if (!/\.(pfx|p12)$/i.test(arquivo.name)) return setErro('Selecione um certificado A1 com extensão .pfx ou .p12.')
    if (arquivo.size > 100 * 1024) return setErro('O certificado excede o limite de 100 KB.')
    const base64 = await arquivoBase64(arquivo)
    setCertificado({ nome: arquivo.name, base64 })
  }

  async function salvarCertificado() {
    setErro('')
    if (!unidadeFiscalPronta) return setErro('Informe o CNPJ e a UF da unidade em Matriz e Filiais antes de salvar.')
    if (!certificado.base64) return setErro('Selecione o novo certificado A1 no formato .pfx ou .p12.')
    if (!senha) return setErro('Digite a senha definida durante a exportação do novo certificado.')
    await executar('SALVAR_CERTIFICADO', {
      certificadoBase64: certificado.base64,
      certificadoNome: certificado.nome,
      senha,
    }, 'Certificado salvo. Agora execute a primeira sincronização.')
    setSenha('')
    setCertificado({ nome: '', base64: '' })
  }

  async function sincronizar() {
    setProcessando(true)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/documentos-fiscais', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'SINCRONIZAR' }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao consultar a SEFAZ.')
      const resultado = data?.resultado
      setMensagem(`${Number(resultado?.encontrados ?? 0)} documento(s) processado(s); ${Number(resultado?.completos ?? 0)} XML completo(s) disponível(is).`)
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao consultar a SEFAZ.')
    } finally {
      setProcessando(false)
    }
  }

  async function tratar(id: number, acao: 'ARQUIVAR' | 'REABRIR' | 'IGNORAR') {
    await executar(acao, { id }, acao === 'REABRIR' ? 'Documento reaberto.' : 'Documento atualizado.')
  }

  async function alterarAutomacao() {
    await executar('ALTERAR_AUTOMACAO', { ativa: !configuracao?.consulta_ativa }, configuracao?.consulta_ativa ? 'Consulta automática pausada.' : 'Consulta automática ativada.')
  }

  async function executar(acao: string, dados: Record<string, unknown>, sucesso: string) {
    setProcessando(true)
    setErro('')
    setMensagem('')
    try {
      const response = await adminFetch('/api/admin/documentos-fiscais', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, ...dados }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao processar documento fiscal.')
      setMensagem(data?.mensagem ?? sucesso)
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao processar documento fiscal.')
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Compras e estoque</p><h1 className="text-3xl font-black text-slate-950">Documentos recebidos</h1><p className="mt-1 text-sm text-slate-600">NF-e localizadas contra o CNPJ da unidade. Nenhuma nota é importada sem confirmação.</p></div>
        <button onClick={() => void sincronizar()} disabled={processando || !configuracao || estruturaPendente} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{processando ? 'Processando...' : 'Buscar agora na SEFAZ'}</button>
      </header>

      {estruturaPendente && <Aviso cor="amber">Execute o arquivo <b>supabase-add-documentos-fiscais-recebidos.sql</b> no Supabase.</Aviso>}
      {erro && <Aviso cor="red">{erro}</Aviso>}
      {mensagem && <Aviso cor="green">{mensagem}</Aviso>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Novos e resumos" valor={resumo.novos} cor="amber" />
        <Card label="XML pronto para importar" valor={resumo.disponiveis} cor="blue" />
        <Card label="Importados" valor={resumo.importados} cor="green" />
        <Card label="Arquivados/ignorados" valor={resumo.arquivados} cor="slate" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-black">Certificado e unidade</h2><p className="text-sm text-slate-500">{unidade?.nome_fantasia ?? 'Unidade atual'} · {formatarCnpj(unidade?.cnpj)} · {unidade?.estado ?? 'UF não informada'}</p></div>
          {configuracao && <span className={`rounded-full px-3 py-1 text-xs font-black ${configuracao.consulta_ativa ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{configuracao.consulta_ativa ? 'CONSULTA ATIVA' : 'PAUSADA'}</span>}
        </div>
        {configuracao ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Certificado A1" valor={configuracao.certificado_nome || 'Configurado'} />
            <Info label="Última consulta" valor={configuracao.ultima_consulta_em ? dataHora(configuracao.ultima_consulta_em) : 'Ainda não realizada'} />
            <Info label="Último NSU" valor={configuracao.ultimo_nsu} />
            <Info label="Situação" valor={configuracao.ultima_consulta_status || 'Aguardando sincronização'} />
            {configuracao.ultima_consulta_erro && <div className="md:col-span-2 xl:col-span-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{configuracao.ultima_consulta_erro}</div>}
            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4"><button onClick={() => void alterarAutomacao()} disabled={processando} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">{configuracao.consulta_ativa ? 'Pausar consulta automática' : 'Ativar consulta automática'}</button><button onClick={() => setConfiguracao(null)} disabled={processando} className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700">Substituir certificado</button></div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_280px_auto] lg:items-end">
            {!unidadeFiscalPronta && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900 lg:col-span-3">Antes do certificado, informe a UF da unidade em <Link href="/admin/unidades" className="underline">Matriz e Filiais</Link>. Para a matriz de Naviraí, use <b>MS</b>.</div>}
            <label className="text-sm font-bold">Certificado A1 (.pfx ou .p12)<input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(event) => void selecionarCertificado(event)} className="mt-1 block w-full rounded-xl border border-slate-300 p-2.5 text-sm" /></label>
            <label className="text-sm font-bold">Senha do certificado<input type="password" value={senha} onChange={(event) => setSenha(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-3 text-sm" /></label>
            <button onClick={() => void salvarCertificado()} disabled={processando} className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{processando ? 'Validando certificado...' : 'Salvar certificado'}</button>
            <p className="text-xs text-slate-500 lg:col-span-3">O arquivo e a senha são criptografados no servidor e nunca são enviados ao navegador após o cadastro.</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_240px_auto]">
          <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por fornecedor, CNPJ ou chave..." className="rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold"><option value="ATIVOS">Pendentes e disponíveis</option><option value="TODOS">Todos</option><option value="NOVA">Novos/resumos</option><option value="XML_DISPONIVEL">XML disponível</option><option value="IMPORTADA">Importados</option><option value="ARQUIVADA">Arquivados</option><option value="IGNORADA">Ignorados</option></select>
          <button onClick={() => void carregar()} disabled={loading} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold">Atualizar</button>
        </div>
        <div className="divide-y divide-slate-200">
          {loading && <p className="p-8 text-center text-sm text-slate-500">Carregando...</p>}
          {!loading && filtrados.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Nenhum documento encontrado neste filtro.</p>}
          {!loading && filtrados.map((item) => <DocumentoLinha key={item.id} item={item} processando={processando} tratar={tratar} />)}
        </div>
      </section>
    </div>
  )
}

function DocumentoLinha({ item, processando, tratar }: { item: Documento; processando: boolean; tratar: (id: number, acao: 'ARQUIVAR' | 'REABRIR' | 'IGNORAR') => Promise<void> }) {
  const completo = item.tipo_documento === 'NFE_COMPLETA'
  const tratado = ['ARQUIVADA', 'IGNORADA'].includes(item.status)
  return <article className="p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Status valor={item.status} /><span className={`rounded-full px-2.5 py-1 text-xs font-black ${completo ? 'bg-blue-100 text-blue-800' : item.tipo_documento === 'RESUMO_NFE' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{completo ? 'XML COMPLETO' : item.tipo_documento === 'RESUMO_NFE' ? 'RESUMO DA NF-E' : item.tipo_documento}</span></div><h3 className="mt-2 text-base font-black text-slate-950">{item.emitente_nome || item.descricao_evento || 'Documento fiscal eletrônico'}</h3><p className="mt-1 text-sm text-slate-600">{formatarCnpj(item.emitente_cnpj)} · Emissão {item.data_emissao ? data(item.data_emissao) : '-'} · <b>{moeda(Number(item.valor_total ?? 0))}</b></p><p className="mt-1 break-all font-mono text-[11px] text-slate-500">Chave: {item.chave_acesso || '-'} · NSU {item.nsu}</p>{item.tipo_documento === 'RESUMO_NFE' && <p className="mt-2 text-xs font-bold text-amber-700">A SEFAZ enviou somente o resumo. O XML completo depende da manifestação do destinatário.</p>}</div><div className="flex flex-wrap gap-2">{completo && item.status !== 'IMPORTADA' && <Link href={`/admin/pecas/importar-xml?dfe=${item.id}`} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-black text-white">Conferir e importar</Link>}{!tratado && item.status !== 'IMPORTADA' && <><button disabled={processando} onClick={() => void tratar(item.id, 'ARQUIVAR')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Arquivar</button><button disabled={processando} onClick={() => void tratar(item.id, 'IGNORAR')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700">Ignorar</button></>}{tratado && <button disabled={processando} onClick={() => void tratar(item.id, 'REABRIR')} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-black text-blue-700">Reabrir</button>}</div></div></article>
}

function Card({ label, valor, cor }: { label: string; valor: number; cor: 'amber' | 'blue' | 'green' | 'slate' }) { const cores = { amber: 'border-amber-200 bg-amber-50 text-amber-900', blue: 'border-blue-200 bg-blue-50 text-blue-900', green: 'border-emerald-200 bg-emerald-50 text-emerald-900', slate: 'border-slate-200 bg-white text-slate-900' }; return <div className={`rounded-2xl border p-4 shadow-sm ${cores[cor]}`}><p className="text-xs font-black uppercase">{label}</p><p className="mt-2 text-2xl font-black">{valor}</p></div> }
function Info({ label, valor }: { label: string; valor: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase text-slate-500">{label}</p><p className="mt-1 break-all text-sm font-bold text-slate-900">{valor}</p></div> }
function Status({ valor }: { valor: Documento['status'] }) { const mapa: Record<string, string> = { NOVA: 'bg-amber-100 text-amber-800', XML_DISPONIVEL: 'bg-blue-100 text-blue-800', IMPORTADA: 'bg-emerald-100 text-emerald-800', ARQUIVADA: 'bg-slate-100 text-slate-700', IGNORADA: 'bg-red-100 text-red-800' }; return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${mapa[valor] ?? mapa.NOVA}`}>{valor.replace('_', ' ')}</span> }
function Aviso({ cor, children }: { cor: 'amber' | 'red' | 'green'; children: React.ReactNode }) { const cores = { amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-800', green: 'border-emerald-200 bg-emerald-50 text-emerald-800' }; return <div className={`rounded-2xl border p-4 text-sm font-bold ${cores[cor]}`}>{children}</div> }
function arquivoBase64(arquivo: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? ''); reader.onerror = () => reject(new Error('Não foi possível ler o certificado.')); reader.readAsDataURL(arquivo) }) }
function formatarCnpj(valor?: string | null) { const n = String(valor ?? '').replace(/\D/g, ''); return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : valor || 'CNPJ não informado' }
function moeda(valor: number) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function data(valor: string) { return new Date(valor).toLocaleDateString('pt-BR') }
function dataHora(valor: string) { return new Date(valor).toLocaleString('pt-BR') }
