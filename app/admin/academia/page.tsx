'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Conteudo = { id: number; tipo: string; titulo: string; resumo?: string | null; conteudo?: string | null; video_url?: string | null; arquivo_url?: string | null; destaque: boolean; obrigatorio: boolean; publicado: boolean; destinatario_todos: boolean; criado_em: string }
type Tecnico = { id: number; responsavel?: string | null; nome_fantasia?: string | null; status?: string | null }
type Destinatario = { conteudo_id: number; parceiro_id: number }
type Progresso = { conteudo_id: number; parceiro_id: number; visualizado_em?: string | null; confirmado_em?: string | null }
type Formulario = { id: number | null; tipo: string; titulo: string; resumo: string; conteudo: string; videoUrl: string; arquivoUrl: string; destaque: boolean; obrigatorio: boolean; publicado: boolean; destinatarioTodos: boolean; tecnicoIds: number[] }

const inicial: Formulario = { id: null, tipo: 'COMUNICADO', titulo: '', resumo: '', conteudo: '', videoUrl: '', arquivoUrl: '', destaque: false, obrigatorio: false, publicado: true, destinatarioTodos: true, tecnicoIds: [] }

export default function AcademiaAdminPage() {
  const [conteudos, setConteudos] = useState<Conteudo[]>([])
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([])
  const [progressos, setProgressos] = useState<Progresso[]>([])
  const [form, setForm] = useState<Formulario>(inicial)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [tabelaPendente, setTabelaPendente] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminFetch('/api/admin/academia')
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar Academia Técnica.')
      setConteudos(data?.conteudos ?? [])
      setTecnicos(data?.tecnicos ?? [])
      setDestinatarios(data?.destinatarios ?? [])
      setProgressos(data?.progressos ?? [])
      setTabelaPendente(Boolean(data?.tabelaPendente))
    } catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao carregar conteúdos.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void Promise.resolve().then(carregar) }, [carregar])

  const tecnicosAtivos = useMemo(() => tecnicos.filter((tecnico) => String(tecnico.status ?? 'ATIVO').toUpperCase() !== 'INATIVO'), [tecnicos])

  async function salvar() {
    setSalvando(true); setErro(''); setMensagem('')
    try {
      const response = await adminFetch('/api/admin/academia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao salvar conteúdo.')
      setMensagem(form.id ? 'Conteúdo atualizado.' : 'Conteúdo criado.')
      setForm(inicial)
      await carregar()
    } catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao salvar conteúdo.') }
    finally { setSalvando(false) }
  }

  function editar(item: Conteudo) {
    setForm({ id: item.id, tipo: item.tipo, titulo: item.titulo, resumo: item.resumo ?? '', conteudo: item.conteudo ?? '', videoUrl: item.video_url ?? '', arquivoUrl: item.arquivo_url ?? '', destaque: item.destaque, obrigatorio: item.obrigatorio, publicado: item.publicado, destinatarioTodos: item.destinatario_todos, tecnicoIds: destinatarios.filter((destino) => destino.conteudo_id === item.id).map((destino) => destino.parceiro_id) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function excluir(item: Conteudo) {
    if (!window.confirm(`Excluir definitivamente “${item.titulo}”?`)) return
    setSalvando(true); setErro('')
    try {
      const response = await adminFetch(`/api/admin/academia?id=${item.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao excluir conteúdo.')
      setMensagem('Conteúdo excluído.'); if (form.id === item.id) setForm(inicial); await carregar()
    } catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao excluir conteúdo.') }
    finally { setSalvando(false) }
  }

  function alternarTecnico(id: number) { setForm((atual) => ({ ...atual, tecnicoIds: atual.tecnicoIds.includes(id) ? atual.tecnicoIds.filter((item) => item !== id) : [...atual.tecnicoIds, id] })) }

  return <div className="mx-auto max-w-7xl space-y-5">
    <header><h1 className="text-3xl font-black text-slate-950">Academia Técnica</h1><p className="text-sm text-slate-600">Publique comunicados, boletins, vídeos e cursos para os técnicos.</p></header>
    {tabelaPendente && <Aviso classe="bg-amber-50 text-amber-800">Execute o arquivo supabase-add-academia-tecnica.sql no Supabase.</Aviso>}
    {erro && <Aviso classe="bg-red-50 text-red-700">{erro}</Aviso>}{mensagem && <Aviso classe="bg-emerald-50 text-emerald-700">{mensagem}</Aviso>}

    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">{form.id ? 'Editar conteúdo' : 'Novo conteúdo'}</h2>{form.id && <button onClick={() => setForm(inicial)} className="text-sm font-bold text-slate-500">Cancelar edição</button>}</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo label="Tipo"><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="input"><option value="COMUNICADO">Comunicado</option><option value="BOLETIM">Boletim técnico</option><option value="VIDEO">Vídeo</option><option value="CURSO">Curso</option></select></Campo>
        <Campo label="Título"><input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="input" /></Campo>
        <div className="md:col-span-2"><Campo label="Resumo"><input value={form.resumo} onChange={(e) => setForm({ ...form, resumo: e.target.value })} className="input" placeholder="Breve descrição exibida na lista" /></Campo></div>
        <div className="md:col-span-2"><Campo label="Conteúdo"><textarea value={form.conteudo} onChange={(e) => setForm({ ...form, conteudo: e.target.value })} className="min-h-36 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-orange-500" placeholder="Orientações, etapas do curso ou texto do comunicado" /></Campo></div>
        <Campo label="Link do vídeo (opcional)"><input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} className="input" placeholder="YouTube, Vimeo ou outro link" /></Campo>
        <Campo label="Link do material/arquivo (opcional)"><input value={form.arquivoUrl} onChange={(e) => setForm({ ...form, arquivoUrl: e.target.value })} className="input" placeholder="PDF, manual ou documento" /></Campo>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Check label="Publicado" checked={form.publicado} onChange={(value) => setForm({ ...form, publicado: value })} /><Check label="Destaque" checked={form.destaque} onChange={(value) => setForm({ ...form, destaque: value })} /><Check label="Leitura obrigatória" checked={form.obrigatorio} onChange={(value) => setForm({ ...form, obrigatorio: value })} /></div>
      <div className="mt-4 rounded-xl border border-slate-200 p-4"><Check label="Disponível para todos os técnicos" checked={form.destinatarioTodos} onChange={(value) => setForm({ ...form, destinatarioTodos: value })} />{!form.destinatarioTodos && <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{tecnicosAtivos.map((tecnico) => <label key={tecnico.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"><input type="checkbox" checked={form.tecnicoIds.includes(tecnico.id)} onChange={() => alternarTecnico(tecnico.id)} />{nomeTecnico(tecnico)}</label>)}</div>}</div>
      <button disabled={salvando || tabelaPendente} onClick={() => void salvar()} className="mt-4 rounded-lg bg-orange-500 px-6 py-3 font-black text-white disabled:opacity-50">{salvando ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Publicar conteúdo'}</button>
    </section>

    <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">Conteúdos cadastrados</h2><div className="mt-4 grid gap-3">{loading ? <p className="text-sm text-slate-500">Carregando...</p> : conteudos.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum conteúdo cadastrado.</p> : conteudos.map((item) => { const progresso = progressos.filter((p) => p.conteudo_id === item.id); return <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><div className="flex flex-wrap gap-2"><Etiqueta>{rotuloTipo(item.tipo)}</Etiqueta>{item.destaque && <Etiqueta>Destaque</Etiqueta>}{item.obrigatorio && <Etiqueta>Obrigatório</Etiqueta>}<span className={`rounded-full px-2 py-1 text-xs font-black ${item.publicado ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.publicado ? 'PUBLICADO' : 'RASCUNHO'}</span></div><h3 className="mt-2 text-lg font-black">{item.titulo}</h3><p className="text-sm text-slate-500">{item.destinatario_todos ? 'Todos os técnicos' : `${destinatarios.filter((d) => d.conteudo_id === item.id).length} técnico(s)`} • {progresso.filter((p) => p.visualizado_em).length} visualização(ões) • {progresso.filter((p) => p.confirmado_em).length} confirmação(ões)</p></div><div className="flex gap-2"><button onClick={() => editar(item)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-black">Editar</button><button disabled={salvando} onClick={() => void excluir(item)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-black text-white">Excluir</button></div></div></article> })}</div></section>
    <style jsx>{`.input{height:42px;width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:0 11px;font-size:14px;outline:none}.input:focus{border-color:#f97316}`}</style>
  </div>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-black text-slate-600">{label}<div className="mt-1">{children}</div></label> }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label> }
function Aviso({ classe, children }: { classe: string; children: React.ReactNode }) { return <div className={`rounded-xl p-4 text-sm font-bold ${classe}`}>{children}</div> }
function Etiqueta({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">{children}</span> }
function nomeTecnico(tecnico: Tecnico) { return tecnico.responsavel ?? tecnico.nome_fantasia ?? `Técnico #${tecnico.id}` }
function rotuloTipo(tipo: string) { return ({ COMUNICADO: 'Comunicado', BOLETIM: 'Boletim técnico', VIDEO: 'Vídeo', CURSO: 'Curso' } as Record<string, string>)[tipo] ?? tipo }
