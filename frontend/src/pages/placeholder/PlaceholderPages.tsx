import { PageTitle } from "../../shared/ui/PageTitle/PageTitle"
import styles from "./PlaceholderPages.module.css"

/*
 * Sections of the app that are not built yet. They are real routes already, so the links to them
 * work and each task only has to replace its page here with the real one.
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

// TODO(#8): replace with the knowledge base; it is not in the header, like in the design references
export function KnowledgeBasePage() {
  return (
    <Placeholder title="База знаний" subtitle="Всё, что нужно для уверенного старта в команде" />
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
