import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ChatConversation } from "./ChatConversation"
import { chatTransport, type ChatMessage, type ChatTransport } from "./chatApi"

const assistantMessage: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  content:
    "**Подготовка**\n\n1. Открой проект.\n\n```sh\nnpm run dev\n```\n\n[Документ](/documents/setup)\n\n<script>raw html</script>",
  created_at: "2026-11-09T12:00:00Z",
}

function renderChat(transport = chatTransport, displayName = "Гриша") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ChatConversation userId={1} displayName={displayName} transport={transport} />
    </QueryClientProvider>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish
    reject = fail
  })
  return { promise, resolve, reject }
}

/** Runs requestAnimationFrame callbacks one frame at a time, 16 ms apart. */
function stubAnimationFrames() {
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  let now = 0
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))

  return {
    frames,
    runFrame() {
      const callbacks = [...frames.values()]
      frames.clear()
      now += 16
      act(() => callbacks.forEach((callback) => callback(now)))
    },
  }
}

/** Gives the message log a scrollable size: `height()` of content in a 200px tall viewport. */
function sizeLog(log: HTMLElement, height: () => number) {
  const scrollTo = vi.fn()
  Object.defineProperties(log, {
    scrollHeight: { get: height },
    clientHeight: { value: 200 },
    scrollTo: { value: scrollTo },
  })
  return scrollTo
}

/** A transport whose reply streams through `onDelta` and ends on `done.resolve()`. */
function streamingTransport(history: ChatMessage[] = [assistantMessage]) {
  const done = deferred<string | void>()
  const reply = {
    done,
    signal: undefined as AbortSignal | undefined,
    onDelta: (() => undefined) as (delta: string) => void,
    transport: {
      load: vi.fn(async () => history),
      send: async (_message, signal, receive) => {
        reply.signal = signal
        reply.onDelta = receive
        return done.promise
      },
    } satisfies ChatTransport,
  }
  return reply
}

const scrollButtonName = { name: "Прокрутить вниз" }

function mockChatStream() {
  let stream!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller
    },
  })
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ messages: [] }))
    .mockResolvedValueOnce(
      new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } }),
    )
  vi.stubGlobal("fetch", fetchMock)

  return {
    fetchMock,
    emit(type: string, data: object) {
      stream.enqueue(new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
    },
    close: () => stream.close(),
  }
}

