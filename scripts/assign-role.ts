import { createClient } from '@supabase/supabase-js'

const VALID_ROLES = [
  'corretor',
  'gerente_comercial',
  'administrador',
  'financeiro',
  'pos_venda',
  'diretor',
  'engenharia',
]

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const [, , email, role] = process.argv

if (!email || !role) {
  console.error('Uso: npx tsx scripts/assign-role.ts <email> <papel>')
  console.error(`Papéis válidos: ${VALID_ROLES.join(', ')}`)
  process.exit(1)
}

if (!VALID_ROLES.includes(role)) {
  console.error(`Papel inválido "${role}". Papéis válidos: ${VALID_ROLES.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    console.error('Erro ao buscar usuário:', listError.message)
    process.exit(1)
  }

  const user = usersPage.users.find((candidate) => candidate.email === email)

  if (!user) {
    console.error(`Usuário com email ${email} não encontrado`)
    process.exit(1)
  }

  const { error: upsertError } = await supabase
    .from('team_members')
    .upsert({ id: user.id, role })

  if (upsertError) {
    console.error('Erro ao atribuir papel:', upsertError.message)
    process.exit(1)
  }

  console.log(`Papel "${role}" atribuído a ${email}`)
}

main()
