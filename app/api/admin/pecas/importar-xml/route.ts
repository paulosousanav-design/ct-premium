import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUnidade } from '@/lib/admin-unidade'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAX_XML_BYTES = 5 * 1024 * 1024

type ItemXml = {
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
}

function db() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function estruturaExiste(supabase: ReturnType<typeof db>) {
  const [importacoes, codigoBarras, vinculoConta] = await Promise.all([
    supabase.from('nfe_importacoes').select('id').limit(0),
    supabase.from('pecas').select('codigo_barras, ncm').limit(0),
    supabase.from('contas_pagar').select('nfe_importacao_id').limit(0),
  ])
  return !importacoes.error && !codigoBarras.error && !vinculoConta.error
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'pecas')
    if (!auth.ok) return auth.response
    const supabase = db()
    if (!(await estruturaExiste(supabase))) return NextResponse.json({ estruturaPendente: true, importacoes: [] })
    const { data, error } = await supabase.from('nfe_importacoes')
      .select('id, chave_acesso, numero, serie, data_emissao, fornecedor_cnpj, fornecedor_nome, valor_total, importado_por, importado_em')
      .eq('unidade_id', auth.unidadeId).order('importado_em', { ascending: false }).limit(30)
    if (error) throw error
    return NextResponse.json({ estruturaPendente: false, importacoes: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: mensagem(error, 'Erro ao carregar importacoes de NF-e.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUnidade(request, 'pecas')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const acao = String(body?.acao ?? 'ANALISAR').toUpperCase()
    const xml = String(body?.xml ?? '')
    validarXmlEntrada(xml)
    const nfe = interpretarNfe(xml)
    validarNfe(nfe)

    const supabase = db()
    if (!(await estruturaExiste(supabase))) {
      return NextResponse.json({ error: 'Rode o arquivo supabase-add-importacao-xml-nfe.sql antes de importar.' }, { status: 400 })
    }
    const { data: existente, error: existenteError } = await supabase.from('nfe_importacoes')
      .select('id, importado_em, importado_por').eq('chave_acesso', nfe.chaveAcesso).maybeSingle()
    if (existenteError) throw existenteError
    if (existente) {
      return NextResponse.json({ error: `Esta NF-e ja foi importada em ${new Date(existente.importado_em).toLocaleString('pt-BR')} por ${existente.importado_por}.` }, { status: 409 })
    }

    if (acao === 'ANALISAR') {
      const { data: pecas, error } = await supabase.from('pecas')
        .select('id, codigo, codigo_barras, descricao, marca, categoria, ncm, valor_custo, valor_venda, estoque')
        .eq('unidade_id', auth.unidadeId).eq('ativo', true).order('descricao')
      if (error) throw error
      const lista = pecas ?? []
      const itens = nfe.itens.map((item) => {
        const codigoBarras = normalizarCodigoBarras(item.codigoBarras)
        const codigo = normalizar(item.codigo)
        const sugerida = lista.find((peca) => codigoBarras && normalizarCodigoBarras(peca.codigo_barras) === codigoBarras)
          ?? lista.find((peca) => codigo && normalizar(peca.codigo) === codigo)
        return { ...item, pecaSugeridaId: sugerida?.id ?? null }
      })
      return NextResponse.json({ nfe, itens, parcelas: nfe.parcelas, pagamentos: nfe.pagamentos, pecas: lista })
    }

    if (acao !== 'CONFIRMAR') return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 })
    const itensTela = Array.isArray(body?.itens) ? body.itens : []
    if (itensTela.length !== nfe.itens.length) return NextResponse.json({ error: 'A quantidade de itens nao corresponde ao XML analisado.' }, { status: 400 })
    const itensRpc = nfe.itens.map((item) => {
      const tela = itensTela.find((registro: Record<string, unknown>) => Number(registro.numeroItem) === item.numeroItem)
      if (!tela) throw new Error(`Item ${item.numeroItem} nao foi conferido.`)
      const pecaId = Number(tela.pecaId) || null
      const custo = numero(tela.custoUnitario)
      if (custo < 0) throw new Error(`Custo invalido no item ${item.numeroItem}.`)
      const descricaoNova = String(tela.descricao ?? item.descricao).trim()
      if (!pecaId && !descricaoNova) throw new Error(`Informe a descricao da nova peca no item ${item.numeroItem}.`)
      return {
        numero_item: item.numeroItem, peca_id: pecaId, codigo: item.codigo,
        codigo_barras: item.codigoBarras, descricao: descricaoNova, ncm: item.ncm,
        cfop: item.cfop, unidade: item.unidade, quantidade: item.quantidade,
        valor_unitario_xml: item.valorUnitario, valor_total_xml: item.valorTotal,
        custo_unitario: custo, valor_venda: Math.max(0, numero(tela.valorVenda)),
        categoria: String(tela.categoria ?? '').trim(), marca: String(tela.marca ?? '').trim(),
        estoque_minimo: Math.max(0, numero(tela.estoqueMinimo)), localizacao: String(tela.localizacao ?? '').trim(),
        atualizar_custo: tela.atualizarCusto !== false,
      }
    })
    const gerarContas = body?.gerarContas === true
    const parcelas: Array<{ numero: string; vencimento: string; valor: number }> = Array.isArray(body?.parcelas) ? body.parcelas.map((parcela: Record<string, unknown>, index: number) => ({
      numero: String(parcela.numero ?? index + 1).trim(),
      vencimento: String(parcela.vencimento ?? '').trim(),
      valor: arredondar(numero(parcela.valor)),
    })) : []
    if (gerarContas) {
      if (!parcelas.length || parcelas.some((parcela) => parcela.valor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(parcela.vencimento))) {
        return NextResponse.json({ error: 'Confira os valores e vencimentos de todas as parcelas.' }, { status: 400 })
      }
      const totalParcelas = arredondar(parcelas.reduce((total, parcela) => total + parcela.valor, 0))
      if (Math.abs(totalParcelas - nfe.valorTotal) > 0.02) {
        return NextResponse.json({ error: `A soma das parcelas (${moeda(totalParcelas)}) deve ser igual ao total da NF-e (${moeda(nfe.valorTotal)}).` }, { status: 400 })
      }
    }

    const { data: importacaoId, error: rpcError } = await supabase.rpc('confirmar_importacao_nfe', {
      p_importacao: {
        unidade_id: auth.unidadeId, chave_acesso: nfe.chaveAcesso, modelo: nfe.modelo,
        serie: nfe.serie, numero: nfe.numero, data_emissao: nfe.dataEmissao,
        fornecedor_cnpj: nfe.fornecedorCnpj, fornecedor_nome: nfe.fornecedorNome,
        valor_produtos: nfe.valorProdutos, valor_frete: nfe.valorFrete,
        valor_seguro: nfe.valorSeguro, valor_desconto: nfe.valorDesconto,
        valor_outro: nfe.valorOutro, valor_total: nfe.valorTotal, xml_original: xml,
      },
      p_itens: itensRpc, p_parcelas: parcelas, p_gerar_contas: gerarContas,
      p_responsavel: `${auth.nome} (${auth.email})`,
    })
    if (rpcError) throw rpcError
    return NextResponse.json({ ok: true, importacaoId, itens: itensRpc.length, parcelas: gerarContas ? parcelas.length : 0 })
  } catch (error) {
    const texto = mensagem(error, 'Erro ao importar XML da NF-e.')
    const status = /XML|NF-e|item|parcela|chave|modelo|autorizada|importada/i.test(texto) ? 400 : 500
    return NextResponse.json({ error: texto }, { status })
  }
}

