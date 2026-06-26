'use client'

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/admin-fetch'

type Tecnico = {
  id?: number
  razao_social?: string | null
  nome_fantasia?: string | null
  responsavel?: string | null
  chave_pix?: string | null
  whatsapp?: string | null
  email?: string | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  status?: string | null
  cnpj?: string | null
  especialidades?: string[] | string | null
  observacoes?: string | null
  portal_pin_hash?: string | null
  tipo_vinculo?: string | null
  created_at?: string | null
}

type FormState = {
  nome: string
  empresa: string
  cpfCnpj: string
  chavePix: string
  whatsapp: string
  email: string
  cep: string
  logradouro: string
  numero: string
  bairro: string
  referencia: string
  cidade: string
  estado: string
  regiaoAtendimento: string
  especialidades: string[]
  observacoes: string
  tipoVinculo: 'PROPRIO' | 'TERCEIRIZADO'
  ativo: boolean
}

type DatabaseStatus = {
  ok: boolean
  faltando: string[]
  sql: string
}

const especialidadesDisponiveis = [
  'Ar-condicionado',
  'Refrigerador',
  'Lava e seca',
  'Televisor',
  'Cooktop',
  'Forno',
  'Micro-ondas',
  'Adega',
  'Outros',
]

const formInicial: FormState = {
  nome: '',
  empresa: '',
  cpfCnpj: '',
  chavePix: '',
  whatsapp: '',
  email: '',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  referencia: '',
  cidade: '',
  estado: '',
  regiaoAtendimento: '',
  especialidades: [],
  observacoes: '',
  tipoVinculo: 'TERCEIRIZADO',
  ativo: true,
}

function getStatusFiltroInicial() {
  if (typeof window === 'undefined') return 'TODOS'

  const statusParam = new URLSearchParams(window.location.search).get('status')?.toUpperCase()
  const statusPermitidos = ['TODOS', 'ATIVOS', 'PENDENTES', 'REPROVADOS', 'INATIVOS']

  return statusParam && statusPermitidos.includes(statusParam) ? statusParam : 'TODOS'
}

