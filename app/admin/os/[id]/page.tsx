'use client'
function formatDate(data?: string | null) {
  if (!data) return '-'

  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { adminFetch } from '@/lib/admin-fetch'
import { getAdminActorLabel } from '@/lib/admin-actor'

type Cliente = {
  id: number
  nome: string | null
  cpf_cnpj: string | null
  whatsapp: string | null
  email: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

type Categoria = {
  id: number
  nome: string | null
}

type Marca = {
  id: number
  nome: string | null
  categoria_id?: number | null
}

type Garantidor = {
  id: number
  nome: string | null
  ativo?: boolean | null
}

type OSFoto = {
  id: number
  nome_arquivo: string | null
  url: string | null
  criado_em: string | null
}

type HistoricoItem = {
  id: number
  os_id: number | null
  acao: string | null
  status_anterior: string | null
  status_novo: string | null
  prioridade_anterior: string | null
  prioridade_nova: string | null
  descricao: string | null
  responsavel: string | null
  criado_em: string | null
}

type PecaItemDb = {
  id: number
  origem?: string | null
  peca_id?: number | string | null
  descricao: string | null
  quantidade: number | string | null
  valor_custo?: number | string | null
  valor_unitario: number | string | null
  total_item: number | string | null
  criado_em: string | null
}

type PecaEstoque = {
  id: number
  codigo: string | null
  descricao: string
  categoria: string | null
  marca: string | null
  valor_venda: number | string | null
  valor_custo?: number | string | null
  estoque: number | string | null
  ativo: boolean | null
}

type OrdemServico = {
  id: number
  numero_os: string | null
  created_at: string
  status: string | null
  prioridade: string | null
  garantia: boolean | null
  referencia_garantidor?: string | null
  bloqueada: boolean | null
  finalizada_em: string | null
  modelo: string | null
  numero_serie: string | null
  defeito: string | null
  diagnostico_tecnico: string | null
  servico_executado: string | null
  pecas_utilizadas: string | null
  valor_pecas: number | null
  valor_mao_obra: number | null
  desconto: number | null
  total: number | null
  tecnico_valor_pecas?: number | null
  tecnico_valor_mao_obra?: number | null
  tecnico_desconto?: number | null
  tecnico_total?: number | null
  cliente_valor_pecas?: number | null
  cliente_valor_mao_obra?: number | null
  cliente_desconto?: number | null
  cliente_total?: number | null
  status_financeiro?: string | null
  data_pagamento?: string | null
  data_ultimo_recebimento?: string | null
  forma_recebimento?: string | null
  valor_recebido_cliente?: number | string | null
  observacao_tecnica: string | null
  cliente_id: number | null
  categoria_id: number | null
  marca_id: number | null
  parceiro_id?: number | null
  garantidor_id?: number | null
  tecnico_avulso_nome?: string | null
  tecnico_avulso_whatsapp?: string | null
  tecnico_avulso_cidade?: string | null
  tecnico_avulso_estado?: string | null
  tecnico_avulso_observacao?: string | null
  cliente?: Cliente | null
  categoria?: Categoria | null
  marca?: Marca | null
}

type TecnicoSugerido = {
  id: number
  nome: string
  whatsapp: string | null
  cidade: string | null
  estado: string | null
  distancia_km: number | null
  criterio: string
  grupo_equipamento?: string
  atende_especialidade?: boolean
  cadastrado_em?: string | null
}

type TecnicoAvulsoForm = {
  nome: string
  whatsapp: string
  cidade: string
  estado: string
  observacao: string
}

type FormState = {
  status: string
  prioridade: string
  garantia: string
  garantidorId: string
  referenciaGarantidor: string
  categoriaId: string
  marcaId: string
  modelo: string
  numeroSerie: string
  diagnosticoTecnico: string
  servicoExecutado: string
  tecnicoValorMaoObra: number
  valorPecasCliente: number
  valorMaoObra: number
  desconto: number
  observacaoTecnica: string
}

type PecaForm = {
  origem: 'ESTOQUE' | 'AVULSA' | 'SERVICO'
  pecaId: string
  descricao: string
  quantidade: string
  valorCusto: string
  valorUnitario: string
}

const STATUS_OPTIONS = [
  { value: 'NOVA', label: 'Nova' },
  { value: 'EM_TRIAGEM', label: 'Em Triagem' },
  { value: 'EM_ATENDIMENTO', label: 'Em Atendimento' },
  { value: 'PRONTO_AGUARDANDO_ENTREGA', label: 'Pronto aguardando entrega' },
  { value: 'AGUARDANDO_APROVACAO', label: 'Aguardando Aprovação' },
  { value: 'AGUARDANDO_PECA', label: 'Aguardando Peça' },
  { value: 'CRITICA', label: 'Crítica' },
  { value: 'FINALIZADA', label: 'Finalizada' },
]

const PRIORIDADE_OPTIONS = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'URGENTE', label: 'Urgente' },
]

const GARANTIA_OPTIONS = [
  { value: 'SIM', label: 'Sim' },
  { value: 'NAO', label: 'Não' },
]

const FORMAS_RECEBIMENTO = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CARTAO', label: 'Cartao' },
  { value: 'DEPOSITO', label: 'Deposito' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
]

