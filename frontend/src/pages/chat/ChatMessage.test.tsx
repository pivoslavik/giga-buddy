import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import type { ChatMessage as Message } from "./chatApi"
import { ChatMessage } from "./ChatMessage"
import type { StreamFragment } from "./streamingMarkdown"

const reply: Message = {
  id: "assistant-1",
  role: "assistant",
  content: "Открой [README](/docs/readme) и [заметки]()",
  created_at: "2026-11-09T12:00:00Z",
}

function streamed(content: string, ...fragments: StreamFragment[]) {
  return (
    <ChatMessage
      message={{ ...reply, content }}
      initial="А"
      entering={false}
      streamFragments={fragments}
    />
  )
}

describe("ChatMessage", () => {
  it("copies the text of a reply and says whether that worked", async () => {
    const user = userEvent.setup()
    render(<ChatMessage message={reply} initial="А" entering={false} />)
    const copy = screen.getByRole("button", { name: "Копировать" })

    await user.click(copy)

    expect(screen.getByRole("status")).toHaveTextContent("Скопировано")
    expect(await navigator.clipboard.readText()).toBe(reply.content)

    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denied"))
    await user.click(copy)

    expect(screen.getByRole("status")).toHaveTextContent("Не удалось скопировать")
  })

  it("shows a link of a reply as a reference, and one without an address as text", () => {
    render(<ChatMessage message={reply} initial="А" entering={false} />)

    expect(screen.getByRole("link", { name: /README/ })).toHaveAttribute("href", "/docs/readme")
    expect(screen.getAllByRole("link")).toHaveLength(1)
    expect(screen.getByText("заметки").tagName).toBe("SPAN")
  })

  it("fades in every new fragment of a streamed reply once", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    vi.spyOn(performance, "now").mockReturnValue(1000)
    const animations: { startTime: number | null; cancel: () => void }[] = []
    const animate = vi.fn(() => {
      const animation = { startTime: null, cancel: vi.fn() }
      animations.push(animation)
      return animation
    })
    // jsdom has no Element.animate
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLElement.prototype, "animate")
    })
    const first = { start: 0, end: 6, receivedAt: 900 }
    const second = { start: 6, end: 12, receivedAt: 950 }

    const { rerender } = render(streamed("Часть ", first))
    expect(animate).toHaveBeenCalledOnce()
    // the fade keeps the clock of its fragment, even when Markdown rebuilds the element
    expect(animations[0].startTime).toBe(900)

    rerender(streamed("Часть ответа", first, second))
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animations[1].startTime).toBe(950)

    // a fragment that came longer ago than the fade lasts is shown as it is
    rerender(streamed("Часть ответа.", first, second, { start: 12, end: 13, receivedAt: 500 }))
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animations[0].cancel).not.toHaveBeenCalled()
  })

  it("does not fade fragments in with reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }))
    const animate = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLElement.prototype, "animate")
    })

    render(streamed("Часть", { start: 0, end: 5, receivedAt: performance.now() }))

    expect(document.querySelector("[data-stream-fragment]")).toHaveTextContent("Часть")
    expect(animate).not.toHaveBeenCalled()
  })
})