describe("chat", () => {
  it("shows a loading state and retries failed history, then displays Markdown", async () => {
    const initial = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(Response.json({ messages: [assistantMessage] }))
    vi.stubGlobal("fetch", fetchMock)
    renderChat()

    expect(screen.getByText("Загружаем историю…")).toBeInTheDocument()
    initial.resolve(new Response(null, { status: 503 }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить историю.")
    expect(screen.queryByRole("article")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }))

    expect(await screen.findByText("Подготовка", { selector: "strong" })).toBeInTheDocument()
    expect(screen.getByRole("article", { name: "AI Buddy" })).not.toHaveAttribute("data-entering")
    expect(screen.getByText("npm run dev", { selector: "pre code" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Документ" })).toHaveAttribute(
      "href",
      "/documents/setup",
    )
    expect(screen.queryByText("raw html")).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/chat"),
      expect.objectContaining({
        credentials: "include",
      }),
    )
  })

  it("streams tokens into one reply and reconciles the full response with history", async () => {
    const { fetchMock, emit, close } = mockChatStream()
    const history = deferred<Response>()
    fetchMock.mockReturnValueOnce(history.promise)
    renderChat()

    const emptyHeading = await screen.findByRole("heading", { name: "Напиши первое сообщение" })
    await userEvent.type(screen.getByRole("textbox"), "  Как начать?  {Enter}")

    expect(screen.getByText("Как начать?")).toBeInTheDocument()
    expect(emptyHeading).not.toBeInTheDocument()
    expect(screen.getByText("AI Buddy готовит ответ…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeDisabled()
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/chat"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Как начать?" }),
        credentials: "include",
        headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      }),
    )

    emit("token", { delta: "Часть " })
    const reply = await screen.findByRole("article", { name: "AI Buddy" })
    expect(reply).toHaveTextContent("Часть")
    expect(fetchMock).toHaveBeenCalledTimes(2)

    emit("token", { delta: "ответа" })
    await waitFor(() => expect(reply).toHaveTextContent("Часть ответа"))
    expect(screen.getAllByRole("article", { name: "AI Buddy" })).toEqual([reply])

    const content = "Часть ответа. Готово!"
    emit("done", { response: content })
    close()

    expect((await screen.findByText(content)).closest("article")).toBe(reply)
    expect(reply.querySelector("p")?.textContent).toBe(content)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    history.resolve(
      Response.json({
        messages: [
          { ...assistantMessage, content },
          {
            ...assistantMessage,
            id: "saved-marker",
            content: "История обновилась",
          },
        ],
      }),
    )
    await screen.findByText("История обновилась")
    expect(screen.getAllByText(content)).toHaveLength(1)
    expect(document.querySelector("[data-stream-fragment]")).toBeNull()
  })

  it("retains the streamed reply when history fails and reconciles it on retry", async () => {
    const { fetchMock, emit, close } = mockChatStream()
    const content = "Готовый ответ"
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ messages: [{ ...assistantMessage, content }] }))
    renderChat()

    await screen.findByRole("heading", { name: "Напиши первое сообщение" })
    await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    emit("token", { delta: content })
    emit("done", { response: content })
    close()

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить историю.")
    expect(screen.getByText(content)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }))
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument())
    expect(screen.getAllByText(content)).toHaveLength(1)
  })

  it("reports an SSE error after HTTP 200 and stops generating", async () => {
    const { fetchMock, emit, close } = mockChatStream()
    renderChat()

    await screen.findByRole("heading", { name: "Напиши первое сообщение" })
    const input = screen.getByRole("textbox")
    await userEvent.type(input, "Вопрос{Enter}")
    emit("token", { delta: "Незавершённый ответ" })
    expect(await screen.findByText("Незавершённый ответ")).toBeInTheDocument()
    emit("error", { detail: "Model API request failed" })
    close()

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось получить ответ.")
    expect(input).toHaveValue("Вопрос")
    expect(screen.queryByRole("article", { name: "AI Buddy" })).not.toBeInTheDocument()
    expect(screen.queryByText("AI Buddy готовит ответ…")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("keeps the draft if sending fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ messages: [] }))
        .mockResolvedValueOnce(new Response("Unavailable", { status: 503 })),
    )
    renderChat()

    await screen.findByRole("heading", { name: "Напиши первое сообщение" })
    const input = screen.getByRole("textbox")
    await userEvent.type(input, "Повторить{Enter}")

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось получить ответ.")
    expect(input).toHaveValue("Повторить")
  })

  it("renders decoded reply chunks before the response completes", async () => {
    const done = deferred<void>()
    let onDelta: (delta: string) => void = () => undefined
    const savedReply: ChatMessage = {
      ...assistantMessage,
      id: "assistant-2",
      content: "Часть ответа",
    }
    const transport: ChatTransport = {
      load: vi
        .fn()
        .mockResolvedValueOnce([assistantMessage])
        .mockResolvedValueOnce([assistantMessage, savedReply]),
      send: async (_message, _signal, receive) => {
        onDelta = receive
        return done.promise
      },
    }
    renderChat(transport)

    await screen.findByText("Подготовка")
    const historyItem = screen.getByRole("article", { name: "AI Buddy" })
    await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    expect(screen.getByRole("article", { name: "Вы" })).toHaveAttribute("data-entering", "true")
    act(() => onDelta("Часть "))
    expect(screen.getByText("Часть")).toBeInTheDocument()
    const liveReply = screen.getByText("Часть").closest("article")
    expect(liveReply).not.toHaveAttribute("data-entering")
    const firstFragment = liveReply?.querySelector("[data-stream-fragment]")
    expect(firstFragment).toHaveAttribute("data-stream-fragment", "6")
    act(() => onDelta("ответа"))
    expect(screen.getByText("ответа").closest("article")).toBe(liveReply)
    expect(liveReply?.querySelector("[data-stream-fragment='6']")).toBe(firstFragment)
    expect(liveReply?.querySelector("[data-stream-fragment='12']")).toHaveTextContent("ответа")
    expect(historyItem).not.toHaveAttribute("data-entering")

    done.resolve(undefined)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
    )
    expect(screen.getByText("Подготовка").closest("article")).toBe(historyItem)
    expect(screen.getByText("Часть ответа").closest("article")).not.toHaveAttribute("data-entering")
    expect(document.querySelector("[data-stream-fragment]")).toBeNull()
  })

  it("retains fragment boundaries when Markdown changes the rendered structure", async () => {
    const done = deferred<void>()
    let onDelta: (delta: string) => void = () => undefined
    const saved = { ...assistantMessage, content: "**Старый текст**\n\n```js\nconst x = 1\n```" }
    renderChat({
      load: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([saved]),
      send: async (_message, _signal, receive) => {
        onDelta = receive
        return done.promise
      },
    })

    await screen.findByRole("heading", { name: "Напиши первое сообщение" })
    await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    const receivedAt = vi.spyOn(performance, "now").mockReturnValue(100)
    act(() => onDelta("**Старый"))
    expect(screen.getByText("**Старый")).toHaveAttribute("data-stream-fragment", "8")
    receivedAt.mockReturnValue(200)
    act(() => onDelta(" текст**\n\n```js\nconst "))
    const strong = document.querySelector("strong")
    expect(strong?.querySelector("[data-stream-fragment='8']")).toHaveTextContent("Старый")
    expect(strong).toHaveTextContent("Старый текст")
    const firstCode = document.querySelector("pre code [data-stream-fragment]")
    expect(firstCode).toHaveTextContent("const")

    receivedAt.mockReturnValue(510)
    act(() => onDelta("x = 1\n```"))
    expect(strong?.querySelector("[data-stream-fragment='8']")).toBeNull()
    expect(strong).toHaveTextContent("Старый текст")
    expect(document.querySelector("pre code [data-stream-fragment]")).toBe(firstCode)
    expect(screen.getByText("x = 1")).toHaveAttribute("data-stream-fragment")
    expect(document.querySelector("pre code")).toHaveTextContent("const x = 1")
    receivedAt.mockRestore()
    done.resolve(undefined)
    await waitFor(() => expect(document.querySelector("[data-stream-fragment]")).toBeNull())
  })

  it("renders streamed GFM tables and task lists without duplicating old fragments", async () => {
    const done = deferred<void>()
    let onDelta: (delta: string) => void = () => undefined
    const parts = [
      "# Обзор\n\nАбзац с `npm ci`.\n\n| Компонент | Роль |\n",
      "| --- | --- |\n| Vite | Разработка |\n\n- [",
      "x] Запустить\n- [ ] Проверить\n\n~~черновик~~\n\n```ts\n  const ",
      "port = 5173\n```\n\n###### Примечание",
    ]
    const saved = { ...assistantMessage, content: parts.join("") }
    renderChat({
      load: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([saved]),
      send: async (_message, _signal, receive) => {
        onDelta = receive
        return done.promise
      },
    })

    await screen.findByRole("heading", { name: "Напиши первое сообщение" })
    await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    const clock = vi.spyOn(performance, "now").mockReturnValue(100)
    act(() => onDelta(parts[0]))
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByText("npm ci").closest("code")).toBeInTheDocument()

    clock.mockReturnValue(200)
    act(() => onDelta(parts[1]))
    const table = screen.getByRole("table")
    expect(table.parentElement).toHaveAttribute("tabindex", "0")
    const column = screen.getByRole("columnheader", { name: "Компонент" })
    const oldFragment = column.querySelector("[data-stream-fragment]")
    expect(oldFragment).toHaveAttribute("data-stream-fragment", String(parts[0].length))
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()

    clock.mockReturnValue(300)
    act(() => onDelta(parts[2]))
    const [checked, unchecked] = screen.getAllByRole("checkbox")
    expect(checked).toBeChecked()
    expect(unchecked).not.toBeChecked()
    expect(checked).toBeDisabled()
    expect(unchecked).toBeDisabled()
    expect(screen.getByText("черновик").closest("del")).toBeInTheDocument()
    expect(screen.getByRole("table")).toBe(table)
    expect(column.querySelector("[data-stream-fragment]")).toBe(oldFragment)

    clock.mockReturnValue(350)
    act(() => onDelta(parts[3]))
    expect(document.querySelector("pre code")?.textContent).toBe("  const port = 5173\n")
    expect(screen.getByRole("heading", { name: "Примечание", level: 6 })).toBeInTheDocument()
    clock.mockRestore()
    done.resolve(undefined)

    await waitFor(() => expect(document.querySelector("[data-stream-fragment]")).toBeNull())
    expect(screen.getAllByRole("table")).toHaveLength(1)
    expect(screen.getAllByRole("checkbox")).toHaveLength(2)
    expect(document.querySelector("pre code")?.textContent).toBe("  const port = 5173\n")
  })

  it("smooths the new message once, follows chunks immediately and respects scrolling up", async () => {
    const done = deferred<void>()
    let onDelta: (delta: string) => void = () => undefined
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    renderChat({
      load: async () => [],
      send: async (_message, _signal, receive) => {
        onDelta = receive
        return done.promise
      },
    })

    await screen.findByRole("heading", { name: "Напиши первое сообщение" })
    expect(screen.queryByRole("button", { name: "Прокрутить вниз" })).not.toBeInTheDocument()
    const log = screen.getByRole("log")
    const scrollTo = vi.fn()
    let height = 300
    Object.defineProperties(log, {
      scrollHeight: { get: () => height },
      clientHeight: { value: 100 },
      scrollTo: { value: scrollTo },
    })
    log.scrollTop = 200
    fireEvent.scroll(log)

    height = 350
    await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 250, behavior: "smooth" })
    log.scrollTop = 220
    fireEvent.scroll(log)

    height = 370
    act(() => onDelta("Первый фрагмент "))
    expect(log.scrollTop).toBe(270)
    height = 400
    act(() => onDelta("и второй"))
    expect(log.scrollTop).toBe(300)
    expect(scrollTo).toHaveBeenCalledOnce()

    log.scrollTop = 200
    fireEvent.scroll(log)
    height = 430
    act(() => onDelta(" и третий"))
    expect(log.scrollTop).toBe(200)

    log.scrollTop = 330
    fireEvent.scroll(log)
    height = 450
    act(() => onDelta(" и четвёртый"))
    expect(log.scrollTop).toBe(350)

    done.resolve(undefined)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
    )
  })

  it("shows the latest-message button only when far from the end and jumps instantly with reduced motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }))
    renderChat({ load: async () => [assistantMessage], send: vi.fn() })
    await screen.findByText("Подготовка")

    const log = screen.getByRole("log")
    Object.defineProperties(log, {
      scrollHeight: { value: 700 },
      clientHeight: { value: 200 },
    })
    const buttonName = { name: "Прокрутить вниз" }
    log.scrollTop = 500
    fireEvent.scroll(log)
    expect(screen.queryByRole("button", buttonName)).not.toBeInTheDocument()

    log.scrollTop = 430
    fireEvent.scroll(log)
    expect(screen.queryByRole("button", buttonName)).not.toBeInTheDocument()

    log.scrollTop = 300
    fireEvent.scroll(log)
    const button = screen.getByRole("button", buttonName)
    expect(button).toHaveAttribute("tabindex", "0")
    await userEvent.click(button)

    expect(log.scrollTop).toBe(500)
    expect(log).toHaveFocus()
    expect(button).toHaveAttribute("tabindex", "-1")
    expect(screen.queryByRole("button", buttonName)).not.toBeInTheDocument()
  })

  it("keeps moving to the growing end, resumes following, and cancels on an upward gesture", async () => {
    const done = deferred<void>()
    let onDelta: (delta: string) => void = () => undefined
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    renderChat({
      load: async () => [assistantMessage],
      send: async (_message, _signal, receive) => {
        onDelta = receive
        return done.promise
      },
    })
    await screen.findByText("Подготовка")
    const log = screen.getByRole("log")
    const scrollTo = vi.fn()
    let height = 700
    Object.defineProperties(log, {
      scrollHeight: { get: () => height },
      clientHeight: { value: 200 },
      scrollTo: { value: scrollTo },
    })
    log.scrollTop = 100
    fireEvent.scroll(log)
    await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    act(() => onDelta("Начало ответа "))

    const frames = new Map<number, FrameRequestCallback>()
    let frameId = 0
    let now = 0
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))
    function step() {
      const callbacks = [...frames.values()]
      frames.clear()
      now += 16
      act(() => callbacks.forEach((callback) => callback(now)))
      fireEvent.scroll(log)
    }

    const buttonName = { name: "Прокрутить вниз" }
    fireEvent.click(screen.getByRole("button", buttonName))
    expect(frames.size).toBe(1)
    step()
    const beforeGrowth = log.scrollTop
    expect(beforeGrowth).toBeGreaterThan(100)
    height += 160
    act(() => onDelta("и ещё один фрагмент. "))
    expect(log.scrollTop).toBe(beforeGrowth)
    expect(frames.size).toBe(1)
    step()
    expect(log.scrollTop).toBeGreaterThan(beforeGrowth)
    expect(log.scrollTop).toBeLessThan(height - 200)

    for (let count = 0; count < 80 && frames.size; count++) step()
    expect(log.scrollTop).toBe(height - 200)
    expect(frames.size).toBe(0)
    expect(screen.queryByRole("button", buttonName)).not.toBeInTheDocument()

    height += 70
    act(() => onDelta("Следующий фрагмент. "))
    expect(log.scrollTop).toBe(height - 200)
    expect(frames.size).toBe(0)
    expect(scrollTo).not.toHaveBeenCalled()

    log.scrollTop = 100
    fireEvent.scroll(log)
    fireEvent.click(screen.getByRole("button", buttonName))
    step()
    fireEvent.wheel(log, { deltaY: -40 })
    expect(frames.size).toBe(0)
    log.scrollTop = 80
    fireEvent.scroll(log)
    height += 100
    act(() => onDelta("Последняя часть ответа."))
    expect(log.scrollTop).toBe(80)
    expect(screen.getByRole("button", buttonName)).toBeInTheDocument()

    done.resolve(undefined)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
    )
  })

  it("stops the jump to the latest message when the user scrolls up or the chat closes", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    const { unmount } = renderChat({ load: async () => [assistantMessage], send: vi.fn() })
    await screen.findByText("Подготовка")
    const log = screen.getByRole("log")
    sizeLog(log, () => 1000)
    const { frames, runFrame } = stubAnimationFrames()
    log.scrollTop = 100
    fireEvent.scroll(log)
    const button = screen.getByRole("button", scrollButtonName)

    fireEvent.click(button)
    // a second click while moving does not start another animation
    fireEvent.click(button)
    expect(frames.size).toBe(1)
    runFrame()
    expect(log.scrollTop).toBeGreaterThan(100)
    // the scrollbar is dragged up between two frames, before its scroll event
    log.scrollTop = 50
    runFrame()
    expect(frames.size).toBe(0)
    expect(log.scrollTop).toBe(50)
    expect(screen.getByRole("button", scrollButtonName)).toBeInTheDocument()

    fireEvent.click(button)
    runFrame()
    log.scrollTop = 20
    fireEvent.scroll(log)
    expect(frames.size).toBe(0)
    expect(log.scrollTop).toBe(20)

    fireEvent.click(button)
    expect(frames.size).toBe(1)
    unmount()
    expect(frames.size).toBe(0)
  })

  it("ends the smooth scroll to a new message at once when the user scrolls up", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    const reply = streamingTransport([])
    renderChat(reply.transport)
    await screen.findByRole("heading", { name: "Напиши первое сообщение" })
    const log = screen.getByRole("log")
    let height = 400
    const scrollTo = sizeLog(log, () => height)
    log.scrollTop = 200
    fireEvent.scroll(log)
    height = 450
    await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 250, behavior: "smooth" })

    fireEvent.wheel(log, { deltaY: -40 })

    expect(scrollTo).toHaveBeenLastCalledWith({ top: 200, behavior: "instant" })
    await finishReply(reply)
  })

  it.each<[string, (log: HTMLElement) => void]>([
    [
      "a swipe down",
      (log) => {
        fireEvent.touchStart(log, { touches: [{ clientX: 10, clientY: 100 }] })
        fireEvent.touchMove(log, { touches: [{ clientX: 12, clientY: 140 }] })
      },
    ],
    ["PageUp", (log) => fireEvent.keyDown(log, { key: "PageUp" })],
    ["Shift+Space", (log) => fireEvent.keyDown(log, { key: " ", shiftKey: true })],
  ])("stops following the reply after %s", async (_, scrollUp) => {
    const { log, reply, grow } = await streamAtTheEnd()

    scrollUp(log)
    grow(140, "и его продолжение")

    expect(log.scrollTop).toBe(560)
    expect(screen.getByRole("button", scrollButtonName)).toBeInTheDocument()
    await finishReply(reply)
  })

  it.each<[string, (log: HTMLElement) => void]>([
    [
      "a swipe to the side",
      (log) => {
        fireEvent.touchStart(log, { touches: [{ clientX: 10, clientY: 100 }] })
        fireEvent.touchMove(log, { touches: [{ clientX: 60, clientY: 110 }] })
      },
    ],
    [
      "a swipe that started with no touch",
      (log) => {
        fireEvent.touchStart(log, { touches: [] })
        fireEvent.touchMove(log, { touches: [{ clientX: 10, clientY: 200 }] })
      },
    ],
    ["ArrowDown", (log) => fireEvent.keyDown(log, { key: "ArrowDown" })],
    ["a wheel down", (log) => fireEvent.wheel(log, { deltaY: 40 })],
  ])("keeps following the reply after %s", async (_, gesture) => {
    const { log, reply, grow } = await streamAtTheEnd()

    gesture(log)
    grow(140, "и его продолжение")

    expect(log.scrollTop).toBe(700)
    await finishReply(reply)
  })

  it("swings the send arrow on hover and launches it with the message", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    const reply = streamingTransport()
    renderChat(reply.transport)
    await screen.findByText("Подготовка")
    const button = screen.getByRole("button", { name: "Отправить сообщение" })
    const { animate, animations } = stubAnimate(button.firstElementChild!)
    const played = () => animations.map(({ id }) => id)

    await user.hover(button)
    expect(played()).toEqual(["hover"])
    expect(animate).toHaveBeenLastCalledWith(expect.any(Array), { duration: 620, fill: "forwards" })
    await user.unhover(button)
    expect(played()).toEqual(["hover", "rest"])
    expect(animations[0].cancel).toHaveBeenCalled()

    await user.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    expect(played()).toEqual(["hover", "rest", "launch"])
    expect(animate).toHaveBeenLastCalledWith(expect.any(Array), { duration: 720, fill: "none" })

    // leaving the button neither cuts the launch short nor moves the arrow after it
    fireEvent.pointerOut(button)
    animations[2].playState = "finished"
    fireEvent.pointerOut(button)
    expect(played()).toEqual(["hover", "rest", "launch"])
    await finishReply(reply)
  })

  it("keeps the send arrow still for touch and with reduced motion", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query.startsWith("(hover") })),
    )
    renderChat({ load: async () => [], send: vi.fn() })
    await screen.findByRole("heading", { name: "Напиши первое сообщение" })
    const button = screen.getByRole("button", { name: "Отправить сообщение" })
    const { animate } = stubAnimate(button.firstElementChild!)

    fireEvent.pointerOver(button, { pointerType: "touch" })
    fireEvent.pointerOver(button, { pointerType: "mouse" })

    expect(animate).not.toHaveBeenCalled()
  })

  it("lets a reply that only the saved history has enter the chat once", async () => {
    const question: ChatMessage = { ...assistantMessage, id: "user-2", role: "user", content: "Q" }
    const saved: ChatMessage = { ...assistantMessage, id: "assistant-2", content: "Из истории" }
    const user = userEvent.setup()
    renderChat(
      {
        load: vi
          .fn()
          .mockResolvedValueOnce([assistantMessage])
          .mockResolvedValueOnce([assistantMessage, question, saved]),
        send: async () => undefined,
      },
      "  ",
    )
    await screen.findByText("Подготовка")

    await user.type(screen.getByRole("textbox"), "Q{Enter}")
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
    )

    const reply = screen.getByText("Из истории").closest("article")!
    expect(reply).toHaveAttribute("data-entering", "true")
    // a display name without letters leaves a question mark in the avatar
    expect(within(screen.getByRole("article", { name: "Вы" })).getByText("?")).toBeInTheDocument()
    // the animations inside the message do not end its entrance
    fireEvent.animationEnd(within(reply).getByText("Из истории"))
    expect(reply).toHaveAttribute("data-entering", "true")
    fireEvent.animationEnd(reply)
    expect(reply).not.toHaveAttribute("data-entering")
  })

  it.each<[string, (done: ReturnType<typeof deferred<string | void>>) => void]>([
    ["answers", (done) => done.resolve("Поздний ответ")],
    ["fails", (done) => done.reject(new Error("closed"))],
  ])("cancels the request when the chat closes and ignores how it %s", async (_, settle) => {
    const reply = streamingTransport()
    const { unmount } = renderChat(reply.transport)
    await screen.findByText("Подготовка")
    await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    act(() => reply.onDelta("Начало"))

    unmount()
    expect(reply.signal?.aborted).toBe(true)
    // what comes after that is dropped, and the history is not reloaded
    reply.onDelta(" и конец")
    settle(reply.done)
    await new Promise((resolve) => setTimeout(resolve))

    expect(reply.transport.load).toHaveBeenCalledOnce()
  })
})

