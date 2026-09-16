import { updatePassword } from './actions'

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Nova senha</h1>
      <form action={updatePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          Nova senha
          <input name="password" type="password" required minLength={6} style={{ display: 'block', width: '100%' }} />
        </label>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">Salvar nova senha</button>
      </form>
    </main>
  )
}
