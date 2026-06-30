'use client'

import {
  type ChangeEvent,
  type ChangeEventHandler,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/admin-fetch'

type Categoria = {
  id: number
  nome: string
}

type Marca = {
  id: number
  nome: string
  categoria_id: number | null
}

type OrdemServico = {
  id: number
  numero_os: string | null
  origem_os?: string | null
  created_at: string
  status: string | null
  prioridade: string | null
  modelo: string | null
  defeito: string | null
  parceiro_id?: number | null
  cliente_whatsapp?: string | null
  cliente_endereco?: string | null
  cliente_nome?: string | null
  categoria_nome?: string | null
  marca_nome?: string | null
  tecnico_nome?: string | null
  tecnico_whatsapp?: string | null
  tecnico_resposta?: TecnicoResposta | null
  tecnico_sugeridos?: TecnicoSugerido[]
}

type TecnicoResposta = {
  acao: string | null
  descricao: string | null
  criado_em: string | null
}

type TecnicoSugerido = {
  id: number
  nome: string
  whatsapp: string | null
  cidade: string | null
  estado: string | null
  distancia_km: number | null
  criterio: string
}

type OrdemServicoTriagemApi = {
  id: number
  numero_os: string | null
  origem_os?: string | null
  created_at: string
  status: string | null
  prioridade: string | null
  modelo: string | null
  defeito: string | null
  parceiro_id: number | null
  clientes?: {
    nome: string | null
    whatsapp: string | null
    cep: string | null
    logradouro: string | null
    numero: string | null
    bairro: string | null
    cidade: string | null
    estado: string | null
  } | null
  parceiros?: {
    responsavel: string | null
    nome_fantasia: string | null
    razao_social: string | null
    whatsapp: string | null
  } | null
  tecnico_resposta?: TecnicoResposta | null
  categorias?: { nome: string | null } | null
  marcas?: { nome: string | null } | null
  tecnico_sugeridos?: TecnicoSugerido[]
}

type FormState = {
  nomeCliente: string
  cpfCnpj: string
  whatsapp: string
  email: string
  cep: string
  rua: string
  numero: string
  bairro: string
  cidade: string
  estado: string
  categoriaId: string
  marcaId: string
  modelo: string
  numeroSerie: string
  garantia: 'SIM' | 'NAO'
  dataCompra: string
  numeroNf: string
  localCompra: string
  defeito: string
  prioridade: 'NORMAL' | 'URGENTE'
  observacaoInterna: string
}

const formInicial: FormState = {
  nomeCliente: '',
  cpfCnpj: '',
  whatsapp: '',
  email: '',
  cep: '',
  rua: '',
  numero: '',
  bairro: '',
  cidade: '',
  estado: '',
  categoriaId: '',
  marcaId: '',
  modelo: '',
  numeroSerie: '',
  garantia: 'NAO',
  dataCompra: '',
  numeroNf: '',
  localCompra: '',
  defeito: '',
  prioridade: 'NORMAL',
  observacaoInterna: '',
}

const STATUS_FILTROS = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'NOVA', label: 'Novas' },
  { value: 'EM_TRIAGEM', label: 'Triagem' },
  { value: 'EM_ATENDIMENTO', label: 'Atendimento' },
  { value: 'AGUARDANDO_REVISAO', label: 'Revisao admin' },
  { value: 'AGUARDANDO_APROVACAO', label: 'Aguard. aprovação' },
  { value: 'AGUARDANDO_PECA', label: 'Aguard. peça' },
  { value: 'CRITICA', label: 'Críticas' },
] as const

const STATUS_BOARD = [
  { value: 'NOVA', label: 'Novas', accent: 'bg-slate-500' },
  { value: 'EM_TRIAGEM', label: 'Triagem', accent: 'bg-amber-500' },
  { value: 'EM_ATENDIMENTO', label: 'Atendimento', accent: 'bg-blue-500' },
  { value: 'AGUARDANDO_REVISAO', label: 'Revisao Admin', accent: 'bg-indigo-500' },
  { value: 'AGUARDANDO_APROVACAO', label: 'Aguardando Aprovação', accent: 'bg-cyan-500' },
  { value: 'AGUARDANDO_PECA', label: 'Aguardando Peça', accent: 'bg-violet-500' },
  { value: 'CRITICA', label: 'Críticas', accent: 'bg-red-500' },
] as const

const ORIGEM_FILTROS = [
  { value: 'TODAS', label: 'Todas origens' },
  { value: 'PORTAL_CLIENTE', label: 'Portal Cliente' },
  { value: 'ABERTURA_INTERNA', label: 'Abertura Interna' },
  { value: 'GARANTIA_SEGURADORA', label: 'Garantia/Seguradora' },
  { value: 'AVULSO_ADMIN', label: 'Avulso/Admin' },
] as const

