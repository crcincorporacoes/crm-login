import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from './actions'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Bem-vindo, {user.email}</h1>
      <form action={logout}>
        <button type="submit">Sair</button>
      </form>
    </main>
  )
}
