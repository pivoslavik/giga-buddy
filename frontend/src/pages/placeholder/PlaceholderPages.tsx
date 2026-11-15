import { PageTitle } from "../../shared/ui/PageTitle/PageTitle"
import styles from "./PlaceholderPages.module.css"

/*
 * Sections of the app that are not built yet. They are real routes already, so the links to them
 * work and each task only has to replace its page here with the real one.
 */

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
