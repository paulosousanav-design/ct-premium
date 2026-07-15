import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin-auth'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const tiposDocumento = new Set(['LAUDO', 'ORCAMENTO'])

function db() {
  if (!url || !key) throw new Error('Supabase não configurado.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'documentos')
    if (!auth.ok) return auth.response
    const supabase = db()
    const { error: tabelaError } = await supabase.from('documentos_tecnicos').select('id').limit(0)
    if (tabelaError) return NextResponse.json({ tabelaPendente: true, documentos: [], emissores: [], carimbos: [], ordens: [], historico: [] })

    const [{ data: documentos, error }, { data: emissores }, { data: carimbos }, { data: ordens }, { data: historico }] = await Promise.all([
      supabase.from('documentos_tecnicos').select('*').order('criado_em', { ascending: false }).limit(200),
      supabase.from('documento_emissores').select('*').order('nome_razao_social'),
      supabase.from('documento_carimbos').select('*').order('tipo').order('nome'),
      supabase.from('ordens_servico').select('id, numero_os, modelo, numero_serie, defeito, diagnostico_tecnico, servico_executado, clientes:cliente_id(nome, cpf_cnpj, whatsapp, logradouro, numero, bairro, cidade, estado), categorias:categoria_id(nome), marcas:marca_id(nome)').order('created_at', { ascending: false }).limit(300),
      supabase.from('documento_historico').select('*').order('criado_em', { ascending: false }).limit(500),
    ])
    if (error) throw error
    return NextResponse.json({ tabelaPendente: false, documentos: documentos ?? [], emissores: emissores ?? [], carimbos: carimbos ?? [], ordens: ordens ?? [], historico: historico ?? [] })
  } catch (error) { return NextResponse.json({ error: mensagem(error, 'Erro ao carregar documentos.') }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'documentos')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const entidade = texto(body?.entidade).toUpperCase()
    if (entidade === 'EMISSOR') return salvarEmissor(body, auth)
    if (entidade === 'CARIMBO') return salvarCarimbo(body, auth)
    if (entidade === 'DOCUMENTO') return salvarDocumento(body, auth)
    return NextResponse.json({ error: 'Operação inválida.' }, { status: 400 })
  } catch (error) { return NextResponse.json({ error: mensagem(error, 'Erro ao salvar.') }, { status: 500 }) }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, 'documentos')
    if (!auth.ok) return auth.response
    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const status = texto(body?.status).toUpperCase()
    if (!id || status !== 'CANCELADO') return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 })
    const supabase = db(); const agora = new Date().toISOString()
    const { error } = await supabase.from('documentos_tecnicos').update({ status, cancelado_em: agora, atualizado_em: agora, atualizado_por_nome: auth.nome, atualizado_por_email: auth.email }).eq('id', id)
    if (error) throw error
    await historico(supabase, id, 'CANCELADO', texto(body?.motivo) || 'Documento cancelado.', auth)
    return NextResponse.json({ ok: true })
  } catch (error) { return NextResponse.json({ error: mensagem(error, 'Erro ao cancelar documento.') }, { status: 500 }) }
}

async function salvarEmissor(body: Record<string, unknown> | null, auth: { nome: string; email: string }) {
  const id = Number(body?.id) || null; const nome = texto(body?.nomeRazaoSocial); const cpfCnpj = texto(body?.cpfCnpj)
  if (!nome || !cpfCnpj) return NextResponse.json({ error: 'Informe nome/razão social e CPF/CNPJ.' }, { status: 400 })
  const payload = { tipo_pessoa: texto(body?.tipoPessoa) === 'PF' ? 'PF' : 'PJ', nome_razao_social: nome, nome_fantasia: texto(body?.nomeFantasia) || null, cpf_cnpj: cpfCnpj, inscricao_estadual: texto(body?.inscricaoEstadual) || null, telefone: texto(body?.telefone) || null, email: texto(body?.email) || null, endereco: texto(body?.endereco) || null, cidade: texto(body?.cidade) || null, estado: texto(body?.estado) || null, logo_url: urlSegura(body?.logoUrl), ativo: body?.ativo !== false, atualizado_em: new Date().toISOString() }
  const supabase = db(); const query = id ? supabase.from('documento_emissores').update(payload).eq('id', id) : supabase.from('documento_emissores').insert(payload)
  const { data, error } = await query.select('id').single(); if (error) throw error
  return NextResponse.json({ ok: true, id: data.id, responsavel: auth.nome })
}

async function salvarCarimbo(body: Record<string, unknown> | null, auth: { nome: string; email: string }) {
  const id = Number(body?.id) || null; const nome = texto(body?.nome)
  if (!nome) return NextResponse.json({ error: 'Informe o nome do carimbo.' }, { status: 400 })
  const tipo = texto(body?.tipo) === 'TECNICO' ? 'TECNICO' : 'CNPJ'; const conselhoInformado = texto(body?.conselho).toUpperCase(); const conselho = tipo === 'TECNICO' && ['CREA', 'CFT', 'OUTRO'].includes(conselhoInformado) ? conselhoInformado : null
  const payload = { tipo, nome, linha_1: texto(body?.linha1) || null, linha_2: texto(body?.linha2) || null, linha_3: texto(body?.linha3) || null, linha_4: texto(body?.linha4) || null, cpf_cnpj: texto(body?.cpfCnpj) || null, conselho, registro_conselho: texto(body?.registroConselho) || null, imagem_url: urlSegura(body?.imagemUrl), ativo: body?.ativo !== false, atualizado_em: new Date().toISOString() }
  const supabase = db(); const query = id ? supabase.from('documento_carimbos').update(payload).eq('id', id) : supabase.from('documento_carimbos').insert(payload)
  const { data, error } = await query.select('id').single(); if (error) throw error
  return NextResponse.json({ ok: true, id: data.id, responsavel: auth.nome })
}

