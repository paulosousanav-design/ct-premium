import { supabase } from '@/lib/supabase'
import { getUnidadeSelecionadaId } from '@/lib/unidade-client'

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init.headers)

  if (token) headers.set('Authorization', `Bearer ${token}`)
  const unidadeId = getUnidadeSelecionadaId()
  if (unidadeId) headers.set('X-Unidade-Id', String(unidadeId))

  return fetch(input, {
    ...init,
    headers,
  })
}
