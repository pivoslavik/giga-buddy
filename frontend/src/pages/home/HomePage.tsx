import { getRouteApi } from "@tanstack/react-router"
import { Logo } from "../../shared/ui/Logo/Logo"
import styles from "./HomePage.module.css"

const authenticatedRoute = getRouteApi("/authenticated")

// TODO(#5): replace with the main page ("Первые шаги", FAQ and the header)
export function HomePage() {
  const { user } = authenticatedRoute.useRouteContext()

  return (
    <main className={styles.page}>
      <Logo />
      <h1 className={styles.title}>Привет, {user.display_name}!</h1>
      <p className={styles.text}>Главная страница скоро появится.</p>
    </main>
  )
}
