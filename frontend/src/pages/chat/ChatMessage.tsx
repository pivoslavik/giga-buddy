import { useLayoutEffect, useRef, useState } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { LogoMark } from "../../shared/ui/Logo/Logo"
import type { ChatMessage as Message } from "./chatApi"
import styles from "./ChatPage.module.css"
import {
  fragmentFadeDuration,
  markStreamingMarkdown,
  type StreamFragment,
} from "./streamingMarkdown"

const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" })
const remarkPlugins = [remarkGfm]

const markdownComponents: Components = {
  table({ children }) {
    return (
      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Таблица в сообщении"
        tabIndex={0}
      >
        <table>{children}</table>
      </div>
    )
  },
}

const assistantMarkdownComponents: Components = {
  ...markdownComponents,
  a({ children, href }) {
    if (!href) return <span>{children}</span>

    return (
      <a className={styles.referenceLink} href={href}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M5 2h7l4 4v11.5H5zM12 2v4h4M7.5 10H13m-5.5 3H13" />
        </svg>
        <span className={styles.referenceLabel}>{children}</span>
        <span aria-hidden="true">↗</span>
      </a>
    )
  },
}

interface ChatMessageProps {
  message: Message
  initial: string
  entering: boolean
  streamFragments?: readonly StreamFragment[]
  onEnterEnd?: () => void
}

export function ChatMessage({
  message,
  initial,
  entering,
  streamFragments,
  onEnterEnd,
}: ChatMessageProps) {
  const assistant = message.role === "assistant"
  const [copyStatus, setCopyStatus] = useState("")
  const bubble = useRef<HTMLDivElement>(null)
  const animations = useRef(new WeakMap<HTMLElement, { end: number; animation: Animation }>())

  useLayoutEffect(() => {
    if (
      !streamFragments?.length ||
      !window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches
    )
      return

    const fragments = new Map(streamFragments.map((fragment) => [fragment.end, fragment]))
    for (const element of bubble.current?.querySelectorAll<HTMLElement>("[data-stream-fragment]") ??
      []) {
      const end = Number(element.dataset.streamFragment)
      const previous = animations.current.get(element)
      if (previous?.end === end) continue
      previous?.animation.cancel()

      const fragment = fragments.get(end)
      if (
        !fragment ||
        !element.animate ||
        performance.now() - fragment.receivedAt >= fragmentFadeDuration
      )
        continue
      const animation = element.animate([{ opacity: 0.3 }, { opacity: 1 }], {
        duration: fragmentFadeDuration,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "backwards",
      })
      // Reparsed Markdown can replace the DOM node. Keep the fragment's original clock.
      animation.startTime = fragment.receivedAt
      animations.current.set(element, { end, animation })
    }
  }, [message.content, streamFragments])

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
      data-entering={entering || undefined}
      data-streaming={streamFragments ? true : undefined}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onEnterEnd?.()
      }}
    >
      <span className={styles.messageAvatar} aria-hidden="true">
        {assistant ? <LogoMark /> : initial}
      </span>
      <div className={styles.messageBody}>
        <time className={styles.time} dateTime={message.created_at}>
          {timeFormat.format(new Date(message.created_at))}
        </time>
        <div ref={bubble} className={styles.bubble}>
          <Markdown
            skipHtml
            components={assistant ? assistantMarkdownComponents : markdownComponents}
            remarkPlugins={remarkPlugins}
            rehypePlugins={
              streamFragments
                ? [markStreamingMarkdown(message.content, streamFragments, styles.streamFragment)]
                : undefined
            }
          >
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
            <span role="status">
              {copyStatus && <span className={styles.copyFeedback}>{copyStatus}</span>}
            </span>
          </div>
        )}
      </div>
    </article>
  )
}
