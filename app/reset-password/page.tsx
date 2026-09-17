import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth-shell'
import formStyles from '@/components/auth-form.module.css'
import { updatePassword } from './actions'

export const metadata: Metadata = {
  title: 'CRC Incorporações — Nova senha',
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <AuthShell title="Nova senha">
      <form action={updatePassword} className={formStyles.form}>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="password">
            Nova senha
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
          Salvar nova senha
        </button>
      </form>
    </AuthShell>
  )
}
