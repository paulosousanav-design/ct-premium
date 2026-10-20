type ConfiguracaoWhatsApp = {
  accessToken: string
  phoneNumberId: string
  templateName: string
  languageCode: string
  graphVersion: string
}

export function configuracaoWhatsAppOtp() {
  const config: ConfiguracaoWhatsApp = {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    templateName: process.env.WHATSAPP_AUTH_TEMPLATE_NAME ?? '',
    languageCode: process.env.WHATSAPP_AUTH_TEMPLATE_LANGUAGE ?? 'pt_BR',
    graphVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v23.0',
  }

  if (!config.accessToken || !config.phoneNumberId || !config.templateName) {
    throw new Error('Envio de codigo pelo WhatsApp ainda nao configurado no servidor.')
  }

  return config
}

export function montarMensagemOtp(input: {
  telefone: string
  codigo: string
  templateName: string
  languageCode: string
}) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.telefone,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: input.codigo }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: input.codigo }],
        },
      ],
    },
  }
}

export async function enviarCodigoWhatsApp(telefone: string, codigo: string) {
  const config = configuracaoWhatsAppOtp()
  const response = await fetch(
    `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(montarMensagemOtp({
        telefone,
        codigo,
        templateName: config.templateName,
        languageCode: config.languageCode,
      })),
      signal: AbortSignal.timeout(15_000),
    }
  )

  const payload = await response.json().catch(() => null) as {
    messages?: Array<{ id?: string }>
    error?: { message?: string; code?: number }
  } | null

  if (!response.ok || !payload?.messages?.[0]?.id) {
    const mensagem = payload?.error?.message ?? 'A Meta nao confirmou o envio da mensagem.'
    throw new Error(`WhatsApp: ${mensagem}`)
  }

  return payload.messages[0].id
}