export default function ParceirosPage() {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [form, setForm] = useState<FormState>(formInicial)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState(getStatusFiltroInicial)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [tecnicoSelecionado, setTecnicoSelecionado] = useState<Tecnico | null>(null)
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)

  useEffect(() => {
    void carregarTecnicos()
    void carregarStatusBanco()
  }, [])

  useEffect(() => {
    const cepLimpo = form.cep.replace(/\D/g, '')
    if (cepLimpo.length !== 8) return

    const timer = setTimeout(() => {
      void buscarCep(cepLimpo)
    }, 500)

    return () => clearTimeout(timer)
  }, [form.cep])

  const resumo = useMemo(() => {
    return {
      total: tecnicos.length,
      ativos: tecnicos.filter((item) => tecnicoAtivo(item)).length,
      pendentes: tecnicos.filter((item) => tecnicoPendente(item)).length,
      reprovados: tecnicos.filter((item) => tecnicoReprovado(item)).length,
      inativos: tecnicos.filter((item) => tecnicoInativo(item)).length,
      cidades: new Set(tecnicos.map((item) => item.cidade).filter(Boolean)).size,
    }
  }, [tecnicos])

  const tecnicosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim()

    return tecnicos.filter((item) => {
      const texto = [
        getNomeTecnico(item),
        item.razao_social,
        item.nome_fantasia,
        item.responsavel,
        item.chave_pix,
        item.cnpj,
        item.whatsapp,
        item.email,
        item.cep,
        item.logradouro,
        item.numero,
        item.bairro,
        item.cidade,
        item.estado,
        item.status,
        item.tipo_vinculo,
        formatarEspecialidades(item.especialidades),
        item.observacoes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const bateBusca = texto.includes(termo)
      const bateStatus =
        statusFiltro === 'TODOS' ||
        (statusFiltro === 'ATIVOS' && tecnicoAtivo(item)) ||
        (statusFiltro === 'PENDENTES' && tecnicoPendente(item)) ||
        (statusFiltro === 'REPROVADOS' && tecnicoReprovado(item)) ||
        (statusFiltro === 'INATIVOS' && tecnicoInativo(item))

      return bateBusca && bateStatus
    })
  }, [tecnicos, busca, statusFiltro])

  const tecnicosPendentes = useMemo(
    () => tecnicos.filter((item) => tecnicoPendente(item)).slice(0, 6),
    [tecnicos]
  )

  async function carregarTecnicos() {
    setLoading(true)
    setErro('')

    try {
      const response = await adminFetch('/api/admin/parceiros')
      const data = await response.json().catch(() => null)

      if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar os tecnicos.')
      setTecnicos((data?.data ?? []) as Tecnico[])
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao carregar os técnicos.'))
    } finally {
      setLoading(false)
    }
  }

  async function carregarStatusBanco() {
    try {
      const response = await adminFetch('/api/admin/database/status')
      const data = await response.json().catch(() => null)

      if (response.ok) setDatabaseStatus(data as DatabaseStatus)
    } catch {
      setDatabaseStatus(null)
    }
  }

  async function copiarSqlBanco() {
    if (!databaseStatus?.sql) return

    try {
      await navigator.clipboard.writeText(databaseStatus.sql)
      setMensagem('SQL copiado. Cole no SQL Editor do Supabase e execute.')
    } catch {
      setErro('Nao foi possivel copiar automaticamente. Selecione o SQL na tela e copie manualmente.')
    }
  }

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = event.target

    if (name === 'cpfCnpj') {
      setForm((prev) => ({ ...prev, cpfCnpj: formatarCpfCnpj(value) }))
      return
    }

    if (name === 'whatsapp') {
      setForm((prev) => ({ ...prev, whatsapp: formatarTelefone(value) }))
      return
    }

    if (name === 'cep') {
      setForm((prev) => ({ ...prev, cep: formatarCEP(value) }))
      return
    }

    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function buscarCep(cep: string) {
    setBuscandoCep(true)
    setErro('')

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await response.json()

      if (data.erro) {
        setErro('CEP não encontrado.')
        return
      }

      setForm((prev) => ({
        ...prev,
        logradouro: data.logradouro || prev.logradouro,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: data.uf || prev.estado,
      }))
    } catch {
      setErro('Falha ao buscar o CEP.')
    } finally {
      setBuscandoCep(false)
    }
  }

  function alternarEspecialidade(especialidade: string) {
    setForm((prev) => {
      const jaSelecionada = prev.especialidades.includes(especialidade)

      return {
        ...prev,
        especialidades: jaSelecionada
          ? prev.especialidades.filter((item) => item !== especialidade)
          : [...prev.especialidades, especialidade],
      }
    })
  }

  async function salvarTecnico(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setMensagem('')

    if (!form.nome.trim()) {
      setErro('Informe o nome do técnico.')
      return
    }

    if (!form.whatsapp.trim()) {
      setErro('Informe o WhatsApp do técnico.')
      return
    }

    setSalvando(true)

    try {
      const response = await adminFetch('/api/admin/parceiros', {
        method: editandoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editandoId,
          nome: form.nome,
          empresa: form.empresa,
          cpfCnpj: form.cpfCnpj,
          chavePix: form.chavePix,
          whatsapp: form.whatsapp,
          email: form.email,
          cep: form.cep,
          logradouro: form.logradouro,
          numero: form.referencia
            ? `${form.numero.trim()} - Ref: ${form.referencia.trim()}`
            : form.numero,
          bairro: form.bairro,
          cidade: form.cidade,
          estado: form.estado,
          especialidades: form.especialidades,
          observacoes: form.observacoes,
          tipoVinculo: form.tipoVinculo,
          ...(editandoId ? {} : { ativo: form.ativo }),
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao salvar o tecnico.')

      const avisos = Array.isArray(data?.avisos) ? data.avisos.join(' ') : ''
      setMensagem(
        ['Técnico cadastrado com sucesso.', avisos]
          .filter(Boolean)
          .join(' ')
      )
      setForm(formInicial)
      setEditandoId(null)
      await carregarTecnicos()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao salvar o técnico.'))
    } finally {
      setSalvando(false)
    }
  }

  function editarTecnico(tecnico: Tecnico) {
    setEditandoId(tecnico.id ?? null)
    setTecnicoSelecionado(null)
    setErro('')
    setMensagem('')
    setForm({
      nome: getNomeTecnico(tecnico),
      empresa: getEmpresaTecnico(tecnico),
      cpfCnpj: tecnico.cnpj ?? '',
      chavePix: tecnico.chave_pix ?? '',
      whatsapp: tecnico.whatsapp ?? '',
      email: tecnico.email ?? '',
      cep: tecnico.cep ?? '',
      logradouro: tecnico.logradouro ?? '',
      numero: tecnico.numero ?? '',
      bairro: tecnico.bairro ?? '',
      referencia: '',
      cidade: tecnico.cidade ?? '',
      estado: tecnico.estado ?? '',
      regiaoAtendimento: '',
      especialidades: normalizarEspecialidades(tecnico.especialidades),
      observacoes: tecnico.observacoes ?? '',
      tipoVinculo: getTipoVinculo(tecnico) === 'PROPRIO' ? 'PROPRIO' : 'TERCEIRIZADO',
      ativo: !tecnicoInativo(tecnico),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setForm(formInicial)
    setErro('')
    setMensagem('')
  }

  async function alternarStatus(tecnico: Tecnico) {
    await alterarStatus(tecnico, tecnicoAtivo(tecnico) ? 'INATIVO' : 'ATIVO')
  }

  async function alterarStatus(tecnico: Tecnico, status: 'ATIVO' | 'INATIVO' | 'PENDENTE' | 'REPROVADO') {
    if (!tecnico.id) return

    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/parceiros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tecnico.id,
          status,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao alterar status do tecnico.')

      await carregarTecnicos()
      setTecnicoSelecionado(null)
      setMensagem(
        status === 'ATIVO'
          ? 'Tecnico aprovado e liberado para atribuicao em OS.'
          : status === 'REPROVADO'
            ? 'Tecnico reprovado e removido das sugestoes de OS.'
            : 'Status do tecnico atualizado.'
      )
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao alterar o status do técnico.'))
    }
  }

  async function gerarPinPortal(tecnico: Tecnico) {
    if (!tecnico.id) return

    const portalPin = String(Math.floor(100000 + Math.random() * 900000))
    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/parceiros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tecnico.id,
          portalPin,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao gerar PIN do tecnico.')

      const nome = getNomeTecnico(tecnico) || 'tecnico'
      const login = `${window.location.origin}/tecnico/login`
      const linkWhatsapp = getWhatsappPinLink(tecnico, portalPin, login)

      setMensagem(`PIN gerado para ${nome}: ${portalPin}. Portal: ${login}`)
      if (linkWhatsapp) window.open(linkWhatsapp, '_blank', 'noopener,noreferrer')
      await carregarTecnicos()
      setTecnicoSelecionado(null)
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao gerar PIN do tecnico.'))
    }
  }

  return (
    <main className="min-h-screen bg-[#c7d3cf] p-4">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Cadastro de Técnicos</h1>
            <p className="text-slate-500">
              Gestão dos profissionais que atendem as ordens de serviço
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href="/cadastro-tecnico"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600"
            >
              Link auto cadastro
            </a>

            <button
              type="button"
              onClick={carregarTecnicos}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              <RefreshIcon />
              Atualizar
            </button>
          </div>
        </header>

        <section className="grid gap-2 md:grid-cols-5">
          <ResumoCard titulo="Técnicos" valor={String(resumo.total)} />
          <ResumoCard titulo="Ativos" valor={String(resumo.ativos)} destaque="emerald" />
          <ResumoCard titulo="Pendentes" valor={String(resumo.pendentes)} destaque="amber" />
          <ResumoCard titulo="Reprovados" valor={String(resumo.reprovados)} destaque="red" />
          <ResumoCard titulo="Inativos" valor={String(resumo.inativos)} destaque="slate" />
        </section>

        {databaseStatus && !databaseStatus.ok && (
          <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Banco pendente de atualização</h2>
                <p className="mt-1 text-sm text-slate-700">
                  Faltam colunas na tabela parceiros: {databaseStatus.faltando.join(', ')}.
                  O cadastro salva o técnico, mas esses campos extras só serão gravados após aplicar o SQL.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={copiarSqlBanco}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                >
                  Copiar SQL
                </button>
                <button
                  type="button"
                  onClick={carregarStatusBanco}
                  className="rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                >
                  Verificar novamente
                </button>
              </div>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-white p-4 text-xs text-slate-800">
              {databaseStatus.sql}
            </pre>
          </section>
        )}

        {tecnicosPendentes.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Cadastros pendentes</h2>
                <p className="text-sm text-slate-600">
                  Revise os dados enviados no auto cadastro antes de liberar para as OS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusFiltro('PENDENTES')}
                className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                Ver todos pendentes
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tecnicosPendentes.map((tecnico) => (
                <div key={tecnico.id ?? getNomeTecnico(tecnico)} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{getNomeTecnico(tecnico) || '-'}</p>
                      <p className="text-xs text-slate-500">{getEmpresaTecnico(tecnico) || 'Sem empresa informada'}</p>
                    </div>
                    <StatusBadge status={getStatusTecnico(tecnico)} />
                  </div>

                  <div className="space-y-1 text-sm text-slate-600">
                    <p>{tecnico.whatsapp ?? 'WhatsApp nao informado'}</p>
                    <p>{formatarEnderecoTecnico(tecnico)}</p>
                    <p>{formatarEspecialidades(tecnico.especialidades)}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTecnicoSelecionado(tecnico)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Revisar
                    </button>
                    {tecnico.whatsapp && (
                      <a
                        href={getWhatsappLink(tecnico)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                      >
                        WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => alterarStatus(tecnico, 'ATIVO')}
                      className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-600"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => alterarStatus(tecnico, 'REPROVADO')}
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
                    >
                      Reprovar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <form onSubmit={salvarTecnico} className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                {editandoId ? 'Editar técnico' : 'Novo técnico'}
              </h2>
              <p className="text-xs text-slate-500">
                Dados principais para localizar, filtrar e acionar o profissional.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {editandoId && (
                <button
                  type="button"
                  onClick={cancelarEdicao}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-black text-slate-700"
                >
                  Cancelar
                </button>
              )}

              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <SaveIcon />
                {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Salvar técnico'}
              </button>
            </div>
          </div>

          {erro && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">
              {erro}
            </div>
          )}

          {mensagem && (
            <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {mensagem}
            </div>
          )}

          <div className="space-y-5">
            <section>
              <SectionTitle title="Identificação" />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Input label="Nome do técnico *" name="nome" value={form.nome} onChange={handleChange} />
                <Input label="Empresa" name="empresa" value={form.empresa} onChange={handleChange} placeholder="Ex.: RCL Elétrica" />
                <Input label="CPF/CNPJ" name="cpfCnpj" value={form.cpfCnpj} onChange={handleChange} />
                <Input label="Chave PIX" name="chavePix" value={form.chavePix} onChange={handleChange} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
                <Input label="WhatsApp *" name="whatsapp" value={form.whatsapp} onChange={handleChange} />
                <Input label="E-mail" name="email" value={form.email} onChange={handleChange} />
                <Select
                  label="Tipo de vínculo"
                  name="tipoVinculo"
                  value={form.tipoVinculo}
                  onChange={handleChange}
                  options={[
                    { value: 'TERCEIRIZADO', label: 'Terceirizado' },
                    { value: 'PROPRIO', label: 'Próprio' },
                  ]}
                  placeholder="Selecione"
                />
              </div>
            </section>

            <section>
              <SectionTitle title="Endereço base" />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Input
                  label={buscandoCep ? 'CEP buscando...' : 'CEP'}
                  name="cep"
                  value={form.cep}
                  onChange={handleChange}
                />
                <Input
                  label="Logradouro"
                  name="logradouro"
                  value={form.logradouro}
                  onChange={handleChange}
                  wide
                />
                <Input label="Número" name="numero" value={form.numero} onChange={handleChange} />
                <Input label="Bairro" name="bairro" value={form.bairro} onChange={handleChange} />
                <Input label="Cidade base" name="cidade" value={form.cidade} onChange={handleChange} />
                <Input label="Estado" name="estado" value={form.estado} onChange={handleChange} maxLength={2} />
                <Input
                  label="Referência"
                  name="referencia"
                  value={form.referencia}
                  onChange={handleChange}
                  wide
                />
              </div>
            </section>

            <section>
              <SectionTitle title="Especialidades" />
              <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
                {especialidadesDisponiveis.map((especialidade) => {
                  const checked = form.especialidades.includes(especialidade)

                  return (
                    <label
                      key={especialidade}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                        checked
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => alternarEspecialidade(especialidade)}
                        className="h-4 w-4 accent-orange-500"
                      />
                      {especialidade}
                    </label>
                  )
                })}
              </div>
            </section>

            <section>
              <SectionTitle title="Observações" />
              <textarea
                name="observacoes"
                value={form.observacoes}
                onChange={handleChange}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
                placeholder="Dados de agenda, disponibilidade, restrições ou combinados internos..."
              />
            </section>
          </div>
        </form>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-black text-slate-950">Técnicos cadastrados</h2>

            <div className="flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar técnico, cidade, especialidade..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 md:w-80"
              />

              <select
                value={statusFiltro}
                onChange={(event) => setStatusFiltro(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
              >
                <option value="TODOS">Todos</option>
                <option value="ATIVOS">Ativos</option>
                <option value="PENDENTES">Pendentes</option>
                <option value="REPROVADOS">Reprovados</option>
                <option value="INATIVOS">Inativos</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1100px] w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nome / Empresa</th>
                  <th className="px-3 py-2">WhatsApp</th>
                  <th className="px-3 py-2">PIX</th>
                  <th className="px-3 py-2">E-mail</th>
                  <th className="px-3 py-2">Vínculo</th>
                  <th className="px-3 py-2">Endereço base</th>
                  <th className="px-3 py-2">Especialidades</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>

              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                      Carregando técnicos...
                    </td>
                  </tr>
                )}

                {!loading &&
                  tecnicosFiltrados.map((tecnico) => (
                    <tr
                      key={tecnico.id ?? getNomeTecnico(tecnico)}
                      className={`border-t ${
                        tecnicoPendente(tecnico)
                          ? 'bg-amber-50/60'
                          : tecnicoReprovado(tecnico)
                            ? 'bg-red-50/50'
                            : ''
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-slate-900">
                        <div>{getNomeTecnico(tecnico) || '-'}</div>
                        <div className="text-xs font-normal text-slate-500">{getEmpresaTecnico(tecnico) || '-'}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {tecnico.whatsapp ?? '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{tecnico.chave_pix ?? '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{tecnico.email ?? '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <VinculoBadge vinculo={getTipoVinculo(tecnico)} />
                      </td>
                      <td className="px-3 py-2">
                        {formatarEnderecoTecnico(tecnico)}
                      </td>
                      <td className="px-3 py-2">{formatarEspecialidades(tecnico.especialidades)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={getStatusTecnico(tecnico)} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setTecnicoSelecionado(tecnico)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                          >
                            Revisar
                          </button>
                          <button
                            type="button"
                            onClick={() => editarTecnico(tecnico)}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800"
                          >
                            Editar
                          </button>
                          {tecnicoPendente(tecnico) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => alterarStatus(tecnico, 'ATIVO')}
                                className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-orange-600"
                              >
                                Aprovar
                              </button>
                              <button
                                type="button"
                                onClick={() => alterarStatus(tecnico, 'REPROVADO')}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700"
                              >
                                Reprovar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => alternarStatus(tecnico)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                tecnicoAtivo(tecnico)
                                  ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                                  : 'bg-orange-500 text-white hover:bg-orange-600'
                              }`}
                            >
                              {tecnicoAtivo(tecnico) ? 'Inativar' : 'Ativar'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => gerarPinPortal(tecnico)}
                            className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-orange-600"
                          >
                            Gerar PIN
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                {!loading && !tecnicosFiltrados.length && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                      Nenhum técnico encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {tecnicoSelecionado && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-orange-600">Revisao do tecnico</p>
                  <h2 className="text-xl font-black text-slate-950">
                    {getNomeTecnico(tecnicoSelecionado) || '-'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {getEmpresaTecnico(tecnicoSelecionado) || 'Empresa nao informada'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTecnicoSelecionado(null)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <DetailItem label="Status" value={getStatusTecnico(tecnicoSelecionado)} />
                <DetailItem label="CPF/CNPJ" value={tecnicoSelecionado.cnpj} />
                <DetailItem label="WhatsApp" value={tecnicoSelecionado.whatsapp} />
                <DetailItem label="E-mail" value={tecnicoSelecionado.email} />
                <DetailItem label="Chave PIX" value={tecnicoSelecionado.chave_pix} />
                <DetailItem label="Tipo de vínculo" value={formatarTipoVinculo(getTipoVinculo(tecnicoSelecionado))} />
                <DetailItem label="CEP" value={tecnicoSelecionado.cep} />
                <DetailItem label="Endereco base" value={formatarEnderecoTecnico(tecnicoSelecionado)} wide />
                <DetailItem label="Especialidades" value={formatarEspecialidades(tecnicoSelecionado.especialidades)} wide />
                <DetailItem label="Observacoes" value={tecnicoSelecionado.observacoes} wide />
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => editarTecnico(tecnicoSelecionado)}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                >
                  Editar dados
                </button>
                {tecnicoSelecionado.whatsapp && (
                  <a
                    href={getWhatsappLink(tecnicoSelecionado)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Chamar no WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => gerarPinPortal(tecnicoSelecionado)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Gerar PIN portal
                </button>
                {tecnicoPendente(tecnicoSelecionado) && (
                  <button
                    type="button"
                    onClick={() => alterarStatus(tecnicoSelecionado, 'REPROVADO')}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    Reprovar cadastro
                  </button>
                )}
                {!tecnicoAtivo(tecnicoSelecionado) && !tecnicoReprovado(tecnicoSelecionado) && (
                  <button
                    type="button"
                    onClick={() => alterarStatus(tecnicoSelecionado, 'ATIVO')}
                    className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                  >
                    Aprovar tecnico
                  </button>
                )}
                {tecnicoReprovado(tecnicoSelecionado) && (
                  <button
                    type="button"
                    onClick={() => alterarStatus(tecnicoSelecionado, 'PENDENTE')}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                  >
                    Reabrir analise
                  </button>
                )}
                {!tecnicoInativo(tecnicoSelecionado) && (
                  <button
                    type="button"
                    onClick={() => alterarStatus(tecnicoSelecionado, 'INATIVO')}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Inativar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function ResumoCard({
  titulo,
  valor,
  destaque = 'slate',
}: {
  titulo: string
  valor: string
  destaque?: 'slate' | 'emerald' | 'orange' | 'amber' | 'red'
}) {
  const cls =
    destaque === 'emerald'
      ? 'text-emerald-600'
      : destaque === 'amber'
        ? 'text-amber-600'
      : destaque === 'red'
        ? 'text-red-600'
      : destaque === 'orange'
        ? 'text-orange-500'
        : 'text-slate-900'

  return (
    <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{titulo}</p>
      <p className={`mt-1 text-xl font-black ${cls}`}>{valor}</p>
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="mb-2 text-sm font-black text-slate-800">{title}</h3>
}

function Input({
  label,
  name,
  value,
  onChange,
  maxLength,
  placeholder,
  wide = false,
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  maxLength?: number
  placeholder?: string
  wide?: boolean
}) {
  return (
    <div className={wide ? 'xl:col-span-2' : ''}>
      <label className="mb-1 block text-xs font-bold text-slate-700">{label}</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
      />
    </div>
  )
}

function Select({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  name: string
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  options: Array<{ value: string; label: string }>
  placeholder: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-slate-700">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function DetailItem({
  label,
  value,
  wide = false,
}: {
  label: string
  value?: string | null
  wide?: boolean
}) {
  return (
    <div className={`rounded-lg bg-slate-50 px-3 py-2 ${wide ? 'md:col-span-2' : ''}`}>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-900">{value || '-'}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'ATIVO'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'PENDENTE'
        ? 'bg-amber-100 text-amber-700'
      : status === 'REPROVADO'
        ? 'bg-red-100 text-red-700'
        : 'bg-slate-100 text-slate-600'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  )
}

function VinculoBadge({ vinculo }: { vinculo: string }) {
  const proprio = vinculo === 'PROPRIO'

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        proprio ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
      }`}
    >
      {formatarTipoVinculo(vinculo)}
    </span>
  )
}

function getNomeTecnico(tecnico: Tecnico) {
  return tecnico.responsavel ?? tecnico.nome_fantasia ?? tecnico.razao_social ?? ''
}

function getEmpresaTecnico(tecnico: Tecnico) {
  const empresa = tecnico.razao_social ?? tecnico.nome_fantasia ?? ''
  return empresa && empresa !== getNomeTecnico(tecnico) ? empresa : ''
}

function getStatusTecnico(tecnico: Tecnico) {
  return (tecnico.status ?? 'ATIVO').toUpperCase()
}

function getTipoVinculo(tecnico: Tecnico) {
  return (tecnico.tipo_vinculo ?? 'TERCEIRIZADO').toUpperCase()
}

function formatarTipoVinculo(vinculo: string) {
  return vinculo === 'PROPRIO' ? 'Próprio' : 'Terceirizado'
}

function tecnicoAtivo(tecnico: Tecnico) {
  return getStatusTecnico(tecnico) === 'ATIVO'
}

function tecnicoPendente(tecnico: Tecnico) {
  return getStatusTecnico(tecnico) === 'PENDENTE'
}

function tecnicoReprovado(tecnico: Tecnico) {
  return getStatusTecnico(tecnico) === 'REPROVADO'
}

function tecnicoInativo(tecnico: Tecnico) {
  return getStatusTecnico(tecnico) === 'INATIVO'
}

function formatarEnderecoTecnico(tecnico: Tecnico) {
  const linha1 = [tecnico.logradouro, tecnico.numero].filter(Boolean).join(', ')
  const linha2 = [tecnico.bairro, tecnico.cidade, tecnico.estado].filter(Boolean).join(' / ')
  const endereco = [linha1, linha2].filter(Boolean).join(' - ')

  return endereco || '-'
}

function formatarEspecialidades(valor?: string[] | string | null) {
  if (Array.isArray(valor)) return valor.length ? valor.join(', ') : '-'
  if (typeof valor === 'string' && valor.trim()) return valor
  return '-'
}

function normalizarEspecialidades(valor?: string[] | string | null) {
  if (Array.isArray(valor)) return valor.map(String).filter(Boolean)

  if (typeof valor === 'string' && valor.trim()) {
    try {
      const parsed = JSON.parse(valor)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {
      // Mantem compatibilidade com bancos que salvaram texto separado por virgula.
    }

    return valor
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function getWhatsappLink(tecnico: Tecnico) {
  const telefone = (tecnico.whatsapp ?? '').replace(/\D/g, '')
  const mensagem = encodeURIComponent(
    `Ola, ${getNomeTecnico(tecnico) || 'tecnico'}! Aqui e da Chame o Tecnico. Recebemos seu cadastro e estamos revisando seus dados.`
  )

  return `https://wa.me/55${telefone}?text=${mensagem}`
}

function getWhatsappPinLink(tecnico: Tecnico, pin: string, login: string) {
  const telefone = (tecnico.whatsapp ?? '').replace(/\D/g, '')
  if (!telefone) return ''

  const mensagem = encodeURIComponent(
    [
      `Ola, ${getNomeTecnico(tecnico) || 'tecnico'}!`,
      'Seu acesso ao Portal do Tecnico da Chame o Tecnico foi liberado.',
      '',
      `Link: ${login}`,
      `PIN: ${pin}`,
      '',
      'Entre com seu WhatsApp cadastrado e este PIN para visualizar suas ordens de servico.',
    ].join('\n')
  )

  return `https://wa.me/55${telefone}?text=${mensagem}`
}

function formatarCEP(valor: string) {
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 8)
  if (apenasNumeros.length <= 5) return apenasNumeros
  return `${apenasNumeros.slice(0, 5)}-${apenasNumeros.slice(5)}`
}

function formatarTelefone(valor: string) {
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 11)

  if (apenasNumeros.length <= 2) return apenasNumeros
  if (apenasNumeros.length <= 6) return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`
  if (apenasNumeros.length <= 10) {
    return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 6)}-${apenasNumeros.slice(6)}`
  }

  return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7)}`
}

function formatarCpfCnpj(valor: string) {
  const numeros = valor.replace(/\D/g, '').slice(0, 14)

  if (numeros.length <= 11) {
    return numeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  return numeros
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1.$2')
    .replace(/(\d{4})(\d)/, '$1/$2')
    .replace(/(\d{2})$/, '-$1')
}

function formatarErro(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err

  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code, obj.error, obj.statusText]
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

function SvgIcon({
  children,
  className = 'h-4 w-4',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      {children}
    </svg>
  )
}

function RefreshIcon() {
  return (
    <SvgIcon>
      <path d="M21 12a9 9 0 0 0-15-6.7" />
      <path d="M3 4v5h5" />
      <path d="M3 12a9 9 0 0 0 15 6.7" />
      <path d="M21 20v-5h-5" />
    </SvgIcon>
  )
}

function SaveIcon() {
  return (
    <SvgIcon>
      <path d="M4 4h12l4 4v12H4z" />
      <path d="M8 4v6h8V4" />
      <path d="M8 20v-5h8v5" />
    </SvgIcon>
  )
}
