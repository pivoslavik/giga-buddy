import { useQuery } from "@tanstack/react-query"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { SubmitEvent } from "react"
import { AppHeader } from "../../shared/ui/AppHeader/AppHeader"
import { ArrowRightIcon } from "../../shared/ui/icons/icons"
import { Logo } from "../../shared/ui/Logo/Logo"
import type { ChatMessage as Message, ChatTransport } from "./chatApi"
import { ChatEmptyState } from "./ChatEmptyState"
import { ChatMessage } from "./ChatMessage"
import styles from "./ChatPage.module.css"
import { fragmentFadeDuration, type StreamFragment } from "./streamingMarkdown"

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

const emptyReply = { content: "", fragments: [] as StreamFragment[] }
const scrollButtonDistance = 96
const atBottomDistance = 2

function scrollBottom(element: HTMLElement) {
  return Math.max(0, element.scrollHeight - element.clientHeight)
}

const arrowEaseOut = "cubic-bezier(0.16, 1, 0.3, 1)"
const arrowRest = { transform: "none", opacity: 1 }
const arrowMotions = {
  hover: {
    duration: 620,
    frames: [
      { offset: 0.22, transform: "translate(-2px, 5px) rotate(-9deg) scale(0.93)" },
      { offset: 0.72, transform: "translate(3px, -6px) rotate(8deg) scale(1.13)" },
      { transform: "translate(2px, -4px) rotate(5deg) scale(1.08)" },
    ],
  },
  rest: { duration: 540, frames: [arrowRest] },
  launch: {
    duration: 720,
    frames: [
      { offset: 0.24, transform: "translate(3px, -11px) rotate(8deg) scale(1.16)", opacity: 1 },
      { offset: 0.5, transform: "translate(7px, -19px) rotate(11deg) scale(1.12)", opacity: 0 },
      { offset: 0.51, transform: "translate(-2px, 8px) rotate(-5deg) scale(0.94)", opacity: 0 },
      arrowRest,
    ],
  },
} satisfies Record<string, { duration: number; frames: Keyframe[] }>

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
  const [{ content: partial, fragments }, setPartial] = useState(emptyReply)
  const [newReplyId, setNewReplyId] = useState<string>()
  const [sendError, setSendError] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const request = useRef<AbortController | null>(null)
  const timeline = useRef<HTMLDivElement>(null)
  const scrollButton = useRef<HTMLButtonElement>(null)
  const sendArrow = useRef<HTMLSpanElement>(null)
  const arrowAnimation = useRef<Animation | null>(null)
  const followTail = useRef(true)
  const smoothTop = useRef<number | null>(null)
  const latestScroll = useRef<{ frame: number; top: number } | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
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

  useEffect(
    () => () => {
      request.current?.abort()
      if (latestScroll.current) cancelAnimationFrame(latestScroll.current.frame)
    },
    [],
  )

  useLayoutEffect(() => {
    const element = timeline.current
    if (!element) return

    const target = scrollBottom(element)
    const previous = lastLayout.current
    lastLayout.current = { target, outgoing, replyId: newReplyId }
    if (latestScroll.current) return
    if (!followTail.current) {
      setShowScrollButton(target - element.scrollTop > scrollButtonDistance)
      return
    }

    if (target === previous?.target || Math.abs(target - element.scrollTop) <= 1) return

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

  function stopLatestScroll() {
    if (latestScroll.current) cancelAnimationFrame(latestScroll.current.frame)
    latestScroll.current = null
  }

  function updateScrollPosition(element: HTMLDivElement) {
    const bottom = scrollBottom(element)
    const top = element.scrollTop
    const motion = latestScroll.current
    if (motion) {
      if (top + 1 >= Math.min(motion.top, bottom)) return
      stopLatestScroll()
    }

    const atBottom = bottom - top <= atBottomDistance
    if (smoothTop.current !== null && top >= smoothTop.current && !atBottom) {
      smoothTop.current = top
      return
    }
    smoothTop.current = null
    followTail.current = atBottom
    setShowScrollButton(bottom - top > scrollButtonDistance)
  }

  function stopFollowing(element: HTMLDivElement) {
    followTail.current = false
    stopLatestScroll()
    if (smoothTop.current !== null) {
      smoothTop.current = null
      element.scrollTo({ top: element.scrollTop, behavior: "instant" })
    }
    setShowScrollButton(scrollBottom(element) - element.scrollTop > scrollButtonDistance)
  }

  function scrollToLatest() {
    const element = timeline.current
    if (!element || latestScroll.current) return

    function finish(element: HTMLDivElement, bottom: number) {
      stopLatestScroll()
      element.scrollTop = bottom
      followTail.current = true
      if (document.activeElement === scrollButton.current) element.focus({ preventScroll: true })
      setShowScrollButton(false)
    }

    if (!window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches) {
      smoothTop.current = null
      finish(element, scrollBottom(element))
      return
    }

    stopFollowing(element)
    const motion = { frame: 0, top: element.scrollTop }
    latestScroll.current = motion
    let startedAt: number | undefined
    let lastFrameAt: number | undefined

    function advance(now: number) {
      if (latestScroll.current !== motion || !element) return
      const bottom = scrollBottom(element)
      const top = element.scrollTop
      if (top + 1 < Math.min(motion.top, bottom)) {
        stopFollowing(element)
        return
      }

      const distance = bottom - top
      if (distance <= 1) {
        finish(element, bottom)
        return
      }

      // Keep one animation running against the live bottom while the reply grows.
      startedAt ??= now
      const elapsed = Math.min(32, now - (lastFrameAt ?? now - 16))
      lastFrameAt = now
      const ramp = Math.min(1, (now - startedAt + 16) / 96)
      const step = Math.max(1, distance * (1 - Math.exp((-elapsed * ramp) / 70)))
      element.scrollTop = Math.min(bottom, top + step)
      motion.top = element.scrollTop
      motion.frame = requestAnimationFrame(advance)
    }

    motion.frame = requestAnimationFrame(advance)
  }

  function moveArrow(motion: keyof typeof arrowMotions) {
    const element = sendArrow.current
    const previous = arrowAnimation.current
    if (
      !element?.animate ||
      !window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches
    )
      return
    if (motion !== "launch" && previous?.id === "launch" && previous.playState === "running") return
    if (motion === "rest" && previous?.id !== "hover") return

    // Start each gesture at the arrow's current position, including interrupted hovers.
    const { transform, opacity } = getComputedStyle(element)
    previous?.cancel()
    const { duration, frames } = arrowMotions[motion]
    const startingEase = motion === "hover" ? "cubic-bezier(0.4, 0, 0.2, 1)" : arrowEaseOut
    const animation = element.animate(
      [
        { transform, opacity, easing: startingEase },
        ...frames.map((frame) => ({ easing: arrowEaseOut, ...frame })),
      ],
      { duration, fill: motion === "hover" ? "forwards" : "none" },
    )
    animation.id = motion
    arrowAnimation.current = animation
  }

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = draft.trim()
    if (!message || request.current || !history.isSuccess) return

    moveArrow("launch")
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
          const receivedAt = performance.now()
          setPartial((current) => ({
            content: current.content + delta,
            fragments: [
              ...current.fragments.filter(
                (fragment) => receivedAt - fragment.receivedAt < fragmentFadeDuration,
              ),
              {
                start: current.content.length,
                end: current.content.length + delta.length,
                receivedAt,
              },
            ],
          }))
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
        setPartial(emptyReply)
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
            className={styles.timelineFrame}
            onWheel={(event) => {
              const element = timeline.current
              if (element && event.deltaY < 0 && -event.deltaY > Math.abs(event.deltaX)) {
                stopFollowing(element)
              }
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0]
              touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
            }}
            onTouchMove={(event) => {
              const touch = event.touches[0]
              const start = touchStart.current
              const element = timeline.current
              if (
                element &&
                touch &&
                start &&
                touch.clientY - start.y > Math.max(3, Math.abs(touch.clientX - start.x))
              ) {
                stopFollowing(element)
              }
            }}
            onKeyDown={(event) => {
              const element = timeline.current
              if (
                element &&
                (["ArrowUp", "PageUp", "Home"].includes(event.key) ||
                  (event.key === " " && event.shiftKey))
              ) {
                stopFollowing(element)
              }
            }}
          >
            <div
              ref={timeline}
              className={styles.timeline}
              role="log"
              aria-label="История сообщений"
              tabIndex={-1}
              onScroll={(event) => updateScrollPosition(event.currentTarget)}
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
              {history.isSuccess && messages.length === 0 && <ChatEmptyState />}
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
                      entering={message === outgoing || message.id === newReplyId}
                      streamFragments={message.id === "pending-assistant" ? fragments : undefined}
                      onEnterEnd={
                        message.id === newReplyId ? () => setNewReplyId(undefined) : undefined
                      }
                    />
                  </div>
                )
              })}
              {sending && !partial && (
                <p className={styles.pending} role="status">
                  <span className={styles.waitingLabel}>AI Buddy готовит ответ…</span>
                </p>
              )}
            </div>
            {messages.length > 0 && (
              <button
                ref={scrollButton}
                className={styles.scrollToLatest}
                type="button"
                aria-label="Прокрутить вниз"
                aria-hidden={!showScrollButton}
                tabIndex={showScrollButton ? 0 : -1}
                data-visible={showScrollButton || undefined}
                onClick={scrollToLatest}
              >
                <span className={styles.scrollToLatestArrow}>
                  <ArrowRightIcon />
                </span>
              </button>
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
              onPointerEnter={(event) => {
                if (
                  !event.currentTarget.disabled &&
                  event.pointerType !== "touch" &&
                  window.matchMedia?.("(hover: hover) and (pointer: fine)").matches
                ) {
                  moveArrow("hover")
                }
              }}
              onPointerLeave={() => moveArrow("rest")}
            >
              <span ref={sendArrow} className={styles.sendArrow}>
                <ArrowRightIcon />
              </span>
            </button>
          </form>
        </section>

        <p className={styles.notice}>ИИ может ошибаться. Проверяйте важную информацию.</p>
      </main>
    </div>
  )
}
