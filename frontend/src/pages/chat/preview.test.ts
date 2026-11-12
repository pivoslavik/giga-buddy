import { describe, expect, it } from "vitest"
import demoAnswer from "./demoAnswer.md?raw"
import { demoQuestion, previewReply } from "./preview"

describe("chat preview", () => {
  it("streams the full reference answer in varied fragments and can replay it", () => {
    const fragments = previewReply(demoQuestion, true)

    expect(fragments.length).toBeGreaterThan(100)
    expect(new Set(fragments.map((fragment) => fragment.length)).size).toBeGreaterThan(5)
    expect(fragments.every((fragment) => fragment.length > 1)).toBe(true)
    expect(fragments.join("")).toBe(demoAnswer)
    expect(previewReply(demoQuestion.replace(/\?$/, "").toUpperCase(), true)).toEqual(fragments)
    expect(demoAnswer.match(/[\p{L}\p{N}]+/gu)?.length).toBeGreaterThanOrEqual(2500)
    expect(demoAnswer.match(/[\p{L}\p{N}]+/gu)?.length).toBeLessThanOrEqual(4000)
    for (const language of ["bash", "python", "typescript", "json", "sql"]) {
      expect(demoAnswer).toContain("```" + language + "\n")
    }
  })

  it("keeps the short reply for other questions and outside demo mode", () => {
    const shortReply = "Это тестовый ответ в локальном предпросмотре."

    expect(previewReply(demoQuestion, false).join("")).toBe(shortReply)
    expect(previewReply("Привет!", true).join("")).toBe(shortReply)
  })
})
