import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]

  if (host === 'p4integra.com.br' || host === 'www.p4integra.com.br' || host === 'app.p4integra.com.br') {
    if (request.nextUrl.pathname === '/') {
      return NextResponse.rewrite(new URL('/p4-integra', request.url))
    }
  }

  return NextResponse.next()
}

export const config = { matcher: '/' }
