type RespostaOAuth = {
  error?: unknown
  error_description?: unknown
}

export function mensagemErroOAuth(status: number, resposta: RespostaOAuth | null, corpo: string) {
  const codigo = texto(resposta?.error)
  const descricao = texto(resposta?.error_description)
  const detalhe = descricao || codigo || corpo.trim() || `HTTP ${status}`

  if (codigo === 'invalid_grant' || /expired|revoked|expirad|revogad/i.test(detalhe)) {
    return 'Google OAuth: a autorizacao do Google Drive expirou ou foi revogada. Reconecte a conta.'
  }
  if (codigo === 'invalid_client' || /unauthorized_client/i.test(codigo)) {
    return 'Google OAuth: as credenciais do aplicativo Google estao invalidas. Revise o Client ID e o Client Secret na hospedagem.'
  }
  if (status === 400 || /^bad request$/i.test(detalhe)) {
    return 'Google OAuth: a autorizacao do Google Drive nao e mais valida. Reconecte a conta.'
  }
  return `Google OAuth: ${detalhe}`
}

export function autorizacaoGoogleInvalida(mensagem?: string | null) {
  return /expired|revoked|invalid_grant|expirad|revogad|bad request|autorizacao.+nao e mais valida/i.test(mensagem ?? '')
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : ''
}
