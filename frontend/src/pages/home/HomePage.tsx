import { getRouteApi } from "@tanstack/react-router"
import styles from "./HomePage.module.css"

const authenticatedRoute = getRouteApi("/authenticated")

// TODO(#5): replace with the main page ("Первые шаги", FAQ)
export function HomePage() {
  const { user } = authenticatedRoute.useRouteContext()

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Привет, {user.display_name}!</h1>
      <p className={styles.text}>Главная страница скоро появится.</p>
    </div>
  )
}
