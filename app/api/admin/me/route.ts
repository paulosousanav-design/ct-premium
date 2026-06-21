import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    email: auth.email,
    permissoes: auth.permissoes,
  })
}
