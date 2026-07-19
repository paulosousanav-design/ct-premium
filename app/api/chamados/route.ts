import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { limitarRotaPublica } from '@/lib/rate-limit'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const aberturaChamadosAtiva =
  process.env.ABERTURA_CHAMADOS_ATIVA === 'true' ||
  process.env.NEXT_PUBLIC_ABERTURA_CHAMADOS_ATIVA === 'true'
const estadoAtendido = 'MS'
const whatsappAtendimento = '5567992058808'

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configuracao do Supabase ausente no servidor.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function colunaExiste(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tabela: string,
  coluna: string
) {
  const { error } = await supabase.from(tabela).select(coluna).limit(0)
  return !error
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const [{ data: categorias, error: categoriasError }, { data: marcas, error: marcasError }] =
      await Promise.all([
        supabase.from('categorias').select('id, nome').order('nome', { ascending: true }),
        supabase.from('marcas').select('id, nome, categoria_id').order('nome', { ascending: true }),
      ])

    if (categoriasError) throw categoriasError
    if (marcasError) throw marcasError

    return NextResponse.json({
      categorias: categorias ?? [],
      marcas: marcas ?? [],
    })
  } catch (error) {
    console.error('Erro ao carregar dados do chamado:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao carregar dados do chamado.') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const bloqueio = await limitarRotaPublica(request, 'abertura-chamado', 5, 3600)
    if (bloqueio) return bloqueio
    if (!aberturaChamadosAtiva) {
      return NextResponse.json(
        { error: 'A abertura online de chamados estara disponivel em breve. No momento, estamos credenciando tecnicos parceiros.' },
        { status: 403 }
      )
    }

    const dados = await lerDadosChamado(request)
    const nomeCliente = getCampo(dados, 'nomeCliente')
    const cpfCnpj = getCampo(dados, 'cpfCnpj')
    const whatsapp = getCampo(dados, 'whatsapp')
    const categoriaId = Number(getCampo(dados, 'categoriaId'))
    const marcaId = Number(getCampo(dados, 'marcaId'))
    const modelo = getCampo(dados, 'modelo')
    const defeito = getCampo(dados, 'defeito')
    const garantia = getCampo(dados, 'garantia') === 'SIM'
    const cidade = getCampo(dados, 'cidade')
    const estado = getCampo(dados, 'estado').toUpperCase()

    if (!nomeCliente || !cpfCnpj || !whatsapp || !categoriaId || !marcaId || !modelo || !defeito) {
      return NextResponse.json(
        { error: 'Preencha nome, CPF/CNPJ, WhatsApp, equipamento, marca, modelo e defeito.' },
        { status: 400 }
      )
    }

    const validacaoArea = validarAreaAtendimento(cidade, estado)
    if (!validacaoArea.ok) {
      return NextResponse.json(
        {
          error: validacaoArea.mensagem,
          whatsappUrl: validacaoArea.whatsappUrl,
        },
        { status: 400 }
      )
    }

    if (garantia && (!getCampo(dados, 'dataCompra') || !getCampo(dados, 'numeroNf') || !getCampo(dados, 'localCompra'))) {
      return NextResponse.json(
        { error: 'Para garantia, informe data da compra, numero da NF e local da compra.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const clientePayload = {
      nome: nomeCliente,
      cpf_cnpj: cpfCnpj,
      whatsapp,
      email: getCampo(dados, 'email') || null,
      cep: getCampo(dados, 'cep') || null,
      logradouro: getCampo(dados, 'rua') || null,
      numero: getCampo(dados, 'numero') || null,
      bairro: getCampo(dados, 'bairro') || null,
      cidade: cidade || null,
      estado: estado || null,
    }

    const { data: novoCliente, error: clienteError } = await supabase
      .from('clientes')
      .insert(clientePayload)
      .select('id')
      .single()

    if (clienteError) throw clienteError

    const numeroOS = gerarNumeroOS()
    const origemOs = garantia ? 'GARANTIA_SEGURADORA' : 'PORTAL_CLIENTE'
    const osPayload: Record<string, unknown> = {
      numero_os: numeroOS,
      cliente_id: novoCliente.id,
      categoria_id: categoriaId,
      marca_id: marcaId,
      modelo,
      numero_serie: getCampo(dados, 'numeroSerie') || null,
      garantia,
      data_compra: garantia ? getCampo(dados, 'dataCompra') || null : null,
      numero_nf: garantia ? getCampo(dados, 'numeroNf') || null : null,
      local_compra: garantia ? getCampo(dados, 'localCompra') || null : null,
      defeito,
      status: 'NOVA',
      prioridade: 'NORMAL',
      parceiro_id: null,
      sla_status: 'NORMAL',
      observacao_tecnica: getCampo(dados, 'observacao') || null,
    }

    if (await colunaExiste(supabase, 'ordens_servico', 'origem_os')) {
      osPayload.origem_os = origemOs
    }

    const { data: osCriada, error: osError } = await supabase
      .from('ordens_servico')
      .insert(osPayload)
      .select('id')
      .single()

    if (osError) throw osError
    if (!osCriada?.id) throw new Error('Chamado criado, mas sem ID de OS.')

    const arquivos = dados.formData?.getAll('anexos').filter((item): item is File => item instanceof File && item.size > 0) ?? []
    await salvarAnexos(supabase, osCriada.id, arquivos)

    await supabase.from('os_historico').insert({
      os_id: osCriada.id,
      acao: 'OS_ABERTA_CLIENTE',
      status_anterior: null,
      status_novo: 'NOVA',
      descricao: 'OS aberta pelo cliente no portal publico.',
      responsavel: nomeCliente,
    }).throwOnError()

    if (dados.redirectHtml) {
      const consultaUrl = new URL('/consulta', request.url)
      consultaUrl.searchParams.set('os', numeroOS)
      consultaUrl.searchParams.set('whatsapp', whatsapp)
      return NextResponse.redirect(consultaUrl, { status: 303 })
    }

    return NextResponse.json({ ok: true, id: osCriada.id, numeroOS })
  } catch (error) {
    console.error('Erro ao abrir chamado:', error)
    return NextResponse.json(
      { error: formatarErro(error, 'Erro ao abrir chamado.') },
      { status: 500 }
    )
  }
}

async function lerDadosChamado(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    return { body, formData: null as FormData | null, redirectHtml: false }
  }

  const formData = await request.formData()
  const accept = request.headers.get('accept') ?? ''
  return {
    body: Object.fromEntries(formData.entries()),
    formData,
    redirectHtml: accept.includes('text/html'),
  }
}

