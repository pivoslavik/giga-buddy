import { useQuery } from "@tanstack/react-query"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { SubmitEvent } from "react"
import { AppHeader } from "../../shared/ui/AppHeader/AppHeader"
import { ArrowRightIcon } from "../../shared/ui/icons/icons"
import { Logo } from "../../shared/ui/Logo/Logo"
import type { ChatMessage as Message, ChatTransport } from "./chatApi"
import { ChatMessage } from "./ChatMessage"
import styles from "./ChatPage.module.css"

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

interface ChatConversationProps {
  userId: number
  displayName: string
  transport: ChatTransport
}

export function ChatConversation({ userId, displayName, transport }: ChatConversationProps) {
  const history = useQuery({
    queryKey: ["chat", userId],
    queryFn: ({ signal }) => transport.load(signal),
    retry: false,
  })
  const [draft, setDraft] = useState("")
  const [outgoing, setOutgoing] = useState<Message>()
  const [partial, setPartial] = useState("")
  const [sendError, setSendError] = useState(false)
  const request = useRef<AbortController | null>(null)
  const timeline = useRef<HTMLDivElement>(null)
  const followTail = useRef(true)

  const initial = Array.from(displayName.trim())[0]?.toLocaleUpperCase("ru-RU") || "?"
  const sending = Boolean(outgoing)
  const messages = [...(history.data ?? [])]
  if (outgoing) {
    messages.push(outgoing)
    if (partial) {
      messages.push({ ...outgoing, id: "pending-assistant", role: "assistant", content: partial })
    }
  }

  useEffect(() => () => request.current?.abort(), [])

  useLayoutEffect(() => {
    const element = timeline.current
    if (element && followTail.current) element.scrollTop = element.scrollHeight
  }, [history.data, outgoing, partial])

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = draft.trim()
    if (!message || request.current || !history.isSuccess) return

    const controller = new AbortController()
    request.current = controller
    followTail.current = true
    setDraft("")
    setSendError(false)
    setOutgoing({
      id: "pending-user",
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    })

    try {
      await transport.send(message, controller.signal, (delta) => {
        if (!controller.signal.aborted) setPartial((current) => current + delta)
      })
      if (!controller.signal.aborted) await history.refetch()
    } catch {
      if (!controller.signal.aborted) {
        setSendError(true)
        setDraft((current) => current || message)
      }
    } finally {
      request.current = null
      if (!controller.signal.aborted) {
        setOutgoing(undefined)
        setPartial("")
      }
    }
  }

  const today = new Date().toDateString()

  return (
    <div className={styles.page}>
      <AppHeader initial={initial} activePage="chat" />

      <main>
        <div className={styles.intro}>
          <h1>Чат с AI Buddy</h1>
          <p>Задавай вопросы о проекте, задачах и работе команды</p>
        </div>

        <section className={styles.panel} aria-label="Чат с AI Buddy">
          <header className={styles.panelHeader}>
            <Logo className={styles.buddyLogo} />
            <span className={styles.connection} data-offline={!history.isSuccess || undefined}>
              {history.isPending ? "Подключение…" : history.isError ? "Нет связи" : "На связи"}
            </span>
          </header>

          <div
            ref={timeline}
            className={styles.timeline}
            role="log"
            aria-label="История сообщений"
            onScroll={(event) => {
              const { scrollHeight, clientHeight, scrollTop } = event.currentTarget
              followTail.current = scrollHeight - clientHeight - scrollTop < 48
            }}
          >
            {history.isPending && <p className={styles.state}>Загружаем историю…</p>}
            {history.isError && (
              <div className={styles.state}>
                <p role="alert">Не удалось загрузить историю.</p>
                <button
                  type="button"
                  onClick={() => void history.refetch()}
                  disabled={history.isFetching}
                >
                  Повторить
                </button>
              </div>
            )}
            {history.isSuccess && messages.length === 0 && (
              <p className={styles.state}>Напиши первое сообщение.</p>
            )}
            {messages.map((message, index) => {
              const date = new Date(message.created_at)
              const day = date.toDateString()
              const previousDay = index && new Date(messages[index - 1].created_at).toDateString()
              return (
                <div key={message.id}>
                  {day !== previousDay && (
                    <p className={styles.day}>
                      {day === today ? "Сегодня" : dateFormat.format(date)}
                    </p>
                  )}
                  <ChatMessage message={message} initial={initial} />
                </div>
              )
            })}
            {sending && !partial && (
              <p className={styles.pending} role="status">
                AI Buddy готовит ответ…
              </p>
            )}
          </div>

          {sendError && (
            <p className={styles.sendError} role="alert">
              Не удалось получить ответ. Попробуй ещё раз.
            </p>
          )}
          <form className={styles.composer} onSubmit={send}>
            <input
              type="text"
              aria-label="Сообщение"
              placeholder="Напиши сообщение..."
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              autoComplete="off"
            />
            <button
              type="submit"
              aria-label="Отправить сообщение"
              disabled={sending || !history.isSuccess}
            >
              <ArrowRightIcon />
            </button>
          </form>
        </section>

        <p className={styles.notice}>ИИ может ошибаться. Проверяйте важную информацию.</p>
      </main>
    </div>
  )
}