function interpretarNfe(xml: string) {
  const infNfe = primeiroBloco(xml, 'infNFe') || xml
  const ide = primeiroBloco(infNfe, 'ide')
  const emit = primeiroBloco(infNfe, 'emit')
  const total = primeiroBloco(infNfe, 'ICMSTot')
  const cobr = primeiroBloco(infNfe, 'cobr')
  const chaveId = atributo(infNfe, 'infNFe', 'Id').replace(/^NFe/i, '')
  const chaveProtocolo = tag(primeiroBloco(xml, 'infProt'), 'chNFe')
  const itens = blocos(infNfe, 'det').map((det, index) => {
    const prod = primeiroBloco(det, 'prod')
    return {
      numeroItem: Number(atributo(det, 'det', 'nItem')) || index + 1,
      codigo: tag(prod, 'cProd'), codigoBarras: codigoBarrasValido(tag(prod, 'cEAN')),
      descricao: tag(prod, 'xProd'), ncm: tag(prod, 'NCM'), cfop: tag(prod, 'CFOP'),
      unidade: tag(prod, 'uCom'), quantidade: numero(tag(prod, 'qCom')),
      valorUnitario: numero(tag(prod, 'vUnCom')), valorTotal: numero(tag(prod, 'vProd')),
    } satisfies ItemXml
  })
  const parcelas = blocos(cobr, 'dup').map((dup, index) => ({
    numero: tag(dup, 'nDup') || String(index + 1), vencimento: tag(dup, 'dVenc'), valor: numero(tag(dup, 'vDup')),
  }))
  const pagamentos = blocos(primeiroBloco(infNfe, 'pag'), 'detPag').map((pag) => ({
    codigo: tag(pag, 'tPag'), forma: rotuloPagamento(tag(pag, 'tPag')), valor: numero(tag(pag, 'vPag')),
  }))
  return {
    chaveAcesso: chaveId || chaveProtocolo, modelo: tag(ide, 'mod'), serie: tag(ide, 'serie'), numero: tag(ide, 'nNF'),
    dataEmissao: tag(ide, 'dhEmi') || tag(ide, 'dEmi'), fornecedorCnpj: tag(emit, 'CNPJ') || tag(emit, 'CPF'),
    fornecedorNome: tag(emit, 'xNome') || tag(emit, 'xFant'),
    valorProdutos: numero(tag(total, 'vProd')), valorFrete: numero(tag(total, 'vFrete')),
    valorSeguro: numero(tag(total, 'vSeg')), valorDesconto: numero(tag(total, 'vDesc')),
    valorOutro: numero(tag(total, 'vOutro')), valorTotal: numero(tag(total, 'vNF')),
    statusAutorizacao: tag(primeiroBloco(xml, 'infProt'), 'cStat'), itens, parcelas, pagamentos,
  }
}

