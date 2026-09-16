import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'
import { logout } from './actions'

export default async function PortalPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!(await hasProfile(supabase, user.id))) {
    redirect('/dashboard')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Bem-vindo, {profile?.name ?? user.email}</h1>
      <form action={logout}>
        <button type="submit">Sair</button>
      </form>
    </main>
  )
}