async function salvarAnexos(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  osId: number,
  arquivos: File[]
) {
  if (arquivos.length === 0) return

  for (const arquivo of arquivos.slice(0, 6)) {
    const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '-')
    const caminho = `${osId}/cliente/${Date.now()}-${nomeSeguro || 'anexo'}`
    const buffer = Buffer.from(await arquivo.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from('os-fotos')
      .upload(caminho, buffer, {
        contentType: arquivo.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage.from('os-fotos').getPublicUrl(caminho)
    const { error: fotoError } = await supabase.from('os_fotos').insert({
      os_id: osId,
      nome_arquivo: arquivo.name,
      url: urlData.publicUrl,
    })

    if (fotoError) throw fotoError
  }
}

function getCampo(dados: Awaited<ReturnType<typeof lerDadosChamado>>, nome: string) {
  return String(dados.body[nome] ?? '').trim()
}

function gerarNumeroOS() {
  const agora = new Date()
  const ano = String(agora.getFullYear()).slice(-2)
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  const sequencia = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')

  return `CT${ano}${mes}${dia}${sequencia}`
}

function validarAreaAtendimento(cidade: string, estado: string) {
  const uf = estado.trim().toUpperCase()
  const whatsappUrl = criarWhatsAppRegiaoUrl(cidade, uf)

  if (!uf) {
    return {
      ok: false,
      mensagem: 'Informe a UF do atendimento. No momento a abertura online esta liberada somente para Mato Grosso do Sul (MS).',
      whatsappUrl,
    }
  }

  if (uf !== estadoAtendido) {
    return {
      ok: false,
      mensagem: 'No momento a abertura online esta liberada somente para Mato Grosso do Sul (MS). Para outras regioes, fale conosco pelo WhatsApp.',
      whatsappUrl,
    }
  }

  return { ok: true, mensagem: '', whatsappUrl: '' }
}

function criarWhatsAppRegiaoUrl(cidade: string, estado: string) {
  const uf = estado.trim().toUpperCase()
  const local = [cidade.trim(), uf].filter(Boolean).join('/')
  const texto = `Ola! Estou em ${local || 'minha regiao'} e gostaria de saber quando o atendimento da Chame o Tecnico estara disponivel na minha regiao.`
  return `https://wa.me/${whatsappAtendimento}?text=${encodeURIComponent(texto)}`
}

function formatarErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const possiveis = [obj.message, obj.details, obj.hint, obj.code].filter(Boolean).map(String)
    if (possiveis.length > 0) return possiveis.join(' | ')
  }

  return fallback
}
