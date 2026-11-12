import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

function renderChat(transport = chatTransport) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ChatConversation userId={1} displayName="Гриша" transport={transport} />
    </QueryClientProvider>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
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

  it("sends the documented request and reloads history after the SSE stream closes", async () => {
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined
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
      .mockResolvedValueOnce(Response.json({ messages: [assistantMessage] }))
    vi.stubGlobal("fetch", fetchMock)
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

    stream?.enqueue(new TextEncoder().encode("event: opaque\ndata: opaque\n\n"))
    stream?.close()

    expect(await screen.findByText("Подготовка")).toBeInTheDocument()
    expect(screen.getByRole("article", { name: "AI Buddy" })).toHaveAttribute(
      "data-entering",
      "true",
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
    )
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
})
