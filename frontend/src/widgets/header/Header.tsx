import { getRouteApi, Link } from "@tanstack/react-router"
import { Avatar } from "../../shared/ui/Avatar/Avatar"
import { Logo } from "../../shared/ui/Logo/Logo"
import styles from "./Header.module.css"

const authenticatedRoute = getRouteApi("/authenticated")

const NAV_ITEMS = [
  // every path starts with "/", so the main page is active only on itself
  { to: "/", label: "Главная", exact: true },
  { to: "/profile", label: "Личный кабинет", exact: false },
  { to: "/chat", label: "Чат", exact: false },
] as const

/** Header of the app pages: the logo, sections of the app and the current user. */
export function Header() {
  const { user } = authenticatedRoute.useRouteContext()

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logo} aria-label="AI Buddy, на главную">
        <Logo />
      </Link>

      <nav className={styles.nav} aria-label="Разделы">
        <ul className={styles.navList}>
          {NAV_ITEMS.map(({ to, label, exact }) => (
            <li key={to}>
              <Link to={to} className={styles.navLink} activeOptions={{ exact }}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.user}>
        <Avatar name={user.display_name || user.username} />
      </div>
    </header>
  )
}
