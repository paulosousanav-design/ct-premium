'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Conteudo = { id: number; tipo: string; titulo: string; resumo?: string | null; conteudo?: string | null; video_url?: string | null; arquivo_url?: string | null; destaque: boolean; obrigatorio: boolean; publicado_em?: string | null }
type Progresso = { conteudo_id: number; visualizado_em?: string | null; confirmado_em?: string | null }

export default function AcademiaTecnicoPage() {
  const [conteudos, setConteudos] = useState<Conteudo[]>([])
  const [progressos, setProgressos] = useState<Progresso[]>([])
  const [selecionado, setSelecionado] = useState<Conteudo | null>(null)
  const [filtro, setFiltro] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setErro('')
    try {
      const response = await fetch('/api/tecnico/academia', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (response.status === 401) { window.location.href = '/tecnico/login'; return }
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar Academia Técnica.')
      setConteudos(data?.conteudos ?? []); setProgressos(data?.progresso ?? [])
    } catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao carregar conteúdos.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void Promise.resolve().then(carregar) }, [carregar])

  const filtrados = useMemo(() => filtro === 'TODOS' ? conteudos : conteudos.filter((item) => item.tipo === filtro), [conteudos, filtro])
  const pendentesObrigatorios = conteudos.filter((item) => item.obrigatorio && !progressoDe(progressos, item.id)?.confirmado_em).length

  async function abrir(item: Conteudo) {
    setSelecionado(item)
    if (!progressoDe(progressos, item.id)?.visualizado_em) await registrar(item.id, 'VISUALIZAR')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function registrar(conteudoId: number, acao: 'VISUALIZAR' | 'CONFIRMAR') {
    setSalvando(true); setErro('')
    try {
      const response = await fetch('/api/tecnico/academia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conteudoId, acao }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao registrar progresso.')
      setProgressos((atual) => [...atual.filter((item) => item.conteudo_id !== conteudoId), { conteudo_id: conteudoId, visualizado_em: data.progresso.visualizado_em, confirmado_em: data.progresso.confirmado_em }])
    } catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao registrar progresso.') }
    finally { setSalvando(false) }
  }

  return <main className="min-h-screen bg-[#c7d3cf] px-4 py-5"><div className="mx-auto max-w-6xl space-y-4">
    <header className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><Image src="/logo-ct.png" alt="Chame o Técnico" width={100} height={70} className="h-auto w-24" /><div><h1 className="text-2xl font-black text-slate-950">Academia Técnica</h1><p className="text-sm text-slate-600">Comunicados, boletins, vídeos e cursos.</p></div></div><Link href="/tecnico/painel" className="rounded-lg bg-slate-950 px-4 py-2.5 text-center text-sm font-black text-white">Voltar ao painel</Link></div></header>
    {erro && <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}
    {pendentesObrigatorios > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">Você possui {pendentesObrigatorios} conteúdo(s) obrigatório(s) aguardando confirmação.</div>}

    {selecionado && <section className="rounded-2xl bg-white p-5 shadow-sm"><button onClick={() => setSelecionado(null)} className="mb-3 text-sm font-black text-orange-600">← Voltar aos conteúdos</button><div className="flex flex-wrap gap-2"><Etiqueta>{rotuloTipo(selecionado.tipo)}</Etiqueta>{selecionado.obrigatorio && <Etiqueta>Leitura obrigatória</Etiqueta>}</div><h2 className="mt-3 text-2xl font-black text-slate-950">{selecionado.titulo}</h2>{selecionado.resumo && <p className="mt-2 text-slate-600">{selecionado.resumo}</p>}{selecionado.conteudo && <div className="mt-5 whitespace-pre-wrap rounded-xl bg-slate-50 p-5 text-sm leading-7 text-slate-800">{selecionado.conteudo}</div>}<Video url={selecionado.video_url} />{selecionado.arquivo_url && <a href={selecionado.arquivo_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-800">Abrir material complementar</a>}<AssinaturaAcademia /><div className="mt-5 border-t pt-4">{progressoDe(progressos, selecionado.id)?.confirmado_em ? <p className="font-black text-emerald-700">✓ Conteúdo confirmado em {dataHora(progressoDe(progressos, selecionado.id)?.confirmado_em)}</p> : <button disabled={salvando} onClick={() => void registrar(selecionado.id, 'CONFIRMAR')} className="rounded-lg bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">Confirmar que li e compreendi</button>}</div></section>}

    {!selecionado && <><nav className="flex gap-2 overflow-x-auto rounded-xl bg-white p-3 shadow-sm">{['TODOS', 'COMUNICADO', 'BOLETIM', 'VIDEO', 'CURSO'].map((tipo) => <button key={tipo} onClick={() => setFiltro(tipo)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-black ${filtro === tipo ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700'}`}>{tipo === 'TODOS' ? 'Todos' : rotuloTipo(tipo)}</button>)}</nav><section className="grid gap-4 md:grid-cols-2">{loading ? <div className="rounded-xl bg-white p-5">Carregando...</div> : filtrados.length === 0 ? <div className="rounded-xl bg-white p-5 text-sm text-slate-500">Nenhum conteúdo disponível.</div> : filtrados.map((item) => { const progresso = progressoDe(progressos, item.id); return <button key={item.id} onClick={() => void abrir(item)} className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${item.destaque ? 'border-orange-400' : 'border-transparent'}`}><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Etiqueta>{rotuloTipo(item.tipo)}</Etiqueta>{item.destaque && <Etiqueta>Destaque</Etiqueta>}{item.obrigatorio && !progresso?.confirmado_em && <Etiqueta>Pendente</Etiqueta>}</div>{progresso?.confirmado_em && <span className="text-lg text-emerald-600">✓</span>}</div><h2 className="mt-3 text-lg font-black text-slate-950">{item.titulo}</h2><p className="mt-2 line-clamp-3 text-sm text-slate-600">{item.resumo || 'Abra para acessar o conteúdo.'}</p><p className="mt-4 text-xs font-bold text-slate-400">{dataHora(item.publicado_em)}</p></button> })}</section></>}
  </div></main>
}

function Video({ url }: { url?: string | null }) { if (!url) return null; const embed = videoEmbed(url); return embed ? <div className="mt-5 aspect-video overflow-hidden rounded-xl bg-black"><iframe src={embed} title="Vídeo do conteúdo" className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : <a href={url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-lg bg-red-600 px-4 py-2.5 text-sm font-black text-white">Assistir ao vídeo</a> }
function AssinaturaAcademia() { return <div className="mt-6 flex items-center gap-3 border-t border-slate-200 pt-5"><Image src="/logo-ct.png" alt="Chame o Técnico" width={72} height={50} className="h-auto w-16" /><div><p className="font-black text-slate-950">Chame o Técnico</p><p className="text-xs font-bold text-orange-600">Academia Técnica</p><p className="mt-1 text-xs italic text-slate-500">Qualidade, transparência e excelência em cada atendimento.</p></div></div> }
function videoEmbed(url: string) { try { const parsed = new URL(url); if (parsed.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`; if (parsed.hostname.includes('youtube.com')) { const id = parsed.searchParams.get('v') ?? parsed.pathname.split('/').pop(); return id ? `https://www.youtube.com/embed/${id}` : null } if (parsed.hostname.includes('vimeo.com')) { const id = parsed.pathname.split('/').filter(Boolean).pop(); return id ? `https://player.vimeo.com/video/${id}` : null } return null } catch { return null } }
function progressoDe(progressos: Progresso[], id: number) { return progressos.find((item) => item.conteudo_id === id) }
function Etiqueta({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">{children}</span> }
function rotuloTipo(tipo: string) { return ({ COMUNICADO: 'Comunicado', BOLETIM: 'Boletim técnico', VIDEO: 'Vídeo', CURSO: 'Curso' } as Record<string, string>)[tipo] ?? tipo }
function dataHora(value?: string | null) { if (!value) return ''; return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
