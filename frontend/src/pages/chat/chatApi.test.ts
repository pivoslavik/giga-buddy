import { describe, expect, it, vi } from "vitest"
import { chatTransport } from "./chatApi"

/** An SSE response that sends the given lines and ends. */
function eventStream(...lines: string[]) {
  return new Response(lines.map((line) => `${line}\n`).join(""), {
    headers: { "Content-Type": "Text/Event-Stream; charset=utf-8" },
  })
}

function send(response: Response, onDelta = vi.fn()) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
  return chatTransport.send("Вопрос", new AbortController().signal, onDelta)
}

describe("chat transport", () => {
  it("rejects a history without the list of messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ history: [] })))

    await expect(chatTransport.load(new AbortController().signal)).rejects.toThrow(
      "Expected a chat message history",
    )
  })

  it("sends the message to the API host of VITE_API_URL", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com")

    await send(eventStream("event: done", 'data: {"response":"Ответ"}', ""))

    expect(fetch).toHaveBeenCalledWith("https://api.example.com/api/chat", expect.anything())
  })

  it.each([
    ["JSON", Response.json({ response: "Ответ" })],
    ["no body", new Response(null, { headers: { "Content-Type": "text/event-stream" } })],
  ])("rejects an answer with %s instead of an event stream", async (_, response) => {
    await expect(send(response)).rejects.toThrow("Expected a chat event stream")
  })

  it("skips events it does not know and fields of the wrong type", async () => {
    const onDelta = vi.fn()

    const response = await send(
      eventStream(
        "event: ping",
        "data: {}",
        "",
        "event: token",
        'data: {"delta":42}',
        "",
        "event: token",
        'data: {"delta":"Ответ"}',
        "",
        "event: done",
        'data: {"response":null}',
        "",
      ),
      onDelta,
    )

    expect(onDelta.mock.calls).toEqual([["Ответ"]])
    // without the full text in "done" the caller keeps what it has streamed
    expect(response).toBeUndefined()
  })
})
