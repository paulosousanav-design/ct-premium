import type { NextRequest } from 'next/server'

export type AtorAuditoria = {
  usuarioId: number
  nome: string
  email: string
}

export function cabecalhosAuditoria(request: NextRequest, ator: AtorAuditoria) {
  const encaminhado = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = encaminhado || request.headers.get('x-real-ip') || ''
  const userAgent = request.headers.get('user-agent') || ''
  const unidade = String(request.headers.get('x-unidade-id') ?? '').trim()

  return {
    'x-audit-user-id': String(ator.usuarioId),
    'x-audit-user-name': Buffer.from(ator.nome, 'utf8').toString('base64'),
    'x-audit-user-email': ator.email,
    'x-audit-unit-id': /^\d+$/.test(unidade) ? unidade : '',
    'x-audit-ip': ip,
    'x-audit-user-agent': Buffer.from(userAgent, 'utf8').toString('base64'),
  }
}
