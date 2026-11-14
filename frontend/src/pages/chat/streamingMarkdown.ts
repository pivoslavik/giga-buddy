import type { Element, Root, Text } from "hast"

export const fragmentFadeDuration = 400

export interface StreamFragment {
  start: number
  end: number
  receivedAt: number
}

const entityPattern = /&(?:#[0-9]{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/iy
const punctuation = /[!-/:-@[-\x60{-~]/
const linesWithEndings = /[^\r\n]*(?:\r\n|\r|\n|$)/g
const lineEnding = /(?:\r\n|\r|\n)$/

/** Map rendered characters to Markdown offsets, including escapes and character references. */
function textOffsets(value: string, raw: string, start: number, literal: boolean) {
  const exact = raw.indexOf(value)
  if (exact !== -1) return (index: number) => start + exact + index

  const offsets: number[] = []
  let rendered = 0
  for (let cursor = 0; cursor < raw.length && rendered < value.length;) {
    let token = String.fromCodePoint(raw.codePointAt(cursor)!)
    let width = token.length
    if (!literal && token === "\\" && punctuation.test(raw[cursor + 1] ?? "")) {
      token = raw[cursor + 1]
      width = 2
    } else if (!literal && token === "&") {
      entityPattern.lastIndex = cursor
      const entity = entityPattern.exec(raw)?.[0]
      if (entity) {
        const decoded = new DOMParser().parseFromString(entity, "text/html").body.textContent
        if (decoded && value.startsWith(decoded, rendered)) {
          token = decoded
          width = entity.length
        }
      }
    } else if (token === "\r" && raw[cursor + 1] === "\n" && value[rendered] !== "\r") {
      token = "\n"
      width = 2
    }

    if (
      value.startsWith(token, rendered) ||
      (literal && /\s/.test(token) && value[rendered] === " ")
    ) {
      const length = value.startsWith(token, rendered) ? token.length : 1
      for (let index = 0; index < length; index++) offsets[rendered++] = start + cursor + width - 1
    }
    cursor += width
  }
  return (index: number): number | undefined => offsets[index]
}

function codeOffsets(value: string, raw: string, start: number) {
  // Fenced code text has no position of its own. Skip the opening fence and map each content line.
  const fence = raw.match(/^(?:`{3,}|~{3,})[^\r\n]*(?:\r\n|\r|\n|$)/)?.[0].length ?? 0
  const offsets: (number | undefined)[] = []
  const renderedLines = value.match(linesWithEndings) ?? []
  const sourceLines = raw.slice(fence).match(linesWithEndings) ?? []
  let lineStart = start + fence
  for (const [index, line] of renderedLines.entries()) {
    const sourceLine = sourceLines[index] ?? ""
    const text = line.replace(lineEnding, "")
    const sourceText = sourceLine.replace(lineEnding, "")
    const textStart = sourceText.endsWith(text) ? sourceText.length - text.length : -1
    for (let index = 0; index < line.length; index++) {
      offsets.push(
        index < text.length && textStart >= 0 ? lineStart + textStart + index : undefined,
      )
    }
    lineStart += sourceLine.length
  }
  return (index: number) => offsets[index]
}

export function markStreamingMarkdown(
  source: string,
  fragments: readonly StreamFragment[],
  className: string,
) {
  function split(node: Text, parent: Element | Root): (Element | Text)[] {
    const code = parent.type === "element" && parent.tagName === "code"
    const position = node.position ?? (code ? parent.position : undefined)
    const start = position?.start.offset
    const end = position?.end.offset
    if (start === undefined || end === undefined || end <= fragments[0].start) return [node]

    const raw = source.slice(start, end)
    const delimiter = code && node.position ? (raw.match(/^`+/)?.[0].length ?? 0) : 0
    const offsetAt =
      code && !node.position
        ? codeOffsets(node.value, raw, start)
        : textOffsets(
            node.value,
            raw.slice(delimiter, raw.length - delimiter),
            start + delimiter,
            code,
          )

    const children: (Element | Text)[] = []
    let current: StreamFragment | undefined
    let from = 0
    let fragmentIndex = 0

    function append(to: number) {
      if (from === to) return
      const text: Text = { type: "text", value: node.value.slice(from, to) }
      children.push(
        current
          ? {
              type: "element",
              tagName: "span",
              properties: { className: [className], dataStreamFragment: current.end },
              children: [text],
            }
          : text,
      )
      from = to
    }

    for (let index = 0; index < node.value.length;) {
      const length = node.value.codePointAt(index)! > 0xffff ? 2 : 1
      const offset = offsetAt(index + length - 1)
      while (offset !== undefined && fragments[fragmentIndex]?.end <= offset) fragmentIndex++
      const candidate = fragments[fragmentIndex]
      const fragment = offset !== undefined && candidate?.start <= offset ? candidate : undefined
      if (fragment !== current) {
        append(index)
        current = fragment
      }
      index += length
    }
    append(node.value.length)
    return children.length ? children : [node]
  }

  function visit(parent: Root | Element) {
    for (let index = parent.children.length - 1; index >= 0; index--) {
      const node = parent.children[index]
      if (node.type === "element") visit(node)
      if (node.type === "text") parent.children.splice(index, 1, ...split(node, parent))
    }
  }

  return () => (tree: Root) => {
    if (fragments.length) visit(tree)
  }
}
