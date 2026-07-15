import { supabase } from '@/lib/supabase'
import { getEscopoCabecalho } from '@/lib/unidade-client'

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init.headers)

  if (token) headers.set('Authorization', `Bearer ${token}`)
  const escopoUnidade = getEscopoCabecalho()
  if (escopoUnidade) headers.set('X-Unidade-Id', escopoUnidade)

  return fetch(input, {
    ...init,
    headers,
  })
}
