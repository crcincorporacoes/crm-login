export function SuggestedQuestions({
  questions,
  onSelect,
}: {
  questions: string[]
  onSelect: (question: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onSelect(question)}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            color: 'var(--brand-ink)',
            background: '#fff',
            border: '1px solid var(--brand-line)',
            cursor: 'pointer',
          }}
        >
          {question}
        </button>
      ))}
    </div>
  )
}