/** Streams a reply into a log that is scrolled to its end, so the log follows the reply. */
async function streamAtTheEnd() {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }))
  const reply = streamingTransport()
  renderChat(reply.transport)
  await screen.findByText("Подготовка")
  const log = screen.getByRole("log")
  let height = 700
  sizeLog(log, () => height)
  log.scrollTop = 500
  fireEvent.scroll(log)
  await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")

  function grow(by: number, delta: string) {
    height += by
    act(() => reply.onDelta(delta))
  }
  grow(60, "Начало ответа ")
  expect(log.scrollTop).toBe(560)
  return { log, reply, grow }
}

async function finishReply(reply: ReturnType<typeof streamingTransport>) {
  reply.done.resolve()
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
  )
}

/** Element.animate, which jsdom lacks, for one element; lists the animations it started. */
function stubAnimate(element: Element) {
  type FakeAnimation = { id: string; playState: AnimationPlayState; cancel: () => void }
  const animations: FakeAnimation[] = []
  const animate = vi.fn<
    (keyframes: Keyframe[], options: KeyframeAnimationOptions) => FakeAnimation
  >(() => {
    const animation: FakeAnimation = { id: "", playState: "running", cancel: vi.fn() }
    animations.push(animation)
    return animation
  })
  Object.defineProperty(element, "animate", { value: animate })
  return { animate, animations }
}
