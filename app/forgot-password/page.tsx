import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth-shell'
import formStyles from '@/components/auth-form.module.css'
import { requestPasswordReset } from './actions'

export const metadata: Metadata = {
  title: 'CRC Incorporações — Esqueci minha senha',
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { error, sent } = await searchParams

  return (
    <AuthShell title="Esqueci minha senha">
      {sent ? (
        <p className={formStyles.notice}>
          Se esse email existir, enviamos um link de redefinição de senha.
        </p>
      ) : (
        <form action={requestPasswordReset} className={formStyles.form}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required className={formStyles.input} />
          </div>
          {error && <p className={formStyles.error}>{error}</p>}
          <button type="submit" className={formStyles.button}>
            Enviar link
          </button>
        </form>
      )}
      <div className={formStyles.links}>
        <a href="/login">Voltar ao login</a>
      </div>
    </AuthShell>
  )
}
