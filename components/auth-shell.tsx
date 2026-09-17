import Image from 'next/image'
import crcLogo from '@/public/brand/crc-logo.jpg'
import styles from './auth-shell.module.css'

export function AuthShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.brandPanel}>
        <Image
          src={crcLogo}
          alt="CRC Incorporações"
          className={styles.logo}
          priority
        />
      </div>
      <div className={styles.formPanel}>
        <div className={styles.formInner}>
          <h1 className={styles.heading}>{title}</h1>
          {children}
        </div>
      </div>
    </div>
  )
}
