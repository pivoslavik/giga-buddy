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
