import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Entrar</h1>
      <form action={login} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          Email
          <input name="email" type="email" required style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Senha
          <input name="password" type="password" required style={{ display: 'block', width: '100%' }} />
        </label>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">Entrar</button>
      </form>
      <p>
        <a href="/forgot-password">Esqueci minha senha</a>
      </p>
    </main>
  )
}
