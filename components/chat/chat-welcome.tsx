import { SuggestedQuestions } from './suggested-questions'

const CLIENT_SUGGESTIONS = [
  'Segunda via de boleto',
  'Minhas parcelas',
  'Previsão de entrega',
  'Meus documentos',
]

const CORRETOR_SUGGESTIONS = [
  'Unidades disponíveis',
  'Tabela de preços atual',
  'Diferenciais do empreendimento',
]

function greetingForNow(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function ChatWelcome({
  firstName,
  role,
  onSelectSuggestion,
}: {
  firstName: string
  role: 'client' | 'corretor'
  onSelectSuggestion: (question: string) => void
}) {
  const question = role === 'client' ? 'O que você deseja saber?' : 'Como posso ajudar na sua venda?'
  const suggestions = role === 'client' ? CLIENT_SUGGESTIONS : CORRETOR_SUGGESTIONS

  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-display), sans-serif', fontWeight: 800, fontSize: 32, margin: 0, color: 'var(--brand-ink)' }}>
        {greetingForNow()}, {firstName}.
        <br />
        {question}
      </h1>
      <SuggestedQuestions questions={suggestions} onSelect={onSelectSuggestion} />
    </div>
  )
}