function validarXmlEntrada(xml: string) {
  if (!xml.trim()) throw new Error('Selecione um arquivo XML da NF-e.')
  if (new TextEncoder().encode(xml).length > MAX_XML_BYTES) throw new Error('O XML excede o limite de 5 MB.')
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML com declaracoes externas nao e permitido.')
  if (!/<(?:\w+:)?infNFe\b/i.test(xml)) throw new Error('O arquivo nao contem uma NF-e valida.')
}
function validarNfe(nfe: ReturnType<typeof interpretarNfe>) {
  if (nfe.modelo !== '55') throw new Error(`Este arquivo e modelo ${nfe.modelo || 'nao identificado'}. Importe uma NF-e de produtos modelo 55.`)
  if (!/^\d{44}$/.test(nfe.chaveAcesso) || !chaveValida(nfe.chaveAcesso)) throw new Error('A chave de acesso da NF-e e invalida.')
  if (!nfe.fornecedorNome || !nfe.itens.length || nfe.valorTotal <= 0) throw new Error('XML incompleto: fornecedor, itens ou total nao foram encontrados.')
  if (nfe.statusAutorizacao && !['100', '150'].includes(nfe.statusAutorizacao)) throw new Error(`A NF-e nao esta autorizada (cStat ${nfe.statusAutorizacao}).`)
  if (nfe.itens.some((item) => !item.descricao || item.quantidade <= 0)) throw new Error('Existem itens invalidos no XML.')
}
function blocos(xml: string, nome: string) { const exp = new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${nome}>`, 'gi'); return xml.match(exp) ?? [] }
function primeiroBloco(xml: string, nome: string) { return blocos(xml, nome)[0] ?? '' }
function tag(xml: string, nome: string) { const exp = new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${nome}>`, 'i'); return decodificar(xml.match(exp)?.[1] ?? '').trim() }
function atributo(xml: string, elemento: string, nome: string) { const exp = new RegExp(`<(?:\\w+:)?${elemento}\\b[^>]*\\b${nome}=["']([^"']+)["']`, 'i'); return decodificar(xml.match(exp)?.[1] ?? '').trim() }
function decodificar(valor: string) { return valor.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))) }
function numero(valor: unknown) { const parsed = Number(String(valor ?? '0').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0 }
function arredondar(valor: number) { return Math.round((valor + Number.EPSILON) * 100) / 100 }
function normalizar(valor: unknown) { return String(valor ?? '').trim().toUpperCase() }
function normalizarCodigoBarras(valor: unknown) { const codigo = String(valor ?? '').replace(/\D/g, ''); return codigo.length >= 8 ? codigo : '' }
function codigoBarrasValido(valor: string) { return /^(SEM GTIN|SEM GTIN TRIB)$/i.test(valor) ? '' : normalizarCodigoBarras(valor) }
function chaveValida(chave: string) { const base = chave.slice(0, 43).split('').reverse().map(Number); let peso = 2; const soma = base.reduce((acc, digito) => { const total = acc + digito * peso; peso = peso === 9 ? 2 : peso + 1; return total }, 0); const resto = soma % 11; const dv = resto === 0 || resto === 1 ? 0 : 11 - resto; return dv === Number(chave[43]) }
function rotuloPagamento(codigo: string) { return ({ '01': 'Dinheiro', '03': 'Cartao de credito', '04': 'Cartao de debito', '15': 'Boleto bancario', '17': 'PIX', '90': 'Sem pagamento', '99': 'Outros' } as Record<string, string>)[codigo] ?? `Codigo ${codigo || '-'}` }
function moeda(valor: number) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function mensagem(error: unknown, fallback: string) { if (error instanceof Error) return error.message; if (error && typeof error === 'object') { const obj = error as Record<string, unknown>; return [obj.message, obj.details, obj.hint].filter(Boolean).map(String).join(' | ') || fallback } return fallback }
