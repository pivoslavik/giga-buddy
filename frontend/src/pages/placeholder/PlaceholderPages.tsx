import { PageTitle } from "../../shared/ui/PageTitle/PageTitle"
import styles from "./PlaceholderPages.module.css"

/*
 * Sections from the header that are not built yet. They are real routes already, so the
 * navigation works and each task only has to replace its page here with the real one.
 */

// TODO(#10): replace with the profile page
export function ProfilePage() {
  return <Placeholder title="Личный кабинет" subtitle="Твои данные и настройки аккаунта" />
}

// TODO(#12): replace with the chat
export function ChatPage() {
  return (
    <Placeholder
      title="Чат с AI Buddy"
      subtitle="Задавай вопросы о проекте, задачах и работе команды"
    />
  )
}

function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <PageTitle title={title} subtitle={subtitle} />
      <p className={styles.note}>Раздел скоро появится.</p>
    </>
  )
}
