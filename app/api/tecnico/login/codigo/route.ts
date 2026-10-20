import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { limitarRotaPublica } from '@/lib/rate-limit'
import { normalizarTelefone, telefonesCorrespondem } from '@/lib/tecnico-auth'
import {
  expiracaoCodigoTecnico,
  gerarCodigoTecnico,
  hashCodigoTecnico,
  telefoneWhatsAppInternacional,
} from '@/lib/tecnico-otp'
import { configuracaoWhatsAppOtp, enviarCodigoWhatsApp } from '@/lib/whatsapp-cloud'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const respostaGenerica = 'Se o número estiver cadastrado, o código chega pelo WhatsApp.'

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configuracao do Supabase ausente no servidor.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function POST(request: NextRequest) {
  try {
    configuracaoWhatsAppOtp()
    const bloqueio = await limitarRotaPublica(request, 'codigo-tecnico', 5, 600)
    if (bloqueio) return bloqueio

    const body = await request.json().catch(() => null)
    const whatsapp = normalizarTelefone(body?.whatsapp)
    if (whatsapp.length < 10) {
      return NextResponse.json({ error: 'Informe um número de WhatsApp válido.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: tecnicos, error: erroTecnicos } = await supabase
      .from('parceiros')
      .select('id, whatsapp')
      .eq('status', 'ATIVO')

    if (erroTecnicos) throw erroTecnicos
    const tecnico = (tecnicos ?? []).find((item) => telefonesCorrespondem(item.whatsapp, whatsapp))

    if (!tecnico?.id) return NextResponse.json({ ok: true, message: respostaGenerica })

    const dezMinutosAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count, error: erroContagem } = await supabase
      .from('tecnico_login_codigos')
      .select('id', { count: 'exact', head: true })
      .eq('parceiro_id', tecnico.id)
      .gte('criado_em', dezMinutosAtras)

    if (erroContagem) throw erroContagem
    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: 'Muitos códigos solicitados. Aguarde alguns minutos e tente novamente.' },
        { status: 429, headers: { 'Retry-After': '600' } }
      )
    }

    await supabase
      .from('tecnico_login_codigos')
      .update({ usado_em: new Date().toISOString() })
      .eq('parceiro_id', tecnico.id)
      .is('usado_em', null)

    const codigo = gerarCodigoTecnico()
    const telefoneEnvio = telefoneWhatsAppInternacional(whatsapp)
    const registro = {
      parceiro_id: Number(tecnico.id),
      telefone_hash: createHash('sha256').update(telefoneEnvio).digest('hex'),
      codigo_hash: hashCodigoTecnico(codigo, Number(tecnico.id)),
      expira_em: expiracaoCodigoTecnico().toISOString(),
    }

    const { data: codigoSalvo, error: erroCodigo } = await supabase
      .from('tecnico_login_codigos')
      .insert(registro)
      .select('id')
      .single()

    if (erroCodigo) throw erroCodigo

    try {
      const mensagemId = await enviarCodigoWhatsApp(telefoneEnvio, codigo)
      await supabase
        .from('tecnico_login_codigos')
        .update({ mensagem_id: mensagemId })
        .eq('id', codigoSalvo.id)
    } catch (error) {
      await supabase
        .from('tecnico_login_codigos')
        .update({ usado_em: new Date().toISOString() })
        .eq('id', codigoSalvo.id)
      throw error
    }

    await supabase
      .from('tecnico_login_codigos')
      .delete()
      .lt('expira_em', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    return NextResponse.json({ ok: true, message: respostaGenerica, expiresIn: 300 })
  } catch (error) {
    console.error('Erro ao enviar codigo do tecnico:', mensagemSegura(error))
    return NextResponse.json(
      { error: formatarErroCodigo(error) },
      { status: erroConfiguracao(error) ? 503 : 500 }
    )
  }
}

function erroConfiguracao(error: unknown) {
  const mensagem = mensagemSegura(error)
  return /nao configurado|relation .*tecnico_login_codigos.* does not exist/i.test(mensagem)
}

function formatarErroCodigo(error: unknown) {
  const mensagem = mensagemSegura(error)
  if (/relation .*tecnico_login_codigos.* does not exist|PGRST205/i.test(mensagem)) {
    return 'Execute o arquivo supabase-add-login-whatsapp-tecnico.sql antes de testar o código.'
  }
  if (/nao configurado/i.test(mensagem)) return mensagem
  if (/^WhatsApp:/i.test(mensagem)) return mensagem
  return 'Não foi possível enviar o código agora. Tente novamente em instantes.'
}

function mensagemSegura(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    return [obj.message, obj.details, obj.code].filter(Boolean).map(String).join(' | ')
  }
  return String(error ?? '')
}
