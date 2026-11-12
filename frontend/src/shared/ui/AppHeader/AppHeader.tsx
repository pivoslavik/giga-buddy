import { Logo } from "../Logo/Logo"
import styles from "./AppHeader.module.css"

interface AppHeaderProps {
  initial: string
  activePage: "home" | "chat"
}

export function AppHeader({ initial, activePage }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <a className={styles.brand} href="/" aria-label="AI Buddy — главная">
        <Logo className={styles.logo} />
      </a>

      <nav className={styles.nav} aria-label="Основная навигация">
        <a href="/" aria-current={activePage === "home" ? "page" : undefined}>
          Главная
        </a>
        <span aria-disabled="true">Личный кабинет</span>
        <a href="/chat" aria-current={activePage === "chat" ? "page" : undefined}>
          Чат
        </a>
      </nav>

      <span className={styles.avatar} aria-hidden="true">
        {initial}
      </span>
    </header>
  )
}
