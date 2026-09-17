import type { Metadata } from 'next'
import { signup } from './actions'

export const metadata: Metadata = {
  title: 'CRM — Criar conta',
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { error, sent } = await searchParams

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Criar conta</h1>
      {sent ? (
        <p>Confirme seu email para ativar sua conta.</p>
      ) : (
        <form action={signup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            Nome
            <input name="name" type="text" required style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            CPF
            <input name="cpf" type="text" required placeholder="000.000.000-00" style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            Data de nascimento
            <input name="birthDate" type="date" required style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            Telefone
            <input name="phone" type="tel" required style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            Email
            <input name="email" type="email" required style={{ display: 'block', width: '100%' }} />
          </label>
          <label>
            Senha
            <input name="password" type="password" required minLength={6} style={{ display: 'block', width: '100%' }} />
          </label>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit">Criar conta</button>
        </form>
      )}
      <p>
        <a href="/login" style={{ color: '#0645ad', textDecoration: 'underline' }}>Já tenho conta</a>
      </p>
    </main>
  )
}
