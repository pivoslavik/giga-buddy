import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
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
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }))

    expect(await screen.findByText("Подготовка", { selector: "strong" })).toBeInTheDocument()
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

    await screen.findByText("Напиши первое сообщение.")
    await userEvent.type(screen.getByRole("textbox"), "  Как начать?  {Enter}")

    expect(screen.getByText("Как начать?")).toBeInTheDocument()
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

    await screen.findByText("Напиши первое сообщение.")
    const input = screen.getByRole("textbox")
    await userEvent.type(input, "Повторить{Enter}")

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось получить ответ.")
    expect(input).toHaveValue("Повторить")
  })

  it("renders decoded reply chunks before the response completes", async () => {
    const done = deferred<void>()
    let onDelta: (delta: string) => void = () => undefined
    const transport: ChatTransport = {
      load: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...assistantMessage, content: "Часть ответа" }]),
      send: async (_message, _signal, receive) => {
        onDelta = receive
        return done.promise
      },
    }
    renderChat(transport)

    await screen.findByText("Напиши первое сообщение.")
    await userEvent.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    act(() => onDelta("Часть "))
    expect(screen.getByText("Часть")).toBeInTheDocument()
    act(() => onDelta("ответа"))
    expect(screen.getByText("Часть ответа")).toBeInTheDocument()

    done.resolve(undefined)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Отправить сообщение" })).toBeEnabled(),
    )
  })
})
