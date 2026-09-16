import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasProfile } from '@/lib/supabase/profile'

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  redirect((await hasProfile(supabase, user.id)) ? '/portal' : '/dashboard')
}
