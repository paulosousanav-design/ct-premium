'use client'

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type UsuarioAdmin = {
  id: number
  auth_user_id: string | null
  nome: string
  email: string
  ativo: boolean
  permissoes: string[]
  unidade_padrao_id?: number | null
  unidade_ids?: number[]
  criado_em: string
  atualizado_em: string
}

type Unidade = { id: number; codigo: string; tipo: 'MATRIZ' | 'FILIAL'; nome_fantasia: string; ativa: boolean }

type FormState = {
  id: number | null
  nome: string
  email: string
  senha: string
  ativo: boolean
  permissoes: string[]
  unidadeIds: number[]
  unidadePadraoId: number | null
}

const permissoes = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'os', label: 'Ordens de Servico' },
  { id: 'finalizadas', label: 'Finalizadas' },
  { id: 'tecnicos', label: 'Tecnicos' },
  { id: 'garantidores', label: 'Garantidores' },
  { id: 'aprovacao', label: 'Aprovacao' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'pecas', label: 'Pecas e estoque' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'unidades', label: 'Matriz e Filiais' },
  { id: 'usuarios', label: 'Usuarios e acessos' },
  { id: 'relatorios', label: 'Relatorios' },
  { id: 'academia', label: 'Academia Tecnica' },
  { id: 'documentos', label: 'Documentos Tecnicos' },
  { id: 'configuracoes', label: 'Configuracoes' },
]

const formInicial: FormState = {
  id: null,
  nome: '',
  email: '',
  senha: '',
  ativo: true,
  permissoes: ['dashboard', 'os'],
  unidadeIds: [],
  unidadePadraoId: null,
}

