import Image from 'next/image'
import Link from 'next/link'
import crcMark from '@/public/brand/crc-mark.png'
import { logout } from '@/lib/supabase/logout'
import styles from './app-shell.module.css'

export function AppShell({
  heading,
  children,
}: {
  heading: string
  children?: React.ReactNode
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/login" aria-label="Ir para o login">
          <Image src={crcMark} alt="CRC Incorporações" className={styles.logo} priority />
        </Link>
        <form action={logout}>
          <button type="submit" className={styles.logoutButton}>
            Sair
          </button>
        </form>
      </header>
      <main className={styles.main}>
        <div className={styles.content}>
          <h1 className={styles.heading}>{heading}</h1>
          {children}
        </div>
      </main>
    </div>
  )
}
