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
  const [newReplyId, setNewReplyId] = useState<string>()
  const [sendError, setSendError] = useState(false)
  const request = useRef<AbortController | null>(null)
  const timeline = useRef<HTMLDivElement>(null)
  const followTail = useRef(true)
  const smoothTop = useRef<number | null>(null)
  const lastLayout = useRef<{ target: number; outgoing?: Message; replyId?: string }>(undefined)

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
    if (!element) return

    const target = Math.max(0, element.scrollHeight - element.clientHeight)
    const previous = lastLayout.current
    lastLayout.current = { target, outgoing, replyId: newReplyId }
    if (
      !followTail.current ||
      target === previous?.target ||
      Math.abs(target - element.scrollTop) <= 1
    )
      return

    const newMessage =
      (outgoing && outgoing !== previous?.outgoing) ||
      (newReplyId && newReplyId !== previous?.replyId)
    if (
      newMessage &&
      !partial &&
      target > element.scrollTop &&
      window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches
    ) {
      smoothTop.current = element.scrollTop
      element.scrollTo({ top: target, behavior: "smooth" })
    } else {
      // A growing reply follows the new bottom immediately, even during an earlier smooth scroll.
      smoothTop.current = null
      element.scrollTop = target
    }
  }, [history.data, outgoing, partial, newReplyId])

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = draft.trim()
    if (!message || request.current || !history.isSuccess) return

    const controller = new AbortController()
    request.current = controller
    setDraft("")
    setSendError(false)
    setOutgoing({
      id: "pending-user",
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    })

    let showedPartial = false
    try {
      await transport.send(message, controller.signal, (delta) => {
        if (!controller.signal.aborted && delta) {
          showedPartial = true
          setPartial((current) => current + delta)
        }
      })
      if (!controller.signal.aborted) {
        const result = await history.refetch()
        if (!controller.signal.aborted && !showedPartial) {
          const reply = result.data?.findLast((entry) => entry.role === "assistant")
          if (reply && !history.data.some((entry) => entry.id === reply.id)) setNewReplyId(reply.id)
        }
      }
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
              const atBottom = scrollHeight - clientHeight - scrollTop <= 2
              if (smoothTop.current !== null && scrollTop >= smoothTop.current && !atBottom) {
                smoothTop.current = scrollTop
                return
              }
              smoothTop.current = null
              followTail.current = atBottom
            }}
            onWheel={(event) => {
              if (event.deltaY < 0 && smoothTop.current !== null) {
                smoothTop.current = null
                followTail.current = false
                event.currentTarget.scrollTo({
                  top: event.currentTarget.scrollTop,
                  behavior: "instant",
                })
              }
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
                  <ChatMessage
                    message={message}
                    initial={initial}
                    entering={
                      message === outgoing ||
                      message.id === "pending-assistant" ||
                      message.id === newReplyId
                    }
                    streaming={message.id === "pending-assistant"}
                    onEnterEnd={
                      message.id === newReplyId ? () => setNewReplyId(undefined) : undefined
                    }
                  />
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
              data-sending={sending || undefined}
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
