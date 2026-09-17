import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'
import { AppShell } from '@/components/app-shell'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (await hasProfile(supabase, user.id)) {
    redirect('/portal')
  }

  return <AppShell heading={`Bem-vindo, ${user.email}`} />
}
