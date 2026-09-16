'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  // Se a inserção do perfil falhar (ex.: CPF duplicado), o usuário criado em
  // auth.users fica sem perfil — aceito por ora, ver spec "Fora de escopo".
  const { error: profileError } = await supabase.from('profiles').insert({
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
