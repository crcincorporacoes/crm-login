import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth-shell'
import formStyles from '@/components/auth-form.module.css'
import { signup } from './actions'

export const metadata: Metadata = {
  title: 'CRC Incorporações — Criar conta',
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { error, sent } = await searchParams

  return (
    <AuthShell title="Criar conta">
      {sent ? (
        <p className={formStyles.notice}>Confirme seu email para ativar sua conta.</p>
      ) : (
        <form action={signup} className={formStyles.form}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="name">
              Nome
            </label>
            <input id="name" name="name" type="text" required className={formStyles.input} />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="cpf">
              CPF
            </label>
            <input
              id="cpf"
              name="cpf"
              type="text"
              required
              placeholder="000.000.000-00"
              className={formStyles.input}
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="birthDate">
              Data de nascimento
            </label>
            <input id="birthDate" name="birthDate" type="date" required className={formStyles.input} />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="phone">
              Telefone
            </label>
            <input id="phone" name="phone" type="tel" required className={formStyles.input} />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required className={formStyles.input} />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              className={formStyles.input}
            />
          </div>
          {error && <p className={formStyles.error}>{error}</p>}
          <button type="submit" className={formStyles.button}>
            Criar conta
          </button>
        </form>
      )}
      <div className={formStyles.links}>
        <a href="/login">Já tenho conta</a>
      </div>
    </AuthShell>
  )
}