async function salvarDocumento(body: Record<string, unknown> | null, auth: { nome: string; email: string }) {
  const id = Number(body?.id) || null; const tipo = tiposDocumento.has(texto(body?.tipo)) ? texto(body?.tipo) : 'LAUDO'; const titulo = texto(body?.titulo)
  if (!titulo) return NextResponse.json({ error: 'Informe o título do documento.' }, { status: 400 })
  const supabase = db(); const status = texto(body?.status) === 'EMITIDO' ? 'EMITIDO' : 'RASCUNHO'; const emissorId = Number(body?.emissorId) || null; const carimboIds = Array.isArray(body?.carimboIds) ? [...new Set(body.carimboIds.map(Number).filter(Boolean))] : []
  const { data: emissor } = emissorId ? await supabase.from('documento_emissores').select('*').eq('id', emissorId).maybeSingle() : { data: null }
  const { data: carimbos } = carimboIds.length ? await supabase.from('documento_carimbos').select('*').in('id', carimboIds) : { data: [] }
  if (!emissor) return NextResponse.json({ error: 'Selecione um emissor válido.' }, { status: 400 })
  const itens = normalizarItens(body?.itens); const subtotal = arredondar(itens.reduce((soma, item) => soma + item.quantidade * item.valorUnitario, 0)); const desconto = Math.max(dinheiro(body?.desconto), 0); const total = Math.max(arredondar(subtotal - desconto), 0); const agora = new Date().toISOString()
  const payload = { tipo, status, os_id: Number(body?.osId) || null, titulo, emissor_id: emissorId, emissor_snapshot: emissor, carimbo_ids: carimboIds, carimbos_snapshot: carimbos ?? [], cliente_nome: texto(body?.clienteNome) || null, cliente_cpf_cnpj: texto(body?.clienteCpfCnpj) || null, cliente_contato: texto(body?.clienteContato) || null, cliente_endereco: texto(body?.clienteEndereco) || null, equipamento: texto(body?.equipamento) || null, marca: texto(body?.marca) || null, modelo: texto(body?.modelo) || null, numero_serie: texto(body?.numeroSerie) || null, defeito_relatado: texto(body?.defeitoRelatado) || null, diagnostico: texto(body?.diagnostico) || null, procedimentos: texto(body?.procedimentos) || null, conclusao: texto(body?.conclusao) || null, recomendacoes: texto(body?.recomendacoes) || null, itens, subtotal, desconto, total, validade_dias: limitarInteiro(body?.validadeDias, 1, 365, 15), observacoes: texto(body?.observacoes) || null, atualizado_por_nome: auth.nome, atualizado_por_email: auth.email, emitido_em: status === 'EMITIDO' ? agora : null, atualizado_em: agora }
  if (id) {
    const { data: atual } = await supabase.from('documentos_tecnicos').select('status').eq('id', id).maybeSingle()
    if (atual?.status === 'EMITIDO') return NextResponse.json({ error: 'Documento emitido não pode ser alterado. Crie um novo documento para revisão.' }, { status: 400 })
    const { error } = await supabase.from('documentos_tecnicos').update(payload).eq('id', id); if (error) throw error
    await historico(supabase, id, status === 'EMITIDO' ? 'EMITIDO' : 'ATUALIZADO', `${tipo} atualizado.`, auth)
    return NextResponse.json({ ok: true, id })
  }
  const numero = gerarNumero(tipo)
  const { data, error } = await supabase.from('documentos_tecnicos').insert({ ...payload, numero, criado_por_nome: auth.nome, criado_por_email: auth.email }).select('id, numero').single(); if (error) throw error
  await historico(supabase, data.id, status === 'EMITIDO' ? 'EMITIDO' : 'CRIADO', `${tipo} ${data.numero} criado.`, auth)
  return NextResponse.json({ ok: true, id: data.id, numero: data.numero })
}

function normalizarItens(value: unknown) { if (!Array.isArray(value)) return []; return value.map((item) => { const obj = item as Record<string, unknown>; return { descricao: texto(obj.descricao), quantidade: Math.max(dinheiro(obj.quantidade), 0), valorUnitario: Math.max(dinheiro(obj.valorUnitario), 0) } }).filter((item) => item.descricao && item.quantidade > 0) }
async function historico(supabase: ReturnType<typeof db>, documentoId: number, acao: string, descricao: string, auth: { nome: string; email: string }) { await supabase.from('documento_historico').insert({ documento_id: documentoId, acao, descricao, responsavel_nome: auth.nome, responsavel_email: auth.email }) }
function gerarNumero(tipo: string) { const agora = new Date(); const prefixo = tipo === 'ORCAMENTO' ? 'OR' : 'LT'; return `${prefixo}-${agora.getFullYear()}-${Date.now().toString().slice(-9)}` }
function texto(value: unknown) { return String(value ?? '').trim() }
function dinheiro(value: unknown) { const numero = Number(String(value ?? 0).replace(',', '.')); return Number.isFinite(numero) ? numero : 0 }
function arredondar(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100 }
function limitarInteiro(value: unknown, min: number, max: number, fallback: number) { const numero = Math.trunc(Number(value)); return Number.isFinite(numero) ? Math.min(Math.max(numero, min), max) : fallback }
function urlSegura(value: unknown) { const result = texto(value); if (!result) return null; try { const parsed = new URL(result); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null } catch { return result.startsWith('/') ? result : null } }
function mensagem(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
