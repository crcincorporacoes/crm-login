import Image from 'next/image'
import Link from 'next/link'
import crcMark from '@/public/brand/crc-mark.png'
import { logout } from '@/lib/supabase/logout'
import styles from './app-shell.module.css'

export function AppShell({
  heading,
  fullBleed,
  children,
}: {
  heading?: string
  fullBleed?: boolean
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
      <main className={fullBleed ? styles.mainFullBleed : styles.main}>
        <div className={fullBleed ? styles.contentFullBleed : styles.content}>
          {!fullBleed && heading ? <h1 className={styles.heading}>{heading}</h1> : null}
          {children}
        </div>
      </main>
    </div>
  )
}
