import { requestPasswordReset } from './actions'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { error, sent } = await searchParams

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Esqueci minha senha</h1>
      {sent ? (
        <p>Se esse email existir, enviamos um link de redefinição de senha.</p>
      ) : (
        <form action={requestPasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            Email
            <input name="email" type="email" required style={{ display: 'block', width: '100%' }} />
          </label>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit">Enviar link</button>
        </form>
      )}
      <p>
        <a href="/login">Voltar ao login</a>
      </p>
    </main>
  )
}
