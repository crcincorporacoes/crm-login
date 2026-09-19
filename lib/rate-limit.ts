const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 10

// Estado em memória, por instância do processo — suficiente para o
// requisito da spec ("Rate limiting básico no endpoint de chat, por
// usuário"). Não é distribuído: numa implantação com múltiplas instâncias
// cada uma teria sua própria contagem. Aceitável aqui porque a spec pede
// explicitamente algo "básico"; migrar para um limiter externo (ex.
// Redis) se isso deixar de ser suficiente.
const requestTimestampsByUser = new Map<string, number[]>()

/**
 * Retorna true se o usuário já fez `MAX_REQUESTS_PER_WINDOW` requisições
 * nos últimos `WINDOW_MS` milissegundos (janela deslizante) e a
 * requisição atual deve ser rejeitada.
 */
export function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const recentTimestamps = (requestTimestampsByUser.get(userId) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS
  )

  if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    requestTimestampsByUser.set(userId, recentTimestamps)
    return true
  }

  recentTimestamps.push(now)
  requestTimestampsByUser.set(userId, recentTimestamps)
  return false
}
