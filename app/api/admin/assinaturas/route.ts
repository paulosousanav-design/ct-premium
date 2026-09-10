import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { atualizarClienteAsaas, criarAssinaturaAsaas, criarClienteAsaas, asaasConfigured, asaasEnvironment, type AsaasBillingType } from '@/lib/asaas'
import { requireAdminPermission } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const planos = {
  ESSENCIAL: { nome: 'Essencial', mensal: 79, anual: 664 },
  PROFISSIONAL: { nome: 'Profissional', mensal: 129, anual: 1084 },
  COMPLETO: { nome: 'Completo', mensal: 179, anual: 1504 },
} as const

type Plano = keyof typeof planos

function supabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, 'configuracoes')
  if (!auth.ok) return auth.response
  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('saas_assinaturas')
      .select('id, plano, ciclo, status, valor, proximo_vencimento, asaas_subscription_id, observacao, criado_em, saas_clientes(nome, email, cnpj)')
      .order('criado_em', { ascending: false })
      .limit(100)
    if (error) throw error
    return NextResponse.json({
      assinaturas: data ?? [],
      configurado: asaasConfigured(),
      ambiente: asaasEnvironment(),
      planos,
    })
  } catch (error) {
    return NextResponse.json({ error: mensagemErro(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, 'configuracoes')
  if (!auth.ok) return auth.response
  try {
    if (!asaasConfigured()) {
      return NextResponse.json({ error: 'Configure a ASAAS_API_KEY antes de criar uma assinatura.' }, { status: 503 })
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const nome = texto(body?.nome)
    const email = texto(body?.email).toLowerCase()
    const cnpj = somenteDigitos(texto(body?.cnpj))
    const telefone = somenteDigitos(texto(body?.telefone))
    const plano = texto(body?.plano) as Plano
    const ciclo = texto(body?.ciclo) === 'ANUAL' ? 'ANUAL' : 'MENSAL'
    const formaPagamento = texto(body?.formaPagamento) as AsaasBillingType
    const proximoVencimento = texto(body?.proximoVencimento)

    if (nome.length < 3) return NextResponse.json({ error: 'Informe o nome ou razão social do cliente.' }, { status: 400 })
    if (!email.includes('@')) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 })
    if (!planos[plano]) return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 })
    if (!['PIX', 'BOLETO'].includes(formaPagamento)) return NextResponse.json({ error: 'Escolha Pix ou boleto.' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proximoVencimento)) return NextResponse.json({ error: 'Informe a data do primeiro vencimento.' }, { status: 400 })

    const supabase = supabaseAdmin()
    const { data: cliente, error: clienteError } = await supabase
      .from('saas_clientes')
      .upsert({ nome, email, cnpj: cnpj || null, telefone: telefone || null, atualizado_em: new Date().toISOString() }, { onConflict: 'email' })
      .select('id, asaas_customer_id')
      .single()
    if (clienteError) throw clienteError

    let asaasCustomerId = String(cliente.asaas_customer_id ?? '')
    const externo = `ct-cliente-${cliente.id}`
    if (!asaasCustomerId) {
      const asaasCliente = await criarClienteAsaas({ name: nome, email, cpfCnpj: cnpj, mobilePhone: telefone, externalReference: externo })
      asaasCustomerId = asaasCliente.id
      const { error } = await supabase.from('saas_clientes').update({ asaas_customer_id: asaasCustomerId, atualizado_em: new Date().toISOString() }).eq('id', cliente.id)
      if (error) throw error
    } else {
      await atualizarClienteAsaas({ id: asaasCustomerId, name: nome, email, cpfCnpj: cnpj, mobilePhone: telefone, externalReference: externo })
    }

    const valor = ciclo === 'ANUAL' ? planos[plano].anual : planos[plano].mensal
    const { data: assinaturaLocal, error: assinaturaError } = await supabase
      .from('saas_assinaturas')
      .insert({ cliente_id: cliente.id, plano, ciclo, status: 'PENDENTE', valor, forma_pagamento: formaPagamento, proximo_vencimento: proximoVencimento })
      .select('id')
      .single()
    if (assinaturaError) throw assinaturaError

    try {
      const assinaturaAsaas = await criarAssinaturaAsaas({
        customer: asaasCustomerId,
        billingType: formaPagamento,
        value: valor,
        nextDueDate: proximoVencimento,
        cycle: ciclo === 'ANUAL' ? 'YEARLY' : 'MONTHLY',
        description: `CT Premium — Plano ${planos[plano].nome}`,
        externalReference: `ct-assinatura-${assinaturaLocal.id}`,
      })
      const { error } = await supabase.from('saas_assinaturas').update({
        asaas_subscription_id: assinaturaAsaas.id,
        status: 'AGUARDANDO_PAGAMENTO',
        atualizado_em: new Date().toISOString(),
      }).eq('id', assinaturaLocal.id)
      if (error) throw error
      return NextResponse.json({ ok: true, id: assinaturaLocal.id, ambiente: asaasEnvironment() })
    } catch (asaasError) {
      await supabase.from('saas_assinaturas').update({ status: 'FALHA_CRIACAO', observacao: mensagemErro(asaasError), atualizado_em: new Date().toISOString() }).eq('id', assinaturaLocal.id)
      throw asaasError
    }
  } catch (error) {
    return NextResponse.json({ error: mensagemErro(error) }, { status: 500 })
  }
}

function texto(value: unknown) { return String(value ?? '').trim() }
function somenteDigitos(value: string) { return value.replace(/\D/g, '') }
function mensagemErro(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível processar a assinatura.' }
