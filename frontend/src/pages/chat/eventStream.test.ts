import { describe, expect, it, vi } from "vitest"
import { readEventStream } from "./eventStream"

describe("SSE framing", () => {
  it("dispatches complete events across UTF-8, CRLF and network chunk boundaries", async () => {
    const text =
      "\uFEFF: comment\r\nid: 7\r\nevent: example\r\ndata: Привет\r\ndata: мир\r\n\r\ndata: next\r\rdata: incomplete\n"
    const bytes = new TextEncoder().encode(text)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
        controller.close()
      },
    })
    const receive = vi.fn()

    await readEventStream(body, receive)

    expect(receive.mock.calls).toEqual([
      [{ type: "example", data: "Привет\nмир", lastEventId: "7" }],
      [{ type: "message", data: "next", lastEventId: "7" }],
    ])
    expect(body.locked).toBe(false)
  })

  it("follows the edge cases of the SSE field rules", async () => {
    const text = [
      // an event without data is not dispatched
      "event: ping",
      "",
      // an id with NUL is ignored, a field without a colon has an empty value
      "id: 1",
      "id: 2\0",
      "data",
      "",
    ].join("\n")
    const receive = vi.fn()

    await readEventStream(new Response(`${text}\n`).body!, receive)

    expect(receive.mock.calls).toEqual([[{ type: "message", data: "", lastEventId: "1" }]])
  })

  it("propagates read failures and releases the stream lock", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection lost"))
      },
    })

    await expect(readEventStream(body)).rejects.toThrow("connection lost")
    expect(body.locked).toBe(false)
  })
})
