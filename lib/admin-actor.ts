import { supabase } from '@/lib/supabase'

export async function getAdminActorLabel() {
  const { data: sessionData } = await supabase.auth.getSession()
  const email = sessionData.session?.user.email?.toLowerCase() ?? ''
  if (!email) return 'Sistema'

  const { data } = await supabase
    .from('admin_usuarios')
    .select('nome, email')
    .eq('email', email)
    .maybeSingle()

  return `${data?.nome || email} (${data?.email || email})`
}