export default function UsuariosAdminPage() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [form, setForm] = useState<FormState>(formInicial)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [tabelaPendente, setTabelaPendente] = useState(false)
  const [unidadesPendente, setUnidadesPendente] = useState(false)
  const [unidades, setUnidades] = useState<Unidade[]>([])

  useEffect(() => {
    void carregar()
  }, [])

  const editando = form.id !== null
  const totalAtivos = useMemo(() => usuarios.filter((item) => item.ativo).length, [usuarios])

  async function carregar() {
    setLoading(true)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/usuarios')
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar usuarios.')

      setUsuarios((data?.data ?? []) as UsuarioAdmin[])
      const unidadesData = (data?.unidades ?? []) as Unidade[]
      setUnidades(unidadesData)
      setUnidadesPendente(Boolean(data?.unidadesPendente))
      const matriz = unidadesData.find((item) => item.tipo === 'MATRIZ' && item.ativa)
      if (matriz) setForm((atual) => atual.id === null && atual.unidadeIds.length === 0 ? { ...atual, unidadeIds: [matriz.id], unidadePadraoId: matriz.id } : atual)
      setTabelaPendente(Boolean(data?.tabelaPendente))
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar usuarios.')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value, checked, type } = event.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  function togglePermissao(id: string) {
    setForm((prev) => {
      const existe = prev.permissoes.includes(id)
      return {
        ...prev,
        permissoes: existe ? prev.permissoes.filter((item) => item !== id) : [...prev.permissoes, id],
      }
    })
  }

  function selecionarTodos() {
    setForm((prev) => ({ ...prev, permissoes: permissoes.map((item) => item.id) }))
  }

  function limparPermissoes() {
    setForm((prev) => ({ ...prev, permissoes: [] }))
  }

  function toggleUnidade(id: number) {
    setForm((prev) => {
      const existe = prev.unidadeIds.includes(id)
      const unidadeIds = existe ? prev.unidadeIds.filter((item) => item !== id) : [...prev.unidadeIds, id]
      const unidadePadraoId = unidadeIds.includes(Number(prev.unidadePadraoId)) ? prev.unidadePadraoId : unidadeIds[0] ?? null
      return { ...prev, unidadeIds, unidadePadraoId }
    })
  }

  function editar(usuario: UsuarioAdmin) {
    setForm({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      ativo: usuario.ativo,
      permissoes: usuario.permissoes ?? [],
      unidadeIds: usuario.unidade_ids ?? [],
      unidadePadraoId: usuario.unidade_padrao_id ?? usuario.unidade_ids?.[0] ?? null,
    })
    setMensagem('')
    setErro('')
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSalvando(true)
    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/usuarios', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao salvar usuario.')

      setMensagem(editando ? 'Usuario atualizado com sucesso.' : 'Usuario criado com sucesso.')
      setForm(formInicial)
      await carregar()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar usuario.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Usuarios e acessos</h1>
          <p className="text-sm text-slate-500">Cadastre acessos internos e selecione quais areas cada usuario pode visualizar.</p>
        </div>
        <button onClick={carregar} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">
          Atualizar
        </button>
      </header>

      {erro && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{mensagem}</div>}
      {tabelaPendente && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          Rode o SQL atualizado para criar a tabela admin_usuarios.
        </div>
      )}
      {unidadesPendente && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          Execute o arquivo supabase-add-unidades.sql para liberar Matriz e Filiais nos usuários.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={salvar} className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-slate-950">{editando ? 'Editar usuario' : 'Novo usuario'}</h2>
            {editando && (
              <button
                type="button"
                onClick={() => setForm(formInicial)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600"
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="grid gap-3">
            <Field label="Nome" name="nome" value={form.nome} onChange={handleChange} required />
            <Field label="E-mail" name="email" value={form.email} onChange={handleChange} type="email" required />
            {!editando && (
              <Field label="Senha inicial" name="senha" value={form.senha} onChange={handleChange} type="password" required />
            )}

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
              <input type="checkbox" name="ativo" checked={form.ativo} onChange={handleChange} />
              Usuario ativo
            </label>

            {!unidadesPendente && unidades.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <h3 className="text-sm font-black text-slate-900">Unidades permitidas</h3>
                <p className="mt-1 text-xs text-slate-500">O usuário poderá acessar somente as unidades selecionadas nas próximas etapas da implantação.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {unidades.filter((item) => item.ativa).map((unidade) => (
                    <label key={unidade.id} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold ${form.unidadeIds.includes(unidade.id) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                      <input type="checkbox" checked={form.unidadeIds.includes(unidade.id)} onChange={() => toggleUnidade(unidade.id)} className="mr-2" />
                      {unidade.tipo} • {unidade.nome_fantasia}
                    </label>
                  ))}
                </div>
                <label className="mt-3 block text-xs font-black text-slate-600">Unidade padrão
                  <select value={form.unidadePadraoId ?? ''} onChange={(event) => setForm((atual) => ({ ...atual, unidadePadraoId: Number(event.target.value) || null }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                    <option value="">Selecione</option>
                    {unidades.filter((item) => form.unidadeIds.includes(item.id)).map((unidade) => <option key={unidade.id} value={unidade.id}>{unidade.nome_fantasia}</option>)}
                  </select>
                </label>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-900">Permissoes</h3>
                <div className="flex gap-2">
                  <button type="button" onClick={selecionarTodos} className="text-xs font-bold text-emerald-700">Todos</button>
                  <button type="button" onClick={limparPermissoes} className="text-xs font-bold text-red-600">Limpar</button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {permissoes.map((permissao) => (
                  <label
                    key={permissao.id}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold ${
                      form.permissoes.includes(permissao.id)
                        ? 'border-orange-300 bg-orange-50 text-orange-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.permissoes.includes(permissao.id)}
                      onChange={() => togglePermissao(permissao.id)}
                      className="mr-2"
                    />
                    {permissao.label}
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={salvando || tabelaPendente}
              className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? 'Salvando...' : editando ? 'Salvar alteracoes' : 'Criar usuario'}
            </button>
          </div>
        </form>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black text-slate-950">Usuarios cadastrados</h2>
              <p className="text-xs text-slate-500">{totalAtivos} ativos de {usuarios.length} usuarios.</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Usuario</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Permissoes</th>
                  <th className="p-3">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {loading && <LinhaMensagem texto="Carregando..." />}
                {!loading && usuarios.length === 0 && <LinhaMensagem texto="Nenhum usuario cadastrado." />}
                {!loading && usuarios.map((usuario) => (
                  <tr key={usuario.id} className="border-t border-slate-200">
                    <td className="p-3">
                      <div className="font-black text-slate-950">{usuario.nome}</div>
                      <div className="text-xs text-slate-500">{usuario.email}</div>
                      <div className="mt-1 text-[10px] font-bold text-blue-700">{(usuario.unidade_ids ?? []).map((id) => unidades.find((unidade) => unidade.id === id)?.nome_fantasia).filter(Boolean).join(' • ') || 'Sem unidade'}</div>
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${usuario.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {usuario.ativo ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex max-w-[360px] flex-wrap gap-1">
                        {(usuario.permissoes ?? []).slice(0, 6).map((permissao) => (
                          <span key={permissao} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {permissoes.find((item) => item.id === permissao)?.label ?? permissao}
                          </span>
                        ))}
                        {(usuario.permissoes ?? []).length > 6 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            +{usuario.permissoes.length - 6}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <button onClick={() => editar(usuario)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  type?: string
  required?: boolean
}) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}{required ? ' *' : ''}
      <input
        name={name}
        value={value}
        onChange={onChange}
        type={type}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
      />
    </label>
  )
}

function LinhaMensagem({ texto }: { texto: string }) {
  return (
    <tr>
      <td colSpan={4} className="p-5 text-sm text-slate-500">{texto}</td>
    </tr>
  )
}