const STATUS_ATALHOS = [
  { value: 'EM_ATENDIMENTO', label: 'Em atendimento', className: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' },
  { value: 'PRONTO_AGUARDANDO_ENTREGA', label: 'Pronto aguardando entrega', className: 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600' },
  { value: 'AGUARDANDO_APROVACAO', label: 'Aguardando aprovação', className: 'border-cyan-300 text-cyan-700 hover:bg-cyan-50' },
  { value: 'AGUARDANDO_PECA', label: 'Aguardando peça', className: 'border-violet-300 text-violet-700 hover:bg-violet-50' },
  { value: 'CRITICA', label: 'Crítica', className: 'border-red-500 bg-red-500 text-white hover:bg-red-600' },
  { value: 'FINALIZADA', label: 'Finalizar', className: 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600' },
] as const

export default function OrdemServicoAtendimentoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [os, setOs] = useState<OrdemServico | null>(null)
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [fotos, setFotos] = useState<OSFoto[]>([])
  const [pecas, setPecas] = useState<PecaItemDb[]>([])
  const [estoquePecas, setEstoquePecas] = useState<PecaEstoque[]>([])
  const [tecnicosSugeridos, setTecnicosSugeridos] = useState<TecnicoSugerido[]>([])
  const [tecnicosDisponiveis, setTecnicosDisponiveis] = useState<TecnicoSugerido[]>([])
  const [buscaTecnico, setBuscaTecnico] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [garantidores, setGarantidores] = useState<Garantidor[]>([])
  const [novasFotos, setNovasFotos] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [atribuindoTecnicoId, setAtribuindoTecnicoId] = useState<number | null>(null)
  const [salvandoAvulso, setSalvandoAvulso] = useState(false)
  const [avulsoAberto, setAvulsoAberto] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [senhaMaster, setSenhaMaster] = useState('')
  const [desbloqueando, setDesbloqueando] = useState(false)
  const [masterUnlocked, setMasterUnlocked] = useState(false)
  const [adiantamentoValor, setAdiantamentoValor] = useState('')
  const [adiantamentoForma, setAdiantamentoForma] = useState('PIX')

  const [form, setForm] = useState<FormState>({
    status: 'NOVA',
    prioridade: 'NORMAL',
    garantia: 'NAO',
    garantidorId: '',
    referenciaGarantidor: '',
    categoriaId: '',
    marcaId: '',
    modelo: '',
    numeroSerie: '',
    diagnosticoTecnico: '',
    servicoExecutado: '',
    tecnicoValorMaoObra: 0,
    valorPecasCliente: 0,
    valorMaoObra: 0,
    desconto: 0,
    observacaoTecnica: '',
  })

  const [novaPeca, setNovaPeca] = useState<PecaForm>({
    origem: 'AVULSA',
    pecaId: '',
    descricao: '',
    quantidade: '1',
    valorCusto: '0',
    valorUnitario: '0',
  })
  const [tecnicoAvulso, setTecnicoAvulso] = useState<TecnicoAvulsoForm>({
    nome: '',
    whatsapp: '',
    cidade: '',
    estado: '',
    observacao: '',
  })

  useEffect(() => {
    if (!id) return
    void carregarOS()
  }, [id])

  const total = useMemo(() => {
    const bruto = (form.valorPecasCliente || 0) + (form.valorMaoObra || 0) - (form.desconto || 0)
    return Math.max(0, bruto)
  }, [form.valorPecasCliente, form.valorMaoObra, form.desconto])
  const valorRecebido = useMemo(() => valorRecebidoCliente(os, total), [os, total])
  const saldoReceber = useMemo(() => Math.max(total - valorRecebido, 0), [total, valorRecebido])

  const custoTecnico = useMemo(() => {
    const valorPecas = toNumber(os?.tecnico_valor_pecas ?? os?.valor_pecas)
    const valorMaoObra = toNumber(form.tecnicoValorMaoObra)
    const desconto = toNumber(os?.tecnico_desconto ?? os?.desconto)

    return {
      valorPecas,
      valorMaoObra,
      desconto,
      total: Math.max(0, valorPecas + valorMaoObra - desconto),
    }
  }, [form.tecnicoValorMaoObra, os])

  const respostaTecnico = useMemo(
    () => historico.find((item) => item.acao === 'ACEITE_TECNICO' || item.acao === 'RECUSA_TECNICO') ?? null,
    [historico]
  )

  const marcasFiltradas = useMemo(() => {
    if (!form.categoriaId) return marcas
    return marcas.filter((marca) => String(marca.categoria_id) === form.categoriaId)
  }, [marcas, form.categoriaId])

  const tecnicosCadastradosFiltrados = useMemo(() => {
    const idsSugeridos = new Set(tecnicosSugeridos.map((tecnico) => tecnico.id))
    const busca = normalizarTexto(buscaTecnico)

    return tecnicosDisponiveis
      .filter((tecnico) => !idsSugeridos.has(tecnico.id))
      .filter((tecnico) => {
        if (!busca) return true
        return normalizarTexto(
          `${tecnico.nome} ${tecnico.cidade ?? ''} ${tecnico.estado ?? ''} ${tecnico.criterio ?? ''} ${tecnico.grupo_equipamento ?? ''}`
        ).includes(busca)
      })
      .slice(0, 12)
  }, [buscaTecnico, tecnicosDisponiveis, tecnicosSugeridos])

  const isLocked =
    os?.status === 'FINALIZADA' ? !masterUnlocked : os?.bloqueada === true

  async function carregarOS() {
    setLoading(true)
    setErro('')
    setMensagem('')
    setMasterUnlocked(false)
    setSenhaMaster('')

    try {
      const response = await adminFetch(`/api/admin/os/atendimento?osId=${id}`)
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Erro ao carregar OS.')
      }

      if (!payload?.os) {
        setErro('OS nÃ£o encontrada.')
        setOs(null)
        return
      }

      const osPayloadRelacoes = payload.os as OrdemServico

      setOs(osPayloadRelacoes)
      setFotos((payload.fotos ?? []) as OSFoto[])
      setHistorico((payload.historico ?? []) as HistoricoItem[])
      setPecas((payload.pecas ?? []) as PecaItemDb[])
      setEstoquePecas((payload.estoquePecas ?? []) as PecaEstoque[])
      setTecnicosSugeridos((payload.tecnicosSugeridos ?? []) as TecnicoSugerido[])
      setTecnicosDisponiveis((payload.tecnicosDisponiveis ?? payload.tecnicosSugeridos ?? []) as TecnicoSugerido[])
      setCategorias((payload.categorias ?? []) as Categoria[])
      setMarcas((payload.marcas ?? []) as Marca[])
      setGarantidores((payload.garantidores ?? []) as Garantidor[])
      setTecnicoAvulso({
        nome: osPayloadRelacoes.tecnico_avulso_nome ?? '',
        whatsapp: osPayloadRelacoes.tecnico_avulso_whatsapp ?? '',
        cidade: osPayloadRelacoes.tecnico_avulso_cidade ?? '',
        estado: osPayloadRelacoes.tecnico_avulso_estado ?? '',
        observacao: osPayloadRelacoes.tecnico_avulso_observacao ?? '',
      })
      setAvulsoAberto(Boolean(osPayloadRelacoes.tecnico_avulso_nome))
      const temOrcamentoCliente =
        toNumber(osPayloadRelacoes.cliente_valor_pecas) > 0 ||
        toNumber(osPayloadRelacoes.cliente_valor_mao_obra) > 0 ||
        toNumber(osPayloadRelacoes.cliente_desconto) > 0 ||
        toNumber(osPayloadRelacoes.cliente_total) > 0
      setForm({
        status: osPayloadRelacoes.status ?? 'NOVA',
        prioridade: osPayloadRelacoes.prioridade ?? 'NORMAL',
        garantia: osPayloadRelacoes.garantia ? 'SIM' : 'NAO',
        garantidorId: osPayloadRelacoes.garantidor_id ? String(osPayloadRelacoes.garantidor_id) : '',
        referenciaGarantidor: osPayloadRelacoes.referencia_garantidor ?? '',
        categoriaId: osPayloadRelacoes.categoria_id ? String(osPayloadRelacoes.categoria_id) : '',
        marcaId: osPayloadRelacoes.marca_id ? String(osPayloadRelacoes.marca_id) : '',
        modelo: osPayloadRelacoes.modelo ?? '',
        numeroSerie: osPayloadRelacoes.numero_serie ?? '',
        diagnosticoTecnico: osPayloadRelacoes.diagnostico_tecnico ?? '',
        servicoExecutado: osPayloadRelacoes.servico_executado ?? '',
        tecnicoValorMaoObra: toNumber(osPayloadRelacoes.tecnico_valor_mao_obra ?? osPayloadRelacoes.valor_mao_obra),
        valorPecasCliente: temOrcamentoCliente
          ? toNumber(osPayloadRelacoes.cliente_valor_pecas)
          : toNumber(osPayloadRelacoes.valor_pecas) || toNumber(osPayloadRelacoes.tecnico_valor_pecas),
        valorMaoObra: temOrcamentoCliente
          ? toNumber(osPayloadRelacoes.cliente_valor_mao_obra)
          : toNumber(osPayloadRelacoes.valor_mao_obra) || toNumber(osPayloadRelacoes.tecnico_valor_mao_obra),
        desconto: temOrcamentoCliente
          ? toNumber(osPayloadRelacoes.cliente_desconto)
          : toNumber(osPayloadRelacoes.desconto) || toNumber(osPayloadRelacoes.tecnico_desconto),
        observacaoTecnica: osPayloadRelacoes.observacao_tecnica ?? '',
      })
      return

      const { data, error } = await supabase
        .from('ordens_servico')
        .select(`
          id,
          numero_os,
          created_at,
          status,
          prioridade,
          garantia,
          referencia_garantidor,
          bloqueada,
          finalizada_em,
          modelo,
          numero_serie,
          defeito,
          diagnostico_tecnico,
          servico_executado,
          pecas_utilizadas,
          valor_pecas,
          valor_mao_obra,
          desconto,
          total,
          observacao_tecnica,
          cliente_id,
          garantidor_id,
          categoria_id,
          marca_id
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        setErro('OS não encontrada.')
        setOs(null)
        return
      }

      const osData = data as NonNullable<typeof data>
      let cliente: Cliente | null = null
      let categoria: Categoria | null = null
      let marca: Marca | null = null
      const clienteId = osData.cliente_id
      const categoriaId = osData.categoria_id
      const marcaId = osData.marca_id

      if (clienteId) {
        const { data: clienteData, error: clienteError } = await supabase
          .from('clientes')
          .select('id, nome, cpf_cnpj, whatsapp, email, cep, logradouro, numero, bairro, cidade, estado')
          .eq('id', clienteId)
          .maybeSingle()

        if (clienteError) throw clienteError
        cliente = clienteData ?? null
      }

      if (categoriaId) {
        const { data: categoriaData, error: categoriaError } = await supabase
          .from('categorias')
          .select('id, nome')
          .eq('id', categoriaId)
          .maybeSingle()

        if (categoriaError) throw categoriaError
        categoria = categoriaData ?? null
      }

      if (marcaId) {
        const { data: marcaData, error: marcaError } = await supabase
          .from('marcas')
          .select('id, nome')
          .eq('id', marcaId)
          .maybeSingle()

        if (marcaError) throw marcaError
        marca = marcaData ?? null
      }

      const { data: fotosData, error: fotosError } = await supabase
        .from('os_fotos')
        .select('id, nome_arquivo, url, criado_em')
        .eq('os_id', osData.id)
        .order('criado_em', { ascending: false })

      if (fotosError) throw fotosError

      const { data: historicoData, error: historicoError } = await supabase
        .from('os_historico')
        .select(`
          id,
          os_id,
          acao,
          status_anterior,
          status_novo,
          prioridade_anterior,
          prioridade_nova,
          descricao,
          responsavel,
          criado_em
        `)
        .eq('os_id', osData.id)
        .order('criado_em', { ascending: false })

      if (historicoError) throw historicoError

      const { data: pecasData, error: pecasError } = await supabase
        .from('os_pecas')
        .select('id, descricao, quantidade, valor_unitario, total_item, criado_em')
        .eq('os_id', osData.id)
        .order('criado_em', { ascending: true })

      if (pecasError) throw pecasError

      const { data: categoriasData, error: categoriasError } = await supabase
        .from('categorias')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (categoriasError) throw categoriasError

      const { data: marcasData, error: marcasError } = await supabase
        .from('marcas')
        .select('id, nome, categoria_id')
        .order('nome', { ascending: true })

      if (marcasError) throw marcasError

      const osComRelacoes: OrdemServico = {
        ...osData,
        cliente,
        categoria,
        marca,
      }

      setOs(osComRelacoes)
      setFotos((fotosData ?? []) as OSFoto[])
      setHistorico((historicoData ?? []) as HistoricoItem[])
      setPecas((pecasData ?? []) as PecaItemDb[])
      setCategorias((categoriasData ?? []) as Categoria[])
      setMarcas((marcasData ?? []) as Marca[])
      setForm({
        status: osData.status ?? 'NOVA',
        prioridade: osData.prioridade ?? 'NORMAL',
        garantia: osData.garantia ? 'SIM' : 'NAO',
        garantidorId: osData.garantidor_id ? String(osData.garantidor_id) : '',
        referenciaGarantidor: osData.referencia_garantidor ?? '',
        categoriaId: osData.categoria_id ? String(osData.categoria_id) : '',
        marcaId: osData.marca_id ? String(osData.marca_id) : '',
        modelo: osData.modelo ?? '',
        numeroSerie: osData.numero_serie ?? '',
        diagnosticoTecnico: osData.diagnostico_tecnico ?? '',
        servicoExecutado: osData.servico_executado ?? '',
        tecnicoValorMaoObra: toNumber(osData.valor_mao_obra),
        valorPecasCliente: toNumber(osData.valor_pecas),
        valorMaoObra: toNumber(osData.valor_mao_obra),
        desconto: toNumber(osData.desconto),
        observacaoTecnica: osData.observacao_tecnica ?? '',
      })
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao carregar OS.'))
    } finally {
      setLoading(false)
    }
  }

  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    if (isLocked) return

    const { name, value } = e.target

    if (name === 'categoriaId') {
      setForm((prev) => ({
        ...prev,
        categoriaId: value,
        marcaId: '',
      }))
      return
    }

    if (name === 'valorPecasCliente' || name === 'valorMaoObra' || name === 'desconto' || name === 'tecnicoValorMaoObra') {
      setForm((prev) => ({ ...prev, [name]: value === '' ? 0 : Number(value) }))
      return
    }

    if (name === 'garantia' && value === 'NAO') {
      setForm((prev) => ({ ...prev, garantia: value, garantidorId: '', referenciaGarantidor: '' }))
      return
    }

    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function atribuirTecnico(parceiroId: number) {
    if (!os || isLocked) return

    setErro('')
    setMensagem('')
    setAtribuindoTecnicoId(parceiroId)

    try {
      const response = await adminFetch('/api/admin/os/triagem', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osId: os.id,
          parceiroId,
          status: form.status === 'NOVA' ? 'EM_TRIAGEM' : form.status,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao atribuir tecnico.')

      setMensagem('Tecnico atribuido com sucesso.')
      await carregarOS()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao atribuir tecnico.'))
    } finally {
      setAtribuindoTecnicoId(null)
    }
  }

  function handleTecnicoAvulsoChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target
    setTecnicoAvulso((prev) => ({
      ...prev,
      [name]: name === 'estado' ? value.toUpperCase().slice(0, 2) : value,
    }))
  }

  async function salvarTecnicoAvulso() {
    if (!os || isLocked) return

    setErro('')
    setMensagem('')
    setSalvandoAvulso(true)

    try {
      const response = await adminFetch('/api/admin/os/atendimento', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'TECNICO_AVULSO',
          osId: os.id,
          ...tecnicoAvulso,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Erro ao salvar tecnico avulso.')

      setMensagem('Tecnico avulso atribuido com sucesso.')
      await carregarOS()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao salvar tecnico avulso.'))
    } finally {
      setSalvandoAvulso(false)
    }
  }

  function handlePecaChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    if (isLocked) return

    const { name, value } = e.target
    if (name === 'origem') {
      setNovaPeca((prev) => ({
        ...prev,
        origem: value === 'ESTOQUE' ? 'ESTOQUE' : value === 'SERVICO' ? 'SERVICO' : 'AVULSA',
        pecaId: '',
        descricao: '',
        valorCusto: '0',
        valorUnitario: '0',
      }))
      return
    }

    if (name === 'pecaId') {
      const peca = estoquePecas.find((item) => String(item.id) === value)
      setNovaPeca((prev) => ({
        ...prev,
        pecaId: value,
        descricao: peca?.descricao ?? '',
        valorCusto: String(toNumber(peca?.valor_custo)),
        valorUnitario: String(toNumber(peca?.valor_venda)),
      }))
      return
    }

    setNovaPeca((prev) => ({ ...prev, [name]: value }))
  }

  function adicionarPeca() {
    if (isLocked) return

    const descricao = novaPeca.descricao.trim()
    const quantidade = Number(novaPeca.quantidade || 0)
    const valorCusto = Number(novaPeca.valorCusto || 0)
    const valorUnitario = Number(novaPeca.valorUnitario || 0)

    if (!descricao || quantidade <= 0 || valorCusto < 0 || valorUnitario < 0) {
      setErro('Preencha descrição, quantidade e valor unitário da peça.')
      return
    }

    const totalItem = quantidade * valorUnitario

    setPecas((prev) => [
      ...prev,
      {
        id: Date.now(),
        origem: novaPeca.origem,
        peca_id: novaPeca.origem === 'ESTOQUE' && novaPeca.pecaId ? Number(novaPeca.pecaId) : null,
        descricao,
        quantidade,
        valor_custo: valorCusto,
        valor_unitario: valorUnitario,
        total_item: totalItem,
        criado_em: new Date().toISOString(),
      },
    ])
    setForm((prev) => ({
      ...prev,
      valorPecasCliente: toMoneyNumber(toNumber(prev.valorPecasCliente) + totalItem),
    }))

    setNovaPeca({
      origem: 'AVULSA',
      pecaId: '',
      descricao: '',
      quantidade: '1',
      valorCusto: '0',
      valorUnitario: '0',
    })
    setErro('')
  }

  function removerPeca(index: number) {
    if (isLocked) return
    setPecas((prev) => {
      const itemRemovido = prev[index]
      const valorRemovido = toNumber(itemRemovido?.total_item)

      setForm((formAtual) => ({
        ...formAtual,
        valorPecasCliente: toMoneyNumber(Math.max(0, toNumber(formAtual.valorPecasCliente) - valorRemovido)),
      }))

      return prev.filter((_, i) => i !== index)
    })
  }

  function handleFotosChange(e: ChangeEvent<HTMLInputElement>) {
    if (isLocked) return

    const files = e.target.files
    if (!files) return
    setNovasFotos(Array.from(files))
  }

  async function salvarAtendimento(statusForcado?: string) {
    if (!os || isLocked) return

    if (form.garantia === 'SIM' && !form.garantidorId) {
      setErro('Selecione o garantidor responsável pelo pagamento da OS em garantia.')
      return
    }

    setSalvando(true)
    setErro('')
    setMensagem('')

    try {
      const statusFinal = statusForcado ?? form.status
      const response = await adminFetch('/api/admin/os/atendimento', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          osId: os.id,
          status: statusFinal,
          prioridade: form.prioridade,
          garantia: form.garantia,
          garantidorId: form.garantidorId,
          referenciaGarantidor: form.referenciaGarantidor,
          categoriaId: form.categoriaId,
          marcaId: form.marcaId,
          modelo: form.modelo,
          numeroSerie: form.numeroSerie,
          diagnosticoTecnico: form.diagnosticoTecnico,
          servicoExecutado: form.servicoExecutado,
          tecnicoValorPecas: custoTecnico.valorPecas,
          tecnicoValorMaoObra: form.tecnicoValorMaoObra,
          tecnicoDesconto: custoTecnico.desconto,
          observacaoTecnica: form.observacaoTecnica,
          valorPecas: form.valorPecasCliente,
          valorMaoObra: form.valorMaoObra,
          desconto: form.desconto,
          total,
          pecas,
          fotosCount: novasFotos.length,
        }),
      })

      const resultado = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(resultado?.error ?? 'Erro ao salvar atendimento tecnico.')
      }

      if (novasFotos.length > 0) {
        for (const arquivo of novasFotos) {
          const caminho = `${os.id}/atendimento/${Date.now()}-${arquivo.name}`

          const { error: uploadError } = await supabase.storage
            .from('os-fotos')
            .upload(caminho, arquivo)

          if (uploadError) throw uploadError

          const { data: urlData } = supabase.storage.from('os-fotos').getPublicUrl(caminho)

          const { error: fotoDbError } = await supabase.from('os_fotos').insert({
            os_id: os.id,
            nome_arquivo: arquivo.name,
            url: urlData.publicUrl,
          })

          if (fotoDbError) throw fotoDbError
        }
      }

      if (false) {
      const pecasResumo = ''
      const bloqueada = statusFinal === 'FINALIZADA'
      const statusAnterior = os?.status ?? 'NOVA'
      const prioridadeAnterior = os?.prioridade ?? 'NORMAL'

      const resumo = [
        `Status: ${statusAnterior} → ${statusFinal}`,
        `Prioridade: ${prioridadeAnterior} → ${form.prioridade}`,
        `Garantia: ${form.garantia}`,
        form.diagnosticoTecnico.trim() ? `Diagnóstico: ${form.diagnosticoTecnico.trim()}` : '',
        form.servicoExecutado.trim() ? `Serviço: ${form.servicoExecutado.trim()}` : '',
        pecasResumo ? `Peças: ${pecasResumo}` : '',
        `Peças total: ${formatCurrency(form.valorPecasCliente)}`,
        `Mão de obra: ${formatCurrency(form.valorMaoObra)}`,
        `Desconto: ${formatCurrency(form.desconto)}`,
        `Total: ${formatCurrency(total)}`,
        bloqueada ? 'OS finalizada e bloqueada.' : '',
        novasFotos.length > 0 ? `Fotos adicionadas: ${novasFotos.length}` : '',
      ]
        .filter(Boolean)
        .join(' | ')

      const responsavel = await getAdminActorLabel()
      const { error: historicoError } = await supabase.from('os_historico').insert({
        os_id: os?.id ?? id,
        acao: statusFinal === 'FINALIZADA' ? 'OS_FINALIZADA' : 'ATENDIMENTO_TECNICO',
        status_anterior: statusAnterior,
        status_novo: statusFinal,
        prioridade_anterior: prioridadeAnterior,
        prioridade_nova: form.prioridade,
        descricao: resumo,
        responsavel,
      })

      if (historicoError) throw historicoError
      }

      if (statusFinal === 'FINALIZADA') {
        setMasterUnlocked(false)
      }

      setMensagem('Atendimento técnico salvo com sucesso.')
      setNovasFotos([])
      await carregarOS()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao salvar atendimento técnico.'))
    } finally {
      setSalvando(false)
    }
  }

  async function registrarAdiantamento() {
    if (!os || isLocked) return

    if (total <= 0) {
      setErro('Informe o orçamento da OS antes de lançar um adiantamento.')
      return
    }

    const saldo = Math.max(total - valorRecebido, 0)
    if (saldo <= 0) {
      setErro('Esta OS nao possui saldo em aberto para adiantamento.')
      return
    }

    const forma = adiantamentoForma
    const valor = parseMoneyInput(adiantamentoValor)
    if (!Number.isFinite(valor) || valor <= 0 || valor > saldo) {
      setErro(`Informe um adiantamento maior que zero e ate ${formatCurrency(saldo)}.`)
      return
    }

    setSalvando(true)
    setErro('')
    setMensagem('')

    try {
      const salvarResponse = await adminFetch('/api/admin/os/atendimento', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osId: os.id,
          status: form.status,
          prioridade: form.prioridade,
          garantia: form.garantia,
          garantidorId: form.garantidorId,
          referenciaGarantidor: form.referenciaGarantidor,
          categoriaId: form.categoriaId,
          marcaId: form.marcaId,
          modelo: form.modelo,
          numeroSerie: form.numeroSerie,
          diagnosticoTecnico: form.diagnosticoTecnico,
          servicoExecutado: form.servicoExecutado,
          tecnicoValorPecas: custoTecnico.valorPecas,
          tecnicoValorMaoObra: form.tecnicoValorMaoObra,
          tecnicoDesconto: custoTecnico.desconto,
          observacaoTecnica: form.observacaoTecnica,
          valorPecas: form.valorPecasCliente,
          valorMaoObra: form.valorMaoObra,
          desconto: form.desconto,
          total,
          pecas,
          fotosCount: 0,
        }),
      })
      const salvarPayload = await salvarResponse.json().catch(() => null)
      if (!salvarResponse.ok) throw new Error(salvarPayload?.error ?? 'Erro ao salvar orçamento antes do adiantamento.')

      const financeiroResponse = await adminFetch('/api/admin/financeiro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'OS', id: os.id, status: 'PARCIAL', forma, valor }),
      })
      const financeiroPayload = await financeiroResponse.json().catch(() => null)
      if (!financeiroResponse.ok) throw new Error(financeiroPayload?.error ?? 'Erro ao registrar adiantamento.')

      setMensagem('Adiantamento registrado com sucesso.')
      setAdiantamentoValor('')
      await carregarOS()
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao registrar adiantamento.'))
    } finally {
      setSalvando(false)
    }
  }

  async function desbloquearComSenhaMaster() {
    if (!os) return

    setDesbloqueando(true)
    setErro('')
    setMensagem('')

    try {
      const response = await adminFetch('/api/admin/os/desbloquear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          osId: os.id,
          senha: senhaMaster,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error ?? 'Não foi possível desbloquear a OS.')
      }

      setMasterUnlocked(true)
      setSenhaMaster('')
      setMensagem('OS desbloqueada com sucesso para edição temporária.')
      await carregarOS()
      setMasterUnlocked(true)
    } catch (err) {
      setErro(formatarErro(err, 'Erro ao desbloquear a OS.'))
    } finally {
      setDesbloqueando(false)
    }
  }

  function imprimirOS() {
    if (!os) return

    const janela = window.open('', '_blank', 'width=900,height=700')
    if (!janela) return

    const logoUrl = `${window.location.origin}/logo-chame-o-tecnico.png`
    const valorPecasImpressao = toNumber(os.cliente_valor_pecas ?? os.valor_pecas)
    const valorMaoObraImpressao = toNumber(os.cliente_valor_mao_obra ?? os.valor_mao_obra)
    const descontoImpressao = toNumber(os.cliente_desconto ?? os.desconto)
    const totalImpressao = toNumber(os.cliente_total ?? os.total)
    const html = `
      <html>
        <head>
          <title>${os.numero_os ?? 'OS'}</title>
          <style>
            @page { size: A4; margin: 10mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; padding-bottom: 96px; color: #111827; font-size: 11px; line-height: 1.25; }
            h1, h2, p { margin: 0; }
            .print-header { display: grid; grid-template-columns: 160px 1fr 150px; align-items: center; gap: 16px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #d1d5db; }
            .logo { width: 150px; height: auto; display: block; }
            .header-title { text-align: center; }
            .header-title p { color: #0f172a; font-size: 15px; font-weight: 700; }
            .meta { text-align: right; color: #475569; font-size: 10px; }
            .meta strong { display: block; margin-top: 5px; color: #0f172a; font-size: 12px; }
            .box { border: 1px solid #d9e0e7; border-radius: 10px; padding: 11px 12px; margin-bottom: 9px; break-inside: avoid; }
            .box h2 { margin-bottom: 8px; font-size: 17px; line-height: 1.1; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; }
            .budget-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 14px; }
            .budget-total { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 10px; padding: 8px 11px; border: 1px solid #cbd5e1; border-left: 4px solid #64748b; border-radius: 6px; background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .budget-total-label { font-size: 11px; font-weight: 700; color: #334155; }
            .budget-total-value { font-size: 17px; line-height: 1; font-weight: 800; color: #0f172a; white-space: nowrap; }
            .wide { grid-column: 1 / -1; }
            .label { font-size: 9px; color: #475569; text-transform: uppercase; margin-bottom: 2px; }
            .value { font-size: 11px; font-weight: 700; white-space: pre-wrap; }
            .muted { color: #475569; font-weight: 600; }
            .service-box .value { min-height: 24px; }
            .service-box .value-tall { min-height: 42px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: 5px 6px; font-size: 10px; }
            th { background: #f9fafb; }
            .parts-title { margin: 10px 0 4px; font-size: 12px; font-weight: 700; }
            .print-footer { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; padding-top: 8px; border-top: 1px solid #d1d5db; }
            .contact-line { margin-bottom: 5px; text-align: center; font-size: 9px; font-weight: 700; color: #0f172a; }
            .terms { margin-bottom: 20px; font-size: 8px; line-height: 1.25; color: #475569; text-align: justify; }
            .signatures { display: grid; grid-template-columns: 0.8fr 1.25fr 1fr; gap: 18px; align-items: end; break-inside: avoid; }
            .signature-line { border-top: 1px solid #111827; padding-top: 5px; text-align: center; font-size: 10px; color: #334155; }
            .signature-tech { width: 78%; justify-self: start; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <img class="logo" src="${logoUrl}" alt="Chame o Técnico" />
            <div class="header-title">
              <p>Atendimento técnico, garantia e resumo do chamado</p>
            </div>
            <div class="meta">
              <span>${new Date().toLocaleString('pt-BR')}</span>
              <strong>${os.numero_os ?? 'OS'}</strong>
            </div>
          </div>

          <div class="box">
            <h2>Dados do cliente</h2>
            <div class="grid">
              <div><div class="label">Cliente</div><div class="value">${os.cliente?.nome ?? '-'}</div></div>
              <div><div class="label">WhatsApp</div><div class="value">${os.cliente?.whatsapp ?? '-'}</div></div>
              <div><div class="label">CPF/CNPJ</div><div class="value">${os.cliente?.cpf_cnpj ?? '-'}</div></div>
              <div><div class="label">Endereço</div><div class="value">${[
                os.cliente?.logradouro,
                os.cliente?.numero,
                os.cliente?.bairro,
                os.cliente?.cidade,
                os.cliente?.estado,
              ].filter(Boolean).join(', ') || '-'}</div></div>
            </div>
          </div>

          <div class="box">
            <h2>Equipamento</h2>
            <div class="grid">
              <div><div class="label">Categoria</div><div class="value">${os.categoria?.nome ?? '-'}</div></div>
              <div><div class="label">Marca</div><div class="value">${os.marca?.nome ?? '-'}</div></div>
              <div><div class="label">Modelo</div><div class="value">${os.modelo ?? '-'}</div></div>
              <div><div class="label">Número de série</div><div class="value">${os.numero_serie ?? '-'}</div></div>
            </div>
          </div>

          <div class="box service-box">
            <h2>Atendimento</h2>
            <div class="grid">
              <div><div class="label">Defeito informado</div><div class="value">${os.defeito ?? '-'}</div></div>
              ${os.garantia ? `<div><div class="label">OS/Sinistro garantidor</div><div class="value">${os.referencia_garantidor ?? '-'}</div></div>` : ''}
              <div><div class="label">Garantia</div><div class="value">${os.garantia ? 'SIM' : 'NÃO'}</div></div>
              <div><div class="label">Diagnóstico técnico</div><div class="value value-tall">${os.diagnostico_tecnico ?? '-'}</div></div>
              <div><div class="label">Serviço executado</div><div class="value value-tall">${os.servico_executado ?? '-'}</div></div>
              <div class="wide"><div class="label">Observação técnica</div><div class="value value-tall muted">${os.observacao_tecnica ?? '-'}</div></div>
            </div>
          </div>

          ${
            os.garantia
              ? `
          <div class="box">
            <h2>Registro de garantia</h2>
            <div class="grid">
              <div class="wide"><div class="label">OS/Sinistro do garantidor</div><div class="value">${os.referencia_garantidor ?? '-'}</div></div>
            </div>
            <div class="grid">
              <div class="wide"><div class="label">Serviço executado</div><div class="value">${os.servico_executado ?? '-'}</div></div>
            </div>
            ${
              pecas.length > 0
                ? `
              <div class="parts-title">Peças substituídas</div>
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Qtd.</th>
                  </tr>
                </thead>
                <tbody>
                  ${pecas
                    .map(
                      (p) => `
                      <tr>
                        <td>${p.descricao ?? '-'}</td>
                        <td>${toNumber(p.quantidade)}</td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            `
                : '<div class="parts-title">Peças substituídas</div><div class="value">-</div>'
            }
          </div>
          `
              : `
          <div class="box">
            <h2>Orçamento</h2>
            <div class="budget-summary">
              <div><div class="label">Peças</div><div class="value">${formatCurrency(valorPecasImpressao)}</div></div>
              <div><div class="label">Mão de obra</div><div class="value">${formatCurrency(valorMaoObraImpressao)}</div></div>
              <div><div class="label">Desconto</div><div class="value">${formatCurrency(descontoImpressao)}</div></div>
            </div>
            <div class="budget-total">
              <div class="budget-total-label">Total:</div>
              <div class="budget-total-value">${formatCurrency(totalImpressao)}</div>
            </div>

            ${
              pecas.length > 0
                ? `
              <div class="parts-title">Peças utilizadas</div>
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Qtd.</th>
                    <th>Valor unit.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${pecas
                    .map(
                      (p) => `
                      <tr>
                        <td>${p.descricao ?? '-'}</td>
                        <td>${toNumber(p.quantidade)}</td>
                        <td>${formatCurrency(toNumber(p.valor_unitario))}</td>
                        <td>${formatCurrency(toNumber(p.total_item))}</td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            `
                : ''
            }
          </div>
          `
          }

          <div class="print-footer">
            <div class="contact-line">www.chameotecnico.com.br | atendimento@chameotecnico.com.br</div>
            <div class="terms">
              Garantia de 90 dias sobre o serviço executado, limitada ao defeito informado e ao reparo descrito nesta OS, não cobrindo mau uso, queda, umidade, oscilação elétrica, violação por terceiros ou defeitos distintos. Declaro ter recebido o equipamento/atendimento acima descrito e estou ciente das condições de garantia, valores e peças informadas.
            </div>
            <div class="signatures">
              <div class="signature-line signature-tech">Assinatura do técnico</div>
              <div class="signature-line">Local e data</div>
              <div class="signature-line">Assinatura do cliente</div>
            </div>
          </div>

          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `

    janela.document.open()
    janela.document.write(html)
    janela.document.close()
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-slate-500">Carregando OS...</p>
        </div>
      </main>
    )
  }

  if (erro && !os) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">
            {erro}
          </div>

          <button
            onClick={() => router.back()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Voltar
          </button>
        </div>
      </main>
    )
  }

  if (!os) return null

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 p-3 md:p-4">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Atendimento Técnico da OS</h1>
            <p className="text-slate-500">
              {os.numero_os ?? 'OS'} • Visualização completa do chamado
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => router.push('/admin/os/finalizadas')}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              Finalizadas
            </button>

            <button
              onClick={() => router.back()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              Voltar
            </button>

            <button
              onClick={imprimirOS}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              Imprimir OS
            </button>

            <button
              onClick={() => salvarAtendimento('EM_ATENDIMENTO')}
              disabled={salvando || isLocked}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {salvando ? 'Salvando...' : 'Salvar e assumir'}
            </button>

            <button
              onClick={() => salvarAtendimento('FINALIZADA')}
              disabled={salvando || isLocked}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {salvando ? 'Salvando...' : 'Salvar e finalizar'}
            </button>
          </div>
        </header>

        {os.status === 'FINALIZADA' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Esta OS está finalizada. Para editar, use a senha master.
            {os.finalizada_em ? ` Finalizada em ${formatDate(os.finalizada_em)}.` : ''}
          </div>
        )}

        {respostaTecnico && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            respostaTecnico.acao === 'ACEITE_TECNICO'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-red-300 bg-red-50 text-red-800'
          }`}>
            <div className="font-bold">{formatarAcaoHistorico(respostaTecnico.acao)}</div>
            <div className="mt-1">
              {respostaTecnico.descricao ?? 'Resposta registrada pelo técnico.'}
              {respostaTecnico.criado_em ? ` Em ${formatDate(respostaTecnico.criado_em)}.` : ''}
            </div>
          </div>
        )}

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

        {isLocked && (
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Desbloqueio com senha master</h2>
                <p className="text-sm text-slate-500">
                  A OS finalizada fica bloqueada até usar a senha master.
                </p>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <input
                  type="password"
                  value={senhaMaster}
                  onChange={(e) => setSenhaMaster(e.target.value)}
                  placeholder="Senha master"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-orange-500 md:w-72"
                />

                <button
                  onClick={desbloquearComSenhaMaster}
                  disabled={desbloqueando}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {desbloqueando ? 'Desbloqueando...' : 'Desbloquear'}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Status" value={form.status} />
          <InfoCard label="Prioridade" value={form.prioridade} />
          <InfoCard label="Garantia" value={form.garantia} />
          <InfoCard label="Modelo" value={os.modelo ?? '-'} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.55fr_0.95fr]">
          <div className="space-y-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Atendimento Técnico</h2>
                  <p className="text-sm text-slate-500">
                    Preencha o diagnóstico, serviço, peças e orçamento
                  </p>
                </div>

                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  disabled={isLocked}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {STATUS_ATALHOS.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    onClick={() => salvarAtendimento(status.value)}
                    disabled={salvando || isLocked}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${status.className}`}
                  >
                    {status.label}
                  </button>
                ))}
              </div>

              <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3 shadow-sm ring-1 ring-orange-100">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-orange-700">Selecionar técnico</p>
                    <p className="text-xs text-slate-500">Sugestões por proximidade do endereço do cliente</p>
                  </div>
                  {os.parceiro_id && (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      Técnico atribuído
                    </span>
                  )}
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {tecnicosSugeridos.map((tecnico, index) => {
                    const atual = os.parceiro_id === tecnico.id

                    return (
                      <button
                        key={tecnico.id}
                        type="button"
                        onClick={() => atribuirTecnico(tecnico.id)}
                        disabled={isLocked || atribuindoTecnicoId !== null || atual}
                        className={`min-h-[64px] rounded-lg border bg-white px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                          atual ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-300 hover:border-orange-400 hover:bg-orange-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-bold text-slate-900">
                              {index + 1}. {tecnico.nome}
                            </p>
                            <p className="truncate text-[10px] leading-3 text-slate-500">
                              {[tecnico.cidade, tecnico.estado].filter(Boolean).join(' / ') || tecnico.criterio}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            tecnico.distancia_km !== null ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {formatarDistanciaTecnico(tecnico)}
                          </span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-semibold text-slate-500">
                            {atual ? 'Selecionado' : atribuindoTecnicoId === tecnico.id ? 'Atribuindo' : 'Atribuir'}
                          </span>
                          {tecnico.grupo_equipamento && (
                            <span className={`min-w-0 max-w-[86px] truncate rounded px-1.5 py-0.5 text-[8px] font-semibold ${
                              tecnico.atende_especialidade === false
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {tecnico.atende_especialidade === false
                                ? 'Fora da linha'
                                : formatarGrupoEquipamento(tecnico.grupo_equipamento)}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}

                  {!tecnicosSugeridos.length && (
                    <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-500 xl:col-span-4">
                      Nenhum técnico ativo encontrado.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setAvulsoAberto((atual) => !atual)}
                    disabled={isLocked}
                    className={`min-h-[64px] rounded-lg border border-dashed bg-white px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                      avulsoAberto || os.tecnico_avulso_nome
                        ? 'border-blue-400 ring-1 ring-blue-100'
                        : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold text-slate-900">
                          Técnico avulso
                        </p>
                        <p className="truncate text-[10px] leading-3 text-slate-500">
                          {os.tecnico_avulso_nome
                            ? `${os.tecnico_avulso_nome} ${os.tecnico_avulso_cidade ? `- ${os.tecnico_avulso_cidade}` : ''}`
                            : 'Atendimento pontual nesta OS'}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                        Avulso
                      </span>
                    </div>
                    <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-semibold text-slate-500">
                      {avulsoAberto ? 'Fechar' : 'Preencher'}
                    </span>
                  </button>

                  <div className="rounded-lg border border-orange-200 bg-white p-2 xl:col-span-4">
                    <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                          Outro tecnico cadastrado
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Use quando o profissional nao aparecer nas sugestoes acima.
                        </p>
                      </div>
                      <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-700">
                        {tecnicosCadastradosFiltrados.length} opcoes
                      </span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[0.8fr_1.2fr]">
                      <input
                        value={buscaTecnico}
                        onChange={(event) => setBuscaTecnico(event.target.value)}
                        disabled={isLocked}
                        placeholder="Buscar por nome, cidade ou linha"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-orange-500 disabled:bg-slate-100"
                      />
                      <select
                        value=""
                        onChange={(event) => {
                          const parceiroId = Number(event.target.value)
                          if (parceiroId) void atribuirTecnico(parceiroId)
                        }}
                        disabled={isLocked || atribuindoTecnicoId !== null || !tecnicosCadastradosFiltrados.length}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        <option value="">
                          {tecnicosCadastradosFiltrados.length
                            ? 'Selecionar outro tecnico cadastrado'
                            : 'Nenhum outro tecnico encontrado'}
                        </option>
                        {tecnicosCadastradosFiltrados.map((tecnico) => (
                          <option key={tecnico.id} value={tecnico.id}>
                            {tecnico.nome} - {[tecnico.cidade, tecnico.estado].filter(Boolean).join(' / ') || 'sem cidade'} - {formatarDistanciaTecnico(tecnico)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {avulsoAberto && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Técnico avulso nesta OS</p>
                      <p className="text-xs text-slate-500">Preencha somente se for usar um profissional fora do cadastro oficial.</p>
                    </div>
                    {os.tecnico_avulso_nome && (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                        Avulso atribuído
                      </span>
                    )}
                  </div>

                  <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_0.9fr_80px]">
                    <input
                      name="nome"
                      value={tecnicoAvulso.nome}
                      onChange={handleTecnicoAvulsoChange}
                      disabled={isLocked}
                      placeholder="Nome do técnico"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:bg-slate-100"
                    />
                    <input
                      name="whatsapp"
                      value={tecnicoAvulso.whatsapp}
                      onChange={handleTecnicoAvulsoChange}
                      disabled={isLocked}
                      placeholder="WhatsApp"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:bg-slate-100"
                    />
                    <input
                      name="cidade"
                      value={tecnicoAvulso.cidade}
                      onChange={handleTecnicoAvulsoChange}
                      disabled={isLocked}
                      placeholder="Cidade"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:bg-slate-100"
                    />
                    <input
                      name="estado"
                      value={tecnicoAvulso.estado}
                      onChange={handleTecnicoAvulsoChange}
                      disabled={isLocked}
                      placeholder="UF"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-orange-500 disabled:bg-slate-100"
                    />
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                    <input
                      name="observacao"
                      value={tecnicoAvulso.observacao}
                      onChange={handleTecnicoAvulsoChange}
                      disabled={isLocked}
                      placeholder="Observação interna"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:bg-slate-100"
                    />
                    <button
                      type="button"
                      onClick={salvarTecnicoAvulso}
                      disabled={isLocked || salvandoAvulso}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {salvandoAvulso ? 'Salvando...' : 'Salvar avulso'}
                    </button>
                  </div>
                </div>
                )}
              </div>

              <div className="mb-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Categoria</label>
                  <select
                    name="categoriaId"
                    value={form.categoriaId}
                    onChange={handleChange}
                    disabled={isLocked}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">Selecione</option>
                    {categorias.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.nome ?? 'Categoria'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Marca</label>
                  <select
                    name="marcaId"
                    value={form.marcaId}
                    onChange={handleChange}
                    disabled={isLocked || !form.categoriaId}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">
                      {!form.categoriaId ? 'Selecione a categoria' : 'Selecione'}
                    </option>
                    {marcasFiltradas.map((marca) => (
                      <option key={marca.id} value={marca.id}>
                        {marca.nome ?? 'Marca'}
                      </option>
                    ))}
                  </select>
                </div>

                <Field
                  label="Modelo"
                  name="modelo"
                  value={form.modelo}
                  onChange={handleChange}
                  placeholder="Modelo do aparelho"
                  disabled={isLocked}
                />

                <Field
                  label="Numero de serie"
                  name="numeroSerie"
                  value={form.numeroSerie}
                  onChange={handleChange}
                  placeholder="Numero de serie do aparelho"
                  disabled={isLocked}
                />
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <Field
                  label="Diagnóstico técnico"
                  name="diagnosticoTecnico"
                  value={form.diagnosticoTecnico}
                  onChange={handleChange}
                  textarea
                  rows={3}
                  placeholder="Descreva o diagnóstico encontrado após a análise..."
                  disabled={isLocked}
                />

                <Field
                  label="Serviço executado"
                  name="servicoExecutado"
                  value={form.servicoExecutado}
                  onChange={handleChange}
                  textarea
                  rows={3}
                  placeholder="Descreva o serviço executado ou planejado..."
                  disabled={isLocked}
                />
              </div>

              <div className="mt-3 grid gap-3">
                <Field
                  label="Observação técnica"
                  name="observacaoTecnica"
                  value={form.observacaoTecnica}
                  onChange={handleChange}
                  textarea
                  rows={3}
                  placeholder="Observações internas da manutenção..."
                  disabled={isLocked}
                />

                <div className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">
                    Peças e serviços adicionais
                  </h3>

                  <div className="grid gap-3 lg:grid-cols-[135px_minmax(230px,1fr)_95px_120px_120px_auto] lg:items-end">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Origem</label>
                      <select
                        name="origem"
                        value={novaPeca.origem}
                        onChange={handlePecaChange}
                        disabled={isLocked}
                        className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        <option value="AVULSA">Avulsa</option>
                        <option value="ESTOQUE">Estoque</option>
                        <option value="SERVICO">Serviço adicional</option>
                      </select>
                    </div>

                    {novaPeca.origem === 'ESTOQUE' ? (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Peca do estoque</label>
                        <select
                          name="pecaId"
                          value={novaPeca.pecaId}
                          onChange={handlePecaChange}
                          disabled={isLocked}
                          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          <option value="">Selecione uma peca</option>
                          {estoquePecas.map((peca) => (
                            <option key={peca.id} value={peca.id}>
                              {peca.descricao} - Est. {toNumber(peca.estoque)} - {formatCurrency(toNumber(peca.valor_venda))}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <Field
                        label="Descrição"
                        name="descricao"
                        value={novaPeca.descricao}
                        onChange={handlePecaChange}
                        placeholder="Ex.: Placa eletrônica"
                        disabled={isLocked}
                      />
                    )}
                    <Field
                      label="Quantidade"
                      name="quantidade"
                      value={novaPeca.quantidade}
                      onChange={handlePecaChange}
                      type="number"
                      min="1"
                      disabled={isLocked}
                    />
                    <Field
                      label="Valor unitário"
                      name="valorCusto"
                      value={novaPeca.valorCusto}
                      onChange={handlePecaChange}
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={isLocked}
                    />
                    <Field
                      label="Valor unitario"
                      name="valorUnitario"
                      value={novaPeca.valorUnitario}
                      onChange={handlePecaChange}
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={isLocked}
                    />
                    <button
                      type="button"
                      onClick={adicionarPeca}
                      disabled={isLocked}
                      className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Adicionar
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={adicionarPeca}
                    disabled={isLocked}
                    className="hidden"
                  >
                    Adicionar peça
                  </button>

                  <div className="mt-3 space-y-2">
                    {pecas.length > 0 ? (
                      pecas.map((p, index) => (
                        <div
                          key={`${p.id}-${index}`}
                          className="grid gap-2 rounded-lg bg-slate-50 px-3 py-2 md:grid-cols-[minmax(240px,1fr)_90px_120px_96px] md:items-center"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{p.descricao}</p>
                            <p className="text-xs text-slate-500">
                              {toNumber(p.quantidade)}x • {formatCurrency(toNumber(p.valor_unitario))} un.
                            </p>
                          </div>
                          <span className="text-xs text-slate-500">Qtd. {toNumber(p.quantidade)}</span>
                          <span className="text-sm font-semibold text-slate-900">
                            {formatCurrency(toNumber(p.total_item))}
                          </span>
                          <button
                            type="button"
                            onClick={() => removerPeca(index)}
                            disabled={isLocked}
                            className="rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Remover
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">Nenhuma peça adicionada ainda.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">Orçamento</h2>

              <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
                <InfoCard label="Custo peças técnico" value={formatCurrency(custoTecnico.valorPecas)} />
                <Field
                  label="Mão de obra técnico"
                  name="tecnicoValorMaoObra"
                  value={String(form.tecnicoValorMaoObra)}
                  onChange={handleChange}
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isLocked}
                />
                <InfoCard label="Desconto técnico" value={formatCurrency(custoTecnico.desconto)} />
                <InfoCard label="Total técnico" value={formatCurrency(custoTecnico.total)} />
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field
                  label="Peças cliente"
                  name="valorPecasCliente"
                  value={String(form.valorPecasCliente)}
                  onChange={handleChange}
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isLocked}
                />
                <Field
                  label="Mão de obra cliente"
                  name="valorMaoObra"
                  value={String(form.valorMaoObra)}
                  onChange={handleChange}
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isLocked}
                />
                <Field
                  label="Desconto"
                  name="desconto"
                  value={String(form.desconto)}
                  onChange={handleChange}
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isLocked}
                />
                <InfoCard label="Total calculado" value={formatCurrency(total)} />
              </div>

              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoCard label="Recebido cliente" value={formatCurrency(valorRecebido)} />
                  <InfoCard label="Saldo cliente" value={formatCurrency(saldoReceber)} />
                  <InfoCard label="Forma recebimento" value={formatarFormaPagamento(os.forma_recebimento)} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[160px_170px_auto] md:items-end">
                  <label className="block text-xs font-black text-emerald-900">
                    Receber parcial
                    <input
                      type="number"
                      value={adiantamentoValor}
                      onChange={(event) => setAdiantamentoValor(event.target.value)}
                      step="0.01"
                      min="0"
                      max={saldoReceber}
                      disabled={salvando || isLocked || saldoReceber <= 0}
                      placeholder="0,00"
                      className="mt-1 h-10 w-full rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-black text-emerald-900">
                    Forma
                    <select
                      value={adiantamentoForma}
                      onChange={(event) => setAdiantamentoForma(event.target.value)}
                      disabled={salvando || isLocked || saldoReceber <= 0}
                      className="mt-1 h-10 w-full rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      {FORMAS_RECEBIMENTO.map((forma) => (
                        <option key={forma.value} value={forma.value}>
                          {forma.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={registrarAdiantamento}
                    disabled={salvando || isLocked || total <= 0 || saldoReceber <= 0 || !adiantamentoValor.trim()}
                    className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Registrar recebimento parcial
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-emerald-800">
                    Status financeiro: {os.status_financeiro ?? 'PENDENTE'}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Garantia</label>
                  <select
                    name="garantia"
                    value={form.garantia}
                    onChange={handleChange}
                    disabled={isLocked}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {GARANTIA_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Garantidor</label>
                  <select
                    name="garantidorId"
                    value={form.garantidorId}
                    onChange={handleChange}
                    disabled={isLocked || form.garantia !== 'SIM'}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">
                      {form.garantia === 'SIM' ? 'Selecione quem paga' : 'Somente garantia'}
                    </option>
                    {garantidores
                      .filter((item) => item.ativo !== false)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome ?? `Garantidor #${item.id}`}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">OS/Sinistro do garantidor</label>
                  <input
                    name="referenciaGarantidor"
                    value={form.referenciaGarantidor}
                    onChange={handleChange}
                    disabled={isLocked || form.garantia !== 'SIM'}
                    placeholder={form.garantia === 'SIM' ? 'Ex.: sinistro, protocolo ou OS externa' : 'Somente garantia'}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => salvarAtendimento(form.status)}
                  disabled={salvando || isLocked}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Salvar atendimento
                </button>

                <button
                  type="button"
                  onClick={() => salvarAtendimento('AGUARDANDO_APROVACAO')}
                  disabled={salvando || isLocked}
                  className="rounded-lg border border-cyan-300 px-4 py-2 text-sm font-medium text-cyan-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Marcar aguardando aprovação
                </button>

                <button
                  type="button"
                  onClick={() => salvarAtendimento('AGUARDANDO_PECA')}
                  disabled={salvando || isLocked}
                  className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-medium text-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Marcar aguardando peça
                </button>

                <button
                  type="button"
                  onClick={() => salvarAtendimento('CRITICA')}
                  disabled={salvando || isLocked}
                  className="rounded-lg border border-red-500 bg-red-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Marcar crítica
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">Fotos do reparo</h2>

              <div className="rounded-xl border border-dashed border-slate-300 p-3">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFotosChange}
                  disabled={isLocked}
                  className="block w-full text-sm text-slate-600 disabled:cursor-not-allowed"
                />

                {novasFotos.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {novasFotos.length} arquivo(s) selecionado(s)
                  </p>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {fotos.map((foto) => (
                  <a
                    key={foto.id}
                    href={foto.url ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                  >
                    <div className="aspect-video bg-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={foto.url ?? ''}
                        alt={foto.nome_arquivo ?? 'Foto da OS'}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-slate-800">
                        {foto.nome_arquivo ?? 'Foto'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {foto.criado_em ? new Date(foto.criado_em).toLocaleString('pt-BR') : ''}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">Resumo da OS</h2>

              <div className="space-y-2">
                <SummaryItem label="Cliente" value={os.cliente?.nome ?? '-'} />
                <SummaryItem label="CPF/CNPJ" value={os.cliente?.cpf_cnpj ?? '-'} />
                <SummaryItem label="WhatsApp" value={os.cliente?.whatsapp ?? '-'} />
                <SummaryItem label="E-mail" value={os.cliente?.email ?? '-'} />
                <SummaryItem label="CEP" value={os.cliente?.cep ?? '-'} />
                <SummaryItem
                  label="Endereço"
                  value={[
                    os.cliente?.logradouro,
                    os.cliente?.numero,
                    os.cliente?.bairro,
                    os.cliente?.cidade,
                    os.cliente?.estado,
                  ]
                    .filter(Boolean)
                    .join(', ') || '-'}
                />
                <SummaryItem label="Categoria" value={categorias.find((item) => String(item.id) === form.categoriaId)?.nome ?? os.categoria?.nome ?? '-'} />
                <SummaryItem label="Marca" value={marcas.find((item) => String(item.id) === form.marcaId)?.nome ?? os.marca?.nome ?? '-'} />
                <SummaryItem label="Modelo" value={form.modelo || '-'} />
                <SummaryItem label="Numero de serie" value={form.numeroSerie || '-'} />
                <SummaryItem label="Garantia" value={form.garantia} />
                {form.garantia === 'SIM' && (
                  <SummaryItem label="Garantidor" value={getGarantidorNome(garantidores, form.garantidorId)} />
                )}
                {form.garantia === 'SIM' && (
                  <SummaryItem label="OS/Sinistro garantidor" value={form.referenciaGarantidor || '-'} />
                )}
                <SummaryItem label="Finalizada em" value={os.finalizada_em ? new Date(os.finalizada_em).toLocaleString('pt-BR') : '-'} />
                <SummaryItem label="Defeito" value={os.defeito ?? '-'} />
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">Histórico da OS</h2>

              <div className="max-h-[640px] space-y-3 overflow-y-auto pr-2">
                {historico.length > 0 ? (
                  historico.map((item) => (
                    <div key={item.id} className={`rounded-xl border p-3 ${getHistoricoCardClass(item.acao)}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{formatarAcaoHistorico(item.acao)}</p>
                          <p className="text-xs text-slate-500">
                            {item.criado_em ? new Date(item.criado_em).toLocaleString('pt-BR') : ''}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                          {item.responsavel ?? 'Sistema'}
                        </span>
                      </div>

                      {item.descricao && (
                        <p className="mt-3 text-sm text-slate-600">{item.descricao}</p>
                      )}

                      <div className="mt-3 grid gap-2 text-xs text-slate-500">
                        <span>Status: {item.status_anterior ?? '-'} → {item.status_novo ?? '-'}</span>
                        <span>
                          Prioridade: {item.prioridade_anterior ?? '-'} → {item.prioridade_nova ?? '-'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Nenhum histórico registrado ainda.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function getHistoricoCardClass(acao?: string | null) {
  if (acao === 'ACEITE_TECNICO') return 'border-emerald-300 bg-emerald-50'
  if (acao === 'RECUSA_TECNICO') return 'border-red-300 bg-red-50'
  if (acao === 'ATRIBUICAO_TECNICO') return 'border-orange-200 bg-orange-50'
  return 'border-slate-200 bg-white'
}

function formatarAcaoHistorico(acao?: string | null) {
  if (acao === 'ACEITE_TECNICO') return 'Aceito pelo técnico'
  if (acao === 'RECUSA_TECNICO') return 'Recusado pelo técnico'
  if (acao === 'ATRIBUICAO_TECNICO') return 'Técnico atribuído'
  if (acao === 'ALTERACAO_STATUS') return 'Status alterado'
  if (acao === 'OS_FINALIZADA') return 'OS finalizada'
  if (acao === 'ATENDIMENTO_TECNICO') return 'Atendimento técnico'
  return acao ?? 'Evento'
}

function Field({
  label,
  name,
  value,
  onChange,
  textarea = false,
  rows = 4,
  type = 'text',
  step,
  min,
  placeholder,
  disabled = false,
}: {
  label: string
  name: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
  textarea?: boolean
  rows?: number
  type?: string
  step?: string
  min?: string
  placeholder?: string
  disabled?: boolean
}) {
  const labelExibido = name === 'valorCusto' ? 'Custo unit.' : label

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{labelExibido}</label>
      {textarea ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          step={step}
          min={min}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      )}
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <span className="shrink-0 text-sm text-slate-500">{label}</span>
      <span className="min-w-0 break-all text-right text-sm font-medium text-slate-900">{value}</span>
    </div>
  )
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function toMoneyNumber(value: number) {
  return Math.round(value * 100) / 100
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

function valorRecebidoCliente(os: OrdemServico | null, totalAtual: number) {
  if (!os) return 0
  const recebido = toNumber(os.valor_recebido_cliente)
  if (recebido > 0) return Math.min(recebido, totalAtual)
  return os.status_financeiro === 'RECEBIDO' ? totalAtual : 0
}

function parseMoneyInput(value: string) {
  const normalizado = value.trim().replace(/\./g, '').replace(',', '.')
  const valor = Number(normalizado)
  return Number.isFinite(valor) ? valor : Number.NaN
}

function formatarFormaPagamento(forma?: string | null) {
  const value = String(forma ?? '').toUpperCase()
  const labels: Record<string, string> = {
    PIX: 'PIX',
    CARTAO: 'Cartao',
    DEPOSITO: 'Deposito',
    BOLETO: 'Boleto',
    DINHEIRO: 'Dinheiro',
  }

  return labels[value] ?? '-'
}

function normalizarTexto(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function formatarDistanciaTecnico(tecnico: TecnicoSugerido) {
  if (tecnico.distancia_km === null) return 'sem km'

  return `${tecnico.distancia_km.toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })} km`
}

function formatarGrupoEquipamento(grupo: string) {
  if (grupo === 'LINHA_BRANCA') return 'Linha branca'
  if (grupo === 'LINHA_MARROM') return 'Linha marrom'
  if (grupo === 'INFORMATICA') return 'Informática'
  return 'Gerais'
}

function getGarantidorNome(garantidores: Garantidor[], id: string) {
  if (!id) return '-'
  const garantidor = garantidores.find((item) => String(item.id) === id)
  return garantidor?.nome ?? `Garantidor #${id}`
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

