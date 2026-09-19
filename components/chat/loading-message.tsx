import styles from './chat-message.module.css'

export function LoadingMessage() {
  return (
    <div className={`${styles.row} ${styles.rowAssistant}`}>
      <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>Consultando suas informações...</div>
    </div>
  )
}
