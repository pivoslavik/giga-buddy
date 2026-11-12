import { Outlet } from "@tanstack/react-router"
import { Header } from "../../widgets/header/Header"
import styles from "./AppLayout.module.css"

/** Frame of every page behind the session guard: the header and the page under it. */
export function AppLayout() {
  return (
    <div className={styles.layout}>
      <div className={styles.container}>
        <Header />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
