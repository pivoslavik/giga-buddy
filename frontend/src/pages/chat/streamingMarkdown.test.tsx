import { render } from "@testing-library/react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { describe, expect, it } from "vitest"
import { markStreamingMarkdown, type StreamFragment } from "./streamingMarkdown"

/** A fragment of the reply that covers `source.slice(start, end)`. */
function fragment(start: number, end: number): StreamFragment {
  return { start, end, receivedAt: 0 }
}

/** Renders `source` like a streamed reply and lists the marked fragments as [end, text]. */
function markedFragments(source: string, fragments: StreamFragment[]) {
  const { container } = render(
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[markStreamingMarkdown(source, fragments, "fragment")]}
    >
      {source}
    </Markdown>,
  )
  return Array.from(container.querySelectorAll(".fragment"), (span) => [
    span.getAttribute("data-stream-fragment"),
    span.textContent,
  ])
}

describe("markStreamingMarkdown", () => {
  it("leaves the reply alone while no fragment is fresh", () => {
    expect(markedFragments("Готовый ответ", [])).toEqual([])
  })

  it("maps escaped characters and character references back to the Markdown they came from", () => {
    const source = "Tom \\*и\\* Jerry &amp; Co & &nope;"
    const jerry = source.indexOf("Jerry")

    expect(markedFragments(source, [fragment(0, jerry), fragment(jerry, source.length)])).toEqual([
      [String(jerry), "Tom *и* "],
      [String(source.length), "Jerry & Co & &nope;"],
    ])
  })

  it("counts a character outside the Basic Multilingual Plane as one character", () => {
    const source = "Привет 👋 \\_мир"
    const wave = source.indexOf("👋")

    expect(
      markedFragments(source, [fragment(wave, wave + 2), fragment(wave + 2, source.length)]),
    ).toEqual([
      [String(wave + 2), "👋"],
      [String(source.length), " _мир"],
    ])
  })

  it("follows the line breaks of inline code, which Markdown turns into spaces", () => {
    const source = "Запусти `npm\nrun dev`"
    const run = source.indexOf("run")

    expect(markedFragments(source, [fragment(0, run), fragment(run, source.length)])).toEqual([
      [String(run), "Запусти "],
      [String(run), "npm "],
      [String(source.length), "run dev"],
    ])
  })

  it("reads a CRLF in inline code as the one space it turns into", () => {
    const source = "`npm\r\nrun dev`"
    const run = source.indexOf("run")

    expect(
      markedFragments(source, [fragment(0, run - 1), fragment(run - 1, source.length)]),
    ).toEqual([
      [String(run - 1), "npm"],
      [String(source.length), " run dev"],
    ])
  })

  it("maps the lines of an indented code block, which has no fence", () => {
    const source = "Код:\n\n    const a = 1\n    const b = 2\n"
    const second = source.indexOf("const b")

    expect(markedFragments(source, [fragment(second, source.length)])).toEqual([
      [String(source.length), "const b = 2"],
    ])
  })
})
