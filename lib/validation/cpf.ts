export function normalizeCPF(rawCpf: string): string {
  return rawCpf.replace(/\D/g, '')
}

export function isValidCPF(rawCpf: string): boolean {
  const cpf = normalizeCPF(rawCpf)

  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digits = cpf.split('').map(Number)

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i)
  }
  let rest = sum % 11
  const firstCheck = rest < 2 ? 0 : 11 - rest
  if (firstCheck !== digits[9]) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i)
  }
  rest = sum % 11
  const secondCheck = rest < 2 ? 0 : 11 - rest
  if (secondCheck !== digits[10]) return false

  return true
}
