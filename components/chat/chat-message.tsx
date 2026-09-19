import type { MessageContent } from '@/lib/ai/message-content'
import styles from './chat-message.module.css'

function MessageBody({ content }: { content: MessageContent }) {
  switch (content.type) {
    case 'text':
      return <>{content.text}</>
    case 'notice':
      return <>{content.message}</>
    case 'financial_installment':
      return (
        <div>
          <p>{content.message}</p>
          {content.actions?.map((action) => (
            <div key={action.label} className={styles.actions}>
              <button type="button" className={styles.actionButton}>
                {action.label}
              </button>
            </div>
          ))}
        </div>
      )
    case 'unit_list':
      return (
        <div>
          <p>{content.message}</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Unidade</th>
                <th>Andar</th>
                <th>Área</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {content.units.map((unit) => (
                <tr key={unit.code}>
                  <td>{unit.code}</td>
                  <td>{unit.floor}º</td>
                  <td>{unit.areaM2} m²</td>
                  <td>R$ {unit.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'document':
      return (
        <div>
          <p>{content.message}</p>
          <a href={content.documentUrl} target="_blank" rel="noreferrer" className={styles.actionButton}>
            {content.label}
          </a>
        </div>
      )
  }
}

export function ChatMessage({ role, content }: { role: 'user' | 'assistant'; content: MessageContent }) {
  return (
    <div className={`${styles.row} ${role === 'user' ? styles.rowUser : styles.rowAssistant}`}>
      <div className={`${styles.bubble} ${role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}`}>
        <MessageBody content={content} />
      </div>
    </div>
  )
}