export default function OrdensServicoPage() {
  const router = useRouter()

  const [form, setForm] = useState<FormState>(formInicial)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [fotos, setFotos] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [atribuindoId, setAtribuindoId] = useState<number | null>(null)
  const [atualizandoStatusId, setAtualizandoStatusId] = useState<number | null>(null)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('TODAS')
  const [origemFiltro, setOrigemFiltro] = useState('TODAS')
  const [notificacoesAberta, setNotificacoesAberta] = useState(false)

  useEffect(() => {
    void carregarDados()
  }, [])

  useEffect(() => {
    const cepLimpo = form.cep.replace(/\D/g, '')
    if (cepLimpo.length !== 8) return

    const timer = setTimeout(() => {
      void buscarCep(cepLimpo)
    }, 500)

    return () => clearTimeout(timer)
  }, [form.cep])

  const marcasFiltradas = useMemo(() => {
    if (!form.categoriaId) return []
    return marcas.filter((marca) => String(marca.categoria_id) === form.categoriaId)
  }, [marcas, form.categoriaId])

  const ordensFiltradas = useMemo(() => {
    return ordens.filter((os) => {
      const texto =
        `${os.numero_os ?? ''} ${formatarOrigemOs(os.origem_os)} ${os.cliente_nome ?? ''} ${os.cliente_endereco ?? ''} ${os.categoria_nome ?? ''} ${os.marca_nome ?? ''} ${os.modelo ?? ''} ${os.tecnico_nome ?? ''}`.toLowerCase()

      const bateBusca = texto.includes(busca.toLowerCase().trim())
      const bateStatus = statusFiltro === 'TODAS' || os.status === statusFiltro
      const bateOrigem = origemFiltro === 'TODAS' || normalizarOrigemOs(os.origem_os) === origemFiltro

      return bateBusca && bateStatus && bateOrigem
    })
  }, [ordens, busca, statusFiltro, origemFiltro])

  const resumoStatus = useMemo(() => {
    return STATUS_FILTROS.map((status) => ({
      ...status,
      total:
        status.value === 'TODAS'
          ? ordens.length
        : ordens.filter((ordem) => ordem.status === status.value).length,
    }))
  }, [ordens])

  const colunasStatus = useMemo(() => {
    return STATUS_BOARD
      .map((status) => ({
        ...status,
        ordens: ordensFiltradas.filter((ordem) => ordem.status === status.value),
      }))
      .filter((coluna) => statusFiltro === 'TODAS' || coluna.value === statusFiltro)
  }, [ordensFiltradas, statusFiltro])

  const notificacoesOperacionais = useMemo(() => {
    const semTecnicoTresDias = ordens.filter((os) => getDiasSemTecnico(os) >= 3).length
    const novas = ordens.filter((os) => os.status === 'NOVA').length
    const revisaoAdmin = ordens.filter((os) => os.status === 'AGUARDANDO_REVISAO').length
    const aguardandoAprovacao = ordens.filter((os) => os.status === 'AGUARDANDO_APROVACAO').length
    const criticas = ordens.filter((os) => os.status === 'CRITICA').length

    return [
      { label: 'OS novas para triagem', total: novas, tone: 'bg-emerald-100 text-emerald-700', filtro: 'NOVA' },
      { label: 'OS ha 3+ dias sem tecnico', total: semTecnicoTresDias, tone: 'bg-red-100 text-red-700', filtro: 'TODAS' },
      { label: 'Aguardando revisao admin', total: revisaoAdmin, tone: 'bg-indigo-100 text-indigo-700', filtro: 'AGUARDANDO_REVISAO' },
      { label: 'Aguardando aprovacao', total: aguardandoAprovacao, tone: 'bg-cyan-100 text-cyan-700', filtro: 'AGUARDANDO_APROVACAO' },
      { label: 'OS criticas', total: criticas, tone: 'bg-orange-100 text-orange-700', filtro: 'CRITICA' },
    ].filter((item) => item.total > 0)
  }, [ordens])

  const totalNotificacoes = notificacoesOperacionais.reduce((acc, item) => acc + item.total, 0)

  async function carregarDados() {
    setLoading(true)
    setErro('')

    try {
      const categoriasRes = await supabase
        .from('categorias')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (categoriasRes.error) throw categoriasRes.error
      setCategorias(categoriasRes.data ?? [])

      const marcasRes = await supabase
        .from('marcas')
        .select('id, nome, categoria_id')
        .order('nome', { ascending: true })

      if (marcasRes.error) throw marcasRes.error
      setMarcas(marcasRes.data ?? [])

      await carregarOrdensTriagem()
    } catch (err) {
      console.error('Erro no carregarDados:', err)
      setErro(formatarErro(err, 'Erro ao carregar a OS.'))
    } finally {
      setLoading(false)
    }
  }

  async function carregarOrdensTriagem() {
    const response = await adminFetch('/api/admin/os/triagem')
    const data = await response.json().catch(() => null)

    if (!response.ok) throw new Error(data?.error ?? 'Erro ao carregar as OS.')

    setOrdens(
      (data?.data ?? []).map((item: OrdemServicoTriagemApi) => ({
        id: item.id,
        numero_os: item.numero_os,
        origem_os: item.origem_os ?? null,
        created_at: item.created_at,
        status: item.status,
        prioridade: item.prioridade,
        modelo: item.modelo,
        defeito: item.defeito,
        parceiro_id: item.parceiro_id,
        cliente_nome: item.clientes?.nome ?? null,
        cliente_whatsapp: item.clientes?.whatsapp ?? null,
        cliente_endereco: formatarEnderecoCliente(item.clientes),
        categoria_nome: item.categorias?.nome ?? null,
        marca_nome: item.marcas?.nome ?? null,
        tecnico_nome: getNomeTecnico(item.parceiros),
        tecnico_whatsapp: item.parceiros?.whatsapp ?? null,
        tecnico_resposta: item.tecnico_resposta ?? null,
        tecnico_sugeridos: item.tecnico_sugeridos ?? [],
      }))
    )
  }

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target

    if (name === 'categoriaId') {
      setForm((prev) => ({
        ...prev,
        categoriaId: value,
        marcaId: '',
      }))
      return
    }

    if (name === 'cep') {
      setForm((prev) => ({ ...prev, cep: formatarCEP(value) }))
      return
    }

    if (name === 'whatsapp') {
      setForm((prev) => ({ ...prev, whatsapp: formatarTelefone(value) }))
      return
    }

    if (name === 'cpfCnpj') {
      setForm((prev) => ({ ...prev, cpfCnpj: formatarCpfCnpj(value) }))
      return
    }

    if (name === 'garantia' && value === 'NAO') {
      setForm((prev) => ({
        ...prev,
        garantia: 'NAO',
        dataCompra: '',
        numeroNf: '',
        localCompra: '',
      }))
      return
    }

    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleFotosChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    setFotos(Array.from(files))
  }

  async function buscarCep(cepInformado?: string) {
    const cepLimpo = (cepInformado ?? form.cep).replace(/\D/g, '')

    if (cepLimpo.length !== 8) return

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const data = await response.json()

      if (data.erro) {
        setErro('CEP não encontrado.')
        return
      }

      setForm((prev) => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: data.uf || prev.estado,
      }))
    } catch {
      setErro('Falha ao buscar o CEP.')
    }
  }

  async function salvarOS(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro('')
    setMensagem('')
    setSalvando(true)

    try {
      if (
        !form.nomeCliente.trim() ||
        !form.cpfCnpj.trim() ||
        !form.whatsapp.trim() ||
        !form.cep.trim() ||
        !form.categoriaId ||
        !form.marcaId ||
        !form.modelo.trim() ||
        !form.defeito.trim()
      ) {
        throw new Error('Preencha os campos obrigatórios da OS.')
      }

      const response = await adminFetch('/api/admin/os/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao criar a OS.')

      const numeroOS = data.numeroOS
      const osCriada = { id: data.id }
      /*
      const whatsappLimpo = form.whatsapp.trim()
      const emailLimpo = form.email.trim()

      let clienteId: number | null = null

      const { data: clientePorWhatsapp, error: erroWhatsapp } = await supabase
        .from('clientes')
        .select('id')
        .eq('whatsapp', whatsappLimpo)
        .maybeSingle()

      if (erroWhatsapp) throw erroWhatsapp
      if (clientePorWhatsapp?.id) {
        clienteId = clientePorWhatsapp.id
      }

      if (!clienteId && emailLimpo) {
        const { data: clientePorEmail, error: erroEmail } = await supabase
          .from('clientes')
          .select('id')
          .eq('email', emailLimpo)
          .maybeSingle()

        if (erroEmail) throw erroEmail
        if (clientePorEmail?.id) {
          clienteId = clientePorEmail.id
        }
      }

      if (!clienteId) {
        const { data: novoCliente, error: novoClienteError } = await supabase
          .from('clientes')
          .insert({
            nome: form.nomeCliente.trim(),
            cpf_cnpj: form.cpfCnpj.trim(),
            whatsapp: whatsappLimpo,
            email: emailLimpo || null,
            cep: form.cep.trim() || null,
            logradouro: form.rua.trim() || null,
            numero: form.numero.trim() || null,
            bairro: form.bairro.trim() || null,
            cidade: form.cidade.trim() || null,
            estado: form.estado.trim() || null,
          })
          .select('id')
          .single()

        if (novoClienteError) throw novoClienteError
        clienteId = novoCliente.id
      }

      const numeroOS = gerarNumeroOS()

      const { data: osCriada, error: osError } = await supabase
        .from('ordens_servico')
        .insert({
          numero_os: numeroOS,
          cliente_id: Number(clienteId),
          categoria_id: Number(form.categoriaId),
          marca_id: Number(form.marcaId),
          modelo: form.modelo.trim(),
          numero_serie: form.numeroSerie.trim() || null,
          defeito: form.defeito.trim(),
          status: 'NOVA',
          prioridade: form.prioridade,
          parceiro_id: null,
          sla_status: 'NORMAL',
        })
        .select('id')
        .single()

      if (osError) throw osError
      if (!osCriada?.id) throw new Error('A OS foi criada, mas o ID não retornou.')

      */

      if (!osCriada?.id) throw new Error('A OS foi criada, mas o ID não retornou.')

      if (false && fotos.length > 0) {
        for (const arquivo of fotos) {
          const caminho = `${osCriada.id}/${Date.now()}-${arquivo.name}`

          const { error: uploadError } = await supabase.storage
            .from('os-fotos')
            .upload(caminho, arquivo)

          if (uploadError) throw uploadError

          const { data: urlData } = supabase.storage
            .from('os-fotos')
            .getPublicUrl(caminho)

          const { error: fotoDbError } = await supabase.from('os_fotos').insert({
            os_id: osCriada.id,
            nome_arquivo: arquivo.name,
            url: urlData.publicUrl,
          })

          if (fotoDbError) throw fotoDbError
        }
      }

      setMensagem(`OS criada com sucesso: ${numeroOS}`)
      setForm(formInicial)
      setFotos([])
      await carregarDados()
    } catch (err) {
      console.error('Erro ao salvar OS:', err)
      setErro(formatarErro(err, 'Ocorreu um erro ao salvar a OS.'))
    } finally {
      setSalvando(false)
    }
  }

  async function atribuirTecnico(osId: number, parceiroId: number) {
    setAtribuindoId(osId)
    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/os/triagem', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osId, parceiroId }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao atribuir técnico.')

      setMensagem('Técnico atribuído com sucesso.')
      await carregarDados()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao atribuir técnico.'))
    } finally {
      setAtribuindoId(null)
    }
  }

  async function atualizarStatusOS(osId: number, status: string) {
    setAtualizandoStatusId(osId)
    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/os/triagem', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osId, status }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Erro ao atualizar status.')

      setMensagem('Status atualizado com sucesso.')
      await carregarDados()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao atualizar status.'))
    } finally {
      setAtualizandoStatusId(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#c7d3cf] p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Ordens de Serviço</h1>
            <p className="text-slate-500">Fila de triagem e gerenciamento dos chamados abertos</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => setMostrarFormulario((prev) => !prev)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
              type="button"
            >
              <SaveIcon />
              {mostrarFormulario ? 'Fechar abertura' : 'Nova OS'}
            </button>

            <button
              onClick={() => router.push('/admin/dashboard')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-sm"
              type="button"
            >
              <HomeIcon />
              Dashboard
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificacoesAberta((prev) => !prev)}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#edf3f0] px-4 py-3 text-sm text-slate-700 shadow-sm"
              >
                Notificacoes
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs text-white ${totalNotificacoes > 0 ? 'bg-orange-500' : 'bg-slate-400'}`}>
                  {totalNotificacoes}
                </span>
              </button>

              {notificacoesAberta && (
                <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-950">Alertas operacionais</p>
                    <button
                      type="button"
                      onClick={() => setNotificacoesAberta(false)}
                      className="rounded-md px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100"
                    >
                      Fechar
                    </button>
                  </div>

                  {notificacoesOperacionais.length === 0 ? (
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                      Nenhum alerta no momento.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {notificacoesOperacionais.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            setStatusFiltro(item.filtro)
                            setNotificacoesAberta(false)
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-orange-300 hover:bg-orange-50"
                        >
                          <span className="text-xs font-bold text-slate-700">{item.label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-black ${item.tone}`}>
                            {item.total}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button className="hidden items-center justify-center rounded-lg bg-[#edf3f0] px-4 py-3 text-sm text-slate-700 shadow-sm">
              Notificações
              <span className="ml-2 rounded-full bg-orange-500 px-2 py-0.5 text-xs text-white">
                7
              </span>
            </button>

            <button className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-5 py-3 text-sm font-medium text-white shadow-sm">
              Paulo
            </button>
          </div>
        </header>

        {erro && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {mensagem}
          </div>
        )}

        <section className="rounded-2xl bg-[#e8efec] p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {resumoStatus.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setStatusFiltro(item.value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  statusFiltro === item.value
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item.label}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {item.total}
                </span>
              </button>
            ))}
          </div>
        </section>

        {mostrarFormulario && (
        <form onSubmit={salvarOS} className="rounded-2xl bg-[#e8efec] p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Nova Ordem de Serviço</h2>
              <p className="text-sm text-slate-500">Formulário espelhado da abertura do cliente</p>
            </div>

            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <SaveIcon />
              {salvando ? 'Salvando...' : 'Salvar OS'}
            </button>
          </div>

          <div className="space-y-8">
            <section>
              <SectionTitle title="Dados do Cliente" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Input label="Nome Completo *" name="nomeCliente" value={form.nomeCliente} onChange={handleChange} />
                <Input label="CPF/CNPJ *" name="cpfCnpj" value={form.cpfCnpj} onChange={handleChange} />
                <Input label="WhatsApp *" name="whatsapp" value={form.whatsapp} onChange={handleChange} />
                <Input label="E-mail" name="email" value={form.email} onChange={handleChange} />
              </div>
            </section>

            <section>
              <SectionTitle title="Endereço" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Input label="CEP *" name="cep" value={form.cep} onChange={handleChange} />
                <Input label="Rua" name="rua" value={form.rua} onChange={handleChange} />
                <Input label="Número" name="numero" value={form.numero} onChange={handleChange} />
                <Input label="Bairro" name="bairro" value={form.bairro} onChange={handleChange} />
                <Input label="Cidade" name="cidade" value={form.cidade} onChange={handleChange} />
                <Input label="Estado" name="estado" value={form.estado} onChange={handleChange} />
              </div>
            </section>

            <section>
              <SectionTitle title="Equipamento" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Select
                  label="Categoria *"
                  name="categoriaId"
                  value={form.categoriaId}
                  onChange={handleChange}
                  options={categorias.map((categoria) => ({
                    value: String(categoria.id),
                    label: categoria.nome,
                  }))}
                  placeholder={loading ? 'Carregando...' : 'Selecione a categoria'}
                />

                <Select
                  label="Marca *"
                  name="marcaId"
                  value={form.marcaId}
                  onChange={handleChange}
                  options={marcasFiltradas.map((marca) => ({
                    value: String(marca.id),
                    label: marca.nome,
                  }))}
                  placeholder={
                    !form.categoriaId
                      ? 'Selecione a categoria primeiro'
                      : marcasFiltradas.length
                        ? 'Selecione a marca'
                        : 'Sem marcas para esta categoria'
                  }
                  disabled={!form.categoriaId}
                />

                <Input label="Modelo *" name="modelo" value={form.modelo} onChange={handleChange} />
                <Input label="Número de Série" name="numeroSerie" value={form.numeroSerie} onChange={handleChange} />
              </div>
            </section>

            <section>
              <SectionTitle title="Garantia" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Select
                  label="OS em garantia?"
                  name="garantia"
                  value={form.garantia}
                  onChange={handleChange}
                  options={[
                    { value: 'NAO', label: 'Não' },
                    { value: 'SIM', label: 'Sim' },
                  ]}
                  placeholder="Selecione"
                />

                {form.garantia === 'SIM' && (
                  <>
                    <Input
                      label="Data da compra"
                      name="dataCompra"
                      value={form.dataCompra}
                      onChange={handleChange}
                      type="date"
                    />
                    <Input label="Número da NF" name="numeroNf" value={form.numeroNf} onChange={handleChange} />
                    <Input label="Local de compra" name="localCompra" value={form.localCompra} onChange={handleChange} />
                  </>
                )}
              </div>
            </section>

            <section>
              <SectionTitle title="Fotos da OS" />
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFotosChange}
                  className="block w-full text-sm"
                />

                {fotos.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {fotos.length} arquivo(s) selecionado(s)
                  </p>
                )}
              </div>
            </section>

            <section>
              <SectionTitle title="Defeito Relatado" />
              <textarea
                name="defeito"
                value={form.defeito}
                onChange={handleChange}
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500"
                placeholder="Descreva o defeito informado pelo cliente..."
              />
            </section>

            <section>
              <SectionTitle title="Triagem Administrativa" />
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  label="Prioridade"
                  name="prioridade"
                  value={form.prioridade}
                  onChange={handleChange}
                  options={[
                    { value: 'NORMAL', label: 'Normal' },
                    { value: 'URGENTE', label: 'Urgente' },
                  ]}
                  placeholder="Selecione"
                />

                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  Upload de fotos da OS para o bucket os-fotos.
                </div>
              </div>

              <textarea
                name="observacaoInterna"
                value={form.observacaoInterna}
                onChange={handleChange}
                rows={4}
                className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500"
                placeholder="Observação interna da triagem..."
              />
            </section>
          </div>
        </form>
        )}

        <section className="rounded-2xl bg-[#e8efec] p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Triagem de Ordens de Serviço</h2>
              <p className="text-sm text-slate-500">
                OS novas e abertas para análise, priorização e atribuição de técnico externo
              </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar OS, cliente, endereço..."
                className="w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-orange-500 md:w-72"
              />

              <select
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value)}
                className="rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-orange-500"
              >
                <option value="TODAS">Todas</option>
                <option value="NOVA">Nova</option>
                <option value="EM_TRIAGEM">Em Triagem</option>
                <option value="EM_ATENDIMENTO">Em Atendimento</option>
                <option value="AGUARDANDO_APROVACAO">Aguardando Aprovação</option>
                <option value="AGUARDANDO_PECA">Aguardando Peça</option>
                <option value="CRITICA">Crítica</option>
                <option value="FINALIZADA">Finalizada</option>
              </select>

              <select
                value={origemFiltro}
                onChange={(e) => setOrigemFiltro(e.target.value)}
                className="rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-orange-500"
              >
                {ORIGEM_FILTROS.map((origem) => (
                  <option key={origem.value} value={origem.value}>
                    {origem.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <KanbanOSBoard
            colunas={colunasStatus}
            atribuindoId={atribuindoId}
            atualizandoStatusId={atualizandoStatusId}
            onAtribuirTecnico={atribuirTecnico}
            onAtualizarStatus={atualizarStatusOS}
            onAbrirDetalhes={(osId) => router.push(`/admin/os/${osId}`)}
          />

          <div className="hidden overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1600px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3">OS</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Endereço</th>
                  <th className="px-4 py-3">Equipamento</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Técnico</th>
                  <th className="px-4 py-3">3 mais próximos</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>

              <tbody>
                {ordensFiltradas.map((os) => (
                  <tr key={os.id} className="border-t align-top">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{os.numero_os ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{os.cliente_nome ?? '-'}</div>
                      <div className="text-xs text-slate-500">{os.cliente_whatsapp ?? '-'}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[280px] text-slate-600">
                      {os.cliente_endereco ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{os.modelo ?? '-'}</div>
                      <div className="text-xs text-slate-500">
                        {[os.categoria_nome, os.marca_nome].filter(Boolean).join(' / ') || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={os.status ?? 'NOVA'} />
                      <div className="mt-1 text-xs text-slate-500">{os.prioridade ?? 'NORMAL'}</div>
                      <select
                        value={os.status ?? 'NOVA'}
                        disabled={atualizandoStatusId === os.id}
                        onChange={(event) => atualizarStatusOS(os.id, event.target.value)}
                        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        <option value="NOVA">Nova</option>
                        <option value="EM_TRIAGEM">Em Triagem</option>
                        <option value="EM_ATENDIMENTO">Em Atendimento</option>
                        <option value="AGUARDANDO_APROVACAO">Aguardando Aprovação</option>
                        <option value="AGUARDANDO_PECA">Aguardando Peça</option>
                        <option value="CRITICA">Crítica</option>
                        <option value="FINALIZADA">Finalizada</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {os.tecnico_nome ? (
                        <span className="font-medium text-emerald-700">{os.tecnico_nome}</span>
                      ) : (
                        <span className="text-slate-400">Não atribuído</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid gap-2">
                        {(os.tecnico_sugeridos ?? []).map((tecnico) => (
                          <button
                            key={tecnico.id}
                            type="button"
                            disabled={atribuindoId === os.id}
                            onClick={() => atribuirTecnico(os.id, tecnico.id)}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <TecnicoSugestao tecnico={tecnico} />
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                              atribuir
                            </span>
                          </button>
                        ))}

                        {!os.tecnico_sugeridos?.length && (
                          <span className="text-sm text-slate-500">Nenhum técnico ativo.</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/os/${os.id}`)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                        >
                          <OpenIcon />
                          Ver detalhes
                        </button>

                        {os.tecnico_whatsapp && (
                          <a
                            href={criarLinkWhatsAppTecnico(os)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-700"
                          >
                            WhatsApp técnico
                          </a>
                        )}

                        <span className="text-xs text-slate-500">
                          {new Date(os.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}

                {!ordensFiltradas.length && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                      Nenhuma OS encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function Input({
  label,
  name,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  name: string
  value: string
  onChange: ChangeEventHandler<HTMLInputElement>
  type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500"
      />
    </div>
  )
}

function TecnicoSugestao({
  tecnico,
  index,
  compact = false,
}: {
  tecnico: TecnicoSugerido
  index?: number
  compact?: boolean
}) {
  const distancia = formatarDistanciaTecnico(tecnico)
  const criterio = formatarLocalidadeTecnico(tecnico)

  return (
    <span className="block min-w-0">
      <span className={`${compact ? 'text-[11px]' : 'text-xs'} block truncate font-semibold text-slate-800`}>
        {typeof index === 'number' ? `${index + 1}. ` : ''}
        {tecnico.nome}
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-1.5">
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${
            distancia ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          } ${compact ? 'text-[10px]' : 'text-[11px]'}`}
        >
          {distancia ?? 'sem km'}
        </span>
        {criterio && (
          <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} truncate text-slate-500`}>
            {criterio}
          </span>
        )}
      </span>
    </span>
  )
}

function KanbanOSBoard({
  colunas,
  atribuindoId,
  atualizandoStatusId,
  onAtribuirTecnico,
  onAtualizarStatus,
  onAbrirDetalhes,
}: {
  colunas: Array<(typeof STATUS_BOARD)[number] & { ordens: OrdemServico[] }>
  atribuindoId: number | null
  atualizandoStatusId: number | null
  onAtribuirTecnico: (osId: number, parceiroId: number) => void
  onAtualizarStatus: (osId: number, status: string) => void
  onAbrirDetalhes: (osId: number) => void
}) {
  const [tecnicoAbertoId, setTecnicoAbertoId] = useState<number | null>(null)
  const ordensHorizontais = colunas.flatMap((coluna) =>
    coluna.ordens.map((os) => ({
      ...os,
      colunaLabel: coluna.label,
      colunaAccent: coluna.accent,
    }))
  )
  const alertasSemTecnico = ordensHorizontais.filter((os) => getDiasSemTecnico(os) >= 3).length

  return (
    <div className="rounded-xl border border-slate-300 bg-[#cfdad6] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Relação horizontal de OS</h3>
          <p className="text-xs text-slate-600">
            Cards compactos para visualizar mais chamados por tela
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {alertasSemTecnico > 0 && (
            <span className="animate-pulse rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
              {alertasSemTecnico} OS +3 dias sem tecnico
            </span>
          )}
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {ordensHorizontais.length} OS
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-2">
        {ordensHorizontais.map((os) => {
          const diasSemTecnico = getDiasSemTecnico(os)
          const temAlertaSemTecnico = diasSemTecnico >= 3

          return (
          <article
            key={os.id}
            className={`min-h-[230px] rounded-lg border bg-[#f4f7f5] p-2 shadow-sm ${
              temAlertaSemTecnico ? 'border-red-500 ring-2 ring-red-200' : 'border-slate-300'
            }`}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-950">{os.numero_os ?? '-'}</p>
                <p className="truncate text-[11px] text-slate-500">{os.colunaLabel}</p>
              </div>
              {os.status === 'NOVA' ? (
                <span className="mt-1 h-3 w-3 shrink-0 animate-ping rounded-full bg-emerald-500 shadow-sm" />
              ) : (
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${os.colunaAccent}`} />
              )}
            </div>

            <OrigemBadge origem={os.origem_os} compact />

            {os.status === 'NOVA' && (
              <div className="mt-2 mb-2 animate-pulse rounded-md border border-emerald-500 bg-emerald-100 px-2 py-1 text-center text-[11px] font-bold text-emerald-800 shadow-sm">
                NOVA OS
              </div>
            )}

            {temAlertaSemTecnico && (
              <div className="mb-2 animate-pulse rounded-md bg-red-600 px-2 py-1 text-center text-[11px] font-bold text-white">
                {diasSemTecnico} dias sem tecnico
              </div>
            )}

            <div className="space-y-1">
              <p className="truncate text-xs font-semibold text-slate-900">{os.cliente_nome ?? '-'}</p>
              <p className="truncate text-[11px] text-slate-500">{os.cliente_whatsapp ?? '-'}</p>
              <p className="line-clamp-2 text-[11px] leading-4 text-slate-600">{os.cliente_endereco ?? '-'}</p>
              <p className="truncate rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-950 shadow-sm">
                {formatarEquipamentoResumo(os)}
              </p>
            </div>

            <select
              value={os.status ?? 'NOVA'}
              disabled={atualizandoStatusId === os.id}
              onChange={(event) => onAtualizarStatus(os.id, event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-orange-500"
            >
              <option value="NOVA">Nova</option>
              <option value="EM_TRIAGEM">Em Triagem</option>
              <option value="EM_ATENDIMENTO">Em Atendimento</option>
              <option value="AGUARDANDO_APROVACAO">Aguard. Aprov.</option>
              <option value="AGUARDANDO_PECA">Aguard. Peça</option>
              <option value="CRITICA">Crítica</option>
              <option value="FINALIZADA">Finalizada</option>
            </select>

            {tecnicoAceitou(os) && (
              <div className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                Aceito pelo técnico
              </div>
            )}

            <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={tecnicoAbertoId === os.id}
                onChange={() => setTecnicoAbertoId((atual) => (atual === os.id ? null : os.id))}
                className="h-3.5 w-3.5 accent-orange-500"
              />
              Técnico
            </label>

            {tecnicoAbertoId === os.id && (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-300 bg-[#eef3f1] p-1">
                {(os.tecnico_sugeridos ?? []).map((tecnico, index) => (
                  <button
                    key={tecnico.id}
                    type="button"
                    disabled={atribuindoId === os.id}
                    onClick={() => onAtribuirTecnico(os.id, tecnico.id)}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-left text-[11px] hover:border-orange-400 hover:bg-orange-50"
                  >
                    <TecnicoSugestao tecnico={tecnico} index={index} compact />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onAbrirDetalhes(os.id)}
                className="rounded-md bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-white"
              >
                Detalhes
              </button>

              {os.tecnico_whatsapp ? (
                <a
                  href={criarLinkWhatsAppTecnico(os)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-emerald-600 px-2 py-1.5 text-center text-[11px] font-medium text-white"
                >
                  WhatsApp
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-md bg-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-400"
                >
                  WhatsApp
                </button>
              )}
            </div>
          </article>
          )
        })}

        {!ordensHorizontais.length && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-8 text-center text-sm text-slate-500">
            Nenhuma OS encontrada.
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[1320px] gap-4">
        {colunas.map((coluna) => (
          <section
            key={coluna.value}
            className="min-h-[520px] w-[270px] shrink-0 rounded-xl border border-slate-300 bg-[#cfdad6]"
          >
            <div className="sticky top-0 z-10 rounded-t-xl border-b border-slate-300 bg-[#c7d3cf] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${coluna.accent}`} />
                  <h3 className="text-sm font-semibold text-slate-800">{coluna.label}</h3>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {coluna.ordens.length}
                </span>
              </div>
            </div>

            <div className="space-y-3 p-3">
              {coluna.ordens.map((os) => (
                <article
                  key={os.id}
                  className="rounded-lg border border-slate-300 bg-[#f4f7f5] p-3 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{os.numero_os ?? '-'}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(os.created_at).toLocaleString('pt-BR')}
                      </div>
                      <div className="mt-2">
                        <OrigemBadge origem={os.origem_os} />
                      </div>
                    </div>
                    <StatusBadge status={os.status ?? 'NOVA'} />
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{os.cliente_nome ?? '-'}</p>
                      <p className="text-xs text-slate-500">{os.cliente_whatsapp ?? '-'}</p>
                    </div>

                    <p className="line-clamp-2 text-xs text-slate-600">{os.cliente_endereco ?? '-'}</p>

                    <div className="rounded-lg bg-slate-100 px-3 py-2">
                      <p className="font-medium text-slate-800">{os.modelo ?? '-'}</p>
                      <p className="text-xs text-slate-500">
                        {[os.categoria_nome, os.marca_nome].filter(Boolean).join(' / ') || '-'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <select
                      value={os.status ?? 'NOVA'}
                      disabled={atualizandoStatusId === os.id}
                      onChange={(event) => onAtualizarStatus(os.id, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="NOVA">Nova</option>
                      <option value="EM_TRIAGEM">Em Triagem</option>
                      <option value="EM_ATENDIMENTO">Em Atendimento</option>
                      <option value="AGUARDANDO_APROVACAO">Aguardando Aprovação</option>
                      <option value="AGUARDANDO_PECA">Aguardando Peça</option>
                      <option value="CRITICA">Crítica</option>
                      <option value="FINALIZADA">Finalizada</option>
                    </select>

                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="mb-2 text-xs font-semibold text-slate-500">Técnico</p>
                      {os.tecnico_nome ? (
                        <div>
                          <p className="text-sm font-semibold text-emerald-700">{os.tecnico_nome}</p>
                          {tecnicoAceitou(os) && (
                            <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                              Aceito pelo técnico
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">Não atribuído</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={tecnicoAbertoId === os.id}
                        onChange={() =>
                          setTecnicoAbertoId((atual) => (atual === os.id ? null : os.id))
                        }
                        className="h-4 w-4 accent-orange-500"
                      />
                      Selecionar técnico
                    </label>

                    {tecnicoAbertoId === os.id && (
                      <div className="space-y-2 rounded-lg border border-slate-300 bg-[#eef3f1] p-2">
                        {(os.tecnico_sugeridos ?? []).map((tecnico, index) => (
                          <button
                            key={tecnico.id}
                            type="button"
                            disabled={atribuindoId === os.id}
                            onClick={() => onAtribuirTecnico(os.id, tecnico.id)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left transition hover:border-orange-400 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <TecnicoSugestao tecnico={tecnico} index={index} />
                          </button>
                        ))}

                        {!os.tecnico_sugeridos?.length && (
                          <span className="text-xs text-slate-500">Nenhum técnico ativo.</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onAbrirDetalhes(os.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                    >
                      <OpenIcon />
                      Detalhes
                    </button>

                    {os.tecnico_whatsapp ? (
                      <a
                        href={criarLinkWhatsAppTecnico(os)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-700"
                      >
                        WhatsApp
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-400"
                      >
                        WhatsApp
                      </button>
                    )}
                  </div>
                </article>
              ))}

              {!coluna.ordens.length && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-8 text-center text-sm text-slate-500">
                  Nenhuma OS neste status.
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
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
  disabled = false,
}: {
  label: string
  name: string
  value: string
  onChange: ChangeEventHandler<HTMLSelectElement>
  options: Array<{ value: string; label: string }>
  placeholder: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function OrigemBadge({ origem, compact = false }: { origem?: string | null; compact?: boolean }) {
  const origemNormalizada = normalizarOrigemOs(origem)
  const cls =
    origemNormalizada === 'PORTAL_CLIENTE'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : origemNormalizada === 'GARANTIA_SEGURADORA'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : origemNormalizada === 'AVULSO_ADMIN'
          ? 'border-violet-200 bg-violet-50 text-violet-700'
          : 'border-slate-200 bg-slate-50 text-slate-700'

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border font-bold ${cls} ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      }`}
    >
      <span className="truncate">{formatarOrigemOs(origemNormalizada)}</span>
    </span>
  )
}

function normalizarOrigemOs(origem?: string | null) {
  const valor = String(origem ?? '').trim().toUpperCase()
  if (valor === 'PORTAL_CLIENTE') return valor
  if (valor === 'GARANTIA_SEGURADORA') return valor
  if (valor === 'AVULSO_ADMIN') return valor
  return 'ABERTURA_INTERNA'
}

function formatarOrigemOs(origem?: string | null) {
  const valor = normalizarOrigemOs(origem)
  if (valor === 'PORTAL_CLIENTE') return 'Portal Cliente'
  if (valor === 'GARANTIA_SEGURADORA') return 'Garantia/Seguradora'
  if (valor === 'AVULSO_ADMIN') return 'Avulso/Admin'
  return 'Abertura Interna'
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'NOVA'
      ? 'animate-pulse bg-emerald-500 text-white shadow-sm shadow-emerald-300'
      : status === 'FINALIZADA'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'EM_ATENDIMENTO'
        ? 'bg-blue-100 text-blue-700'
        : status === 'EM_TRIAGEM'
          ? 'bg-amber-100 text-amber-700'
          : status === 'AGUARDANDO_APROVACAO'
            ? 'bg-cyan-100 text-cyan-700'
            : status === 'AGUARDANDO_PECA'
              ? 'bg-violet-100 text-violet-700'
              : status === 'CRITICA'
                ? 'bg-red-100 text-red-700'
                : 'bg-slate-100 text-slate-700'

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{status}</span>
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

function formatarEnderecoCliente(cliente: OrdemServicoTriagemApi['clientes']) {
  if (!cliente) return null

  const linha1 = [cliente.logradouro, cliente.numero].filter(Boolean).join(', ')
  const linha2 = [cliente.bairro, cliente.cidade, cliente.estado].filter(Boolean).join(' / ')
  const endereco = [linha1, linha2, cliente.cep].filter(Boolean).join(' - ')

  return endereco || null
}

function getNomeTecnico(tecnico: OrdemServicoTriagemApi['parceiros']) {
  if (!tecnico) return null
  return tecnico.responsavel ?? tecnico.nome_fantasia ?? tecnico.razao_social ?? null
}

function formatarEquipamentoResumo(os: OrdemServico) {
  const tipo = os.categoria_nome || 'Equipamento'
  const modelo = os.modelo?.trim()

  if (!modelo) return tipo
  return `${tipo} - ${modelo}`
}

function getDiasSemTecnico(os: OrdemServico) {
  if (os.status === 'FINALIZADA' || os.tecnico_nome) return 0

  const criadaEm = new Date(os.created_at).getTime()
  if (Number.isNaN(criadaEm)) return 0

  const dias = Math.floor((Date.now() - criadaEm) / (1000 * 60 * 60 * 24))
  return Math.max(0, dias)
}

function tecnicoAceitou(os: OrdemServico) {
  return os.tecnico_resposta?.acao === 'ACEITE_TECNICO'
}

function formatarDistanciaTecnico(tecnico: TecnicoSugerido) {
  if (tecnico.distancia_km === null) return null

  return `${tecnico.distancia_km.toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })} km`
}

function formatarLocalidadeTecnico(tecnico: TecnicoSugerido) {
  const local = [tecnico.cidade, tecnico.estado].filter(Boolean).join(' / ')
  return local || tecnico.criterio || ''
}

function criarLinkWhatsAppTecnico(os: OrdemServico) {
  const telefone = String(os.tecnico_whatsapp ?? '').replace(/\D/g, '')
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const linkChamado =
    os.numero_os && os.parceiro_id
      ? `${baseUrl}/tecnico/chamado?os=${encodeURIComponent(os.numero_os)}&tecnico=${os.parceiro_id}`
      : ''
  const mensagem = [
    `Olá, ${os.tecnico_nome ?? 'técnico'}.`,
    `Você recebeu um chamado para análise: ${os.numero_os ?? `OS #${os.id}`}.`,
    `Cliente: ${os.cliente_nome ?? '-'}`,
    `Endereço: ${os.cliente_endereco ?? '-'}`,
    `Equipamento: ${[os.categoria_nome, os.marca_nome, os.modelo].filter(Boolean).join(' / ') || '-'}`,
    `Defeito informado: ${os.defeito ?? '-'}`,
    '',
    'Link para aceitar ou recusar:',
    linkChamado,
    '',
    'Painel do tecnico:',
    `${baseUrl}/tecnico/painel`,
    'Acesse seu painel técnico para aceitar ou recusar o atendimento.',
  ].join('\n')

  return `https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}`
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="mb-4 text-lg font-semibold text-slate-800">
      {title}
    </h3>
  )
}
function formatarErro(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message

  if (typeof err === 'string') return err

  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>

    const possiveis = [
      obj.message,
      obj.details,
      obj.hint,
      obj.code,
      obj.error,
      obj.statusText,
    ]
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

function HomeIcon() {
  return (
    <SvgIcon>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M9 20v-6h6v6" />
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

function OpenIcon() {
  return (
    <SvgIcon>
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M21 14v7h-7" />
      <path d="M3 10v11h11" />
    </SvgIcon>
  )
}
