import { getRouteApi } from "@tanstack/react-router"
import { useLogout } from "../../features/auth/logout"
import { Avatar } from "../../shared/ui/Avatar/Avatar"
import { PageTitle } from "../../shared/ui/PageTitle/PageTitle"
import shield from "./shield.webp"
import styles from "./ProfilePage.module.css"

const authenticatedRoute = getRouteApi("/authenticated")

const roleLabels = new Map([
  ["intern", "Стажёр"],
  ["admin", "Администратор"],
])

export function ProfilePage() {
  const { user } = authenticatedRoute.useRouteContext()
  const name = user.display_name.trim() || user.username
  const logout = useLogout()

  return (
    <div className={styles.page}>
      <PageTitle title="Личный кабинет" subtitle="Твои данные аккаунта" />

      <div className={styles.content}>
        <section className={styles.card} aria-labelledby="account-title">
          <h2 id="account-title" className={styles.title}>
            Данные аккаунта
          </h2>

          <div className={styles.identity}>
            <Avatar name={name} className={styles.avatar} />
            <div>
              <p className={styles.name}>{name}</p>
              <span className={styles.badge}>{roleLabels.get(user.role) ?? user.role}</span>
            </div>
          </div>

          <dl className={styles.fields}>
            <div className={styles.field}>
              <dt>Логин</dt>
              <dd>{user.username}</dd>
            </div>
            <div className={styles.field}>
              <dt>Электронная почта</dt>
              <dd>{user.email}</dd>
            </div>
          </dl>

          <div className={styles.actions}>
            <button type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>
              {logout.isPending ? "Выходим…" : "Выйти из аккаунта"}
            </button>
            <button type="button" disabled>
              Изменить пароль
            </button>
          </div>
          {logout.isError && (
            <p className={styles.error} role="alert">
              Не удалось выйти. Попробуй ещё раз чуть позже
            </p>
          )}
        </section>

        <img className={styles.shield} src={shield} alt="" width={512} height={512} />
      </div>
    </div>
  )
}
