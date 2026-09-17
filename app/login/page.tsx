import { AuthShell } from '@/components/auth-shell'
import formStyles from '@/components/auth-form.module.css'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <AuthShell title="Entrar">
      <form action={login} className={formStyles.form}>
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
          <input id="password" name="password" type="password" required className={formStyles.input} />
        </div>
        {error && <p className={formStyles.error}>{error}</p>}
        <button type="submit" className={formStyles.button}>
          Entrar
        </button>
      </form>
      <div className={formStyles.links}>
        <a href="/forgot-password">Esqueci minha senha</a>
        <a href="/signup">Criar conta</a>
      </div>
    </AuthShell>
  )
}
