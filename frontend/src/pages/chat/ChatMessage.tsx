import { useState } from "react"
import Markdown, { type Components } from "react-markdown"
import { LogoMark } from "../../shared/ui/Logo/Logo"
import type { ChatMessage as Message } from "./chatApi"
import styles from "./ChatPage.module.css"

const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" })

const markdownComponents: Components = {
  a({ children, href }) {
    if (!href) return <span>{children}</span>

    return (
      <a className={styles.referenceLink} href={href}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M5 2h7l4 4v11.5H5zM12 2v4h4M7.5 10H13m-5.5 3H13" />
        </svg>
        {children}
        <span aria-hidden="true">↗</span>
      </a>
    )
  },
}

export function ChatMessage({ message, initial }: { message: Message; initial: string }) {
  const assistant = message.role === "assistant"
  const [copyStatus, setCopyStatus] = useState("")

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopyStatus("Скопировано")
    } catch {
      setCopyStatus("Не удалось скопировать")
    }
  }

  return (
    <article
      className={`${styles.message} ${assistant ? styles.assistant : styles.user}`}
      aria-label={assistant ? "AI Buddy" : "Вы"}
    >
      <span className={styles.messageAvatar} aria-hidden="true">
        {assistant ? <LogoMark /> : initial}
      </span>
      <div className={styles.messageBody}>
        <time className={styles.time} dateTime={message.created_at}>
          {timeFormat.format(new Date(message.created_at))}
        </time>
        <div className={styles.bubble}>
          <Markdown skipHtml components={assistant ? markdownComponents : undefined}>
            {message.content}
          </Markdown>
        </div>
        {assistant && (
          <div className={styles.messageActions}>
            <button className={styles.copy} type="button" onClick={copy}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
                <rect x="3" y="4.5" width="7.5" height="9" rx="1" />
                <path d="M5.5 4.5V2.5H13v9h-2.5" />
              </svg>
              Копировать
            </button>
            <span role="status">{copyStatus}</span>
          </div>
        )}
      </div>
    </article>
  )
}
