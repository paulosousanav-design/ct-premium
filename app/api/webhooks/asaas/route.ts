import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type EventoAsaas = {
  id?: string
  event?: string
  payment?: { id?: string; subscription?: string; status?: string; value?: number; dueDate?: string; invoiceUrl?: string; bankSlipUrl?: string }
}

function supabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(request: NextRequest) {
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim()
  if (!webhookToken || request.headers.get('asaas-access-token') !== webhookToken) {
    return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })
  }

  const evento = await request.json().catch(() => null) as EventoAsaas | null
  if (!evento?.id || !evento.event) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 })

  try {
    const supabase = supabaseAdmin()
    const { error: eventoError } = await supabase.from('saas_webhook_eventos').insert({
      asaas_event_id: evento.id,
      evento: evento.event,
      payload: evento,
    })
    if (eventoError?.code === '23505') return NextResponse.json({ ok: true, duplicado: true })
    if (eventoError) throw eventoError

    const subscriptionId = evento.payment?.subscription
    if (subscriptionId) {
      const status = statusLocal(evento.event)
      const { data: assinatura, error: assinaturaError } = await supabase
        .from('saas_assinaturas')
        .select('id')
        .eq('asaas_subscription_id', subscriptionId)
        .maybeSingle()
      if (assinaturaError) throw assinaturaError
      if (assinatura) {
        const { error: cobrancaError } = await supabase.from('saas_cobrancas').upsert({
          assinatura_id: assinatura.id,
          asaas_payment_id: evento.payment?.id,
          status: evento.payment?.status ?? evento.event,
          valor: evento.payment?.value ?? 0,
          vencimento: evento.payment?.dueDate ?? null,
          invoice_url: evento.payment?.invoiceUrl ?? null,
          boleto_url: evento.payment?.bankSlipUrl ?? null,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'asaas_payment_id' })
        if (cobrancaError) throw cobrancaError
        if (status) {
          const { error } = await supabase.from('saas_assinaturas').update({ status, atualizado_em: new Date().toISOString() }).eq('id', assinatura.id)
          if (error) throw error
        }
      }
    }
    await supabase.from('saas_webhook_eventos').update({ processado_em: new Date().toISOString() }).eq('asaas_event_id', evento.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro no webhook Asaas:', error instanceof Error ? error.message : 'erro desconhecido')
    return NextResponse.json({ error: 'Falha ao processar webhook.' }, { status: 500 })
  }
}

function statusLocal(evento: string) {
  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(evento)) return 'ATIVA'
  if (evento === 'PAYMENT_OVERDUE') return 'EM_ATRASO'
  if (['PAYMENT_DELETED', 'PAYMENT_REFUNDED'].includes(evento)) return 'CANCELADA'
  return null
}
