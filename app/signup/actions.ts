'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidCPF, normalizeCPF } from '@/lib/validation/cpf'

export async function signup(formData: FormData) {
  const name = formData.get('name') as string
  const rawCpf = formData.get('cpf') as string
  const birthDate = formData.get('birthDate') as string
  const phone = formData.get('phone') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const cpf = normalizeCPF(rawCpf)

  if (!isValidCPF(cpf)) {
    redirect(`/signup?error=${encodeURIComponent('CPF inválido.')}`)
  }

  const generic = 'Não foi possível concluir o cadastro. Verifique os dados e tente novamente.'
  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=/portal`,
    },
  })

  if (signUpError || !data.user) {
    redirect(`/signup?error=${encodeURIComponent(generic)}`)
  }

  // O signUp ainda não gera sessão (confirmação de email obrigatória), então o
  // insert do perfil precisa do client administrativo para não esbarrar no RLS
  // que exige auth.uid() = id.
  const adminClient = createAdminClient()
  const { error: profileError } = await adminClient.from('profiles').insert({
    id: data.user.id,
    name,
    cpf,
    birth_date: birthDate,
    phone,
  })

  if (profileError) {
    redirect(`/signup?error=${encodeURIComponent(generic)}`)
  }

  redirect('/signup?sent=1')
}
