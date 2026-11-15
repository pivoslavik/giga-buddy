import { describe, expect, it } from "vitest"
import { json, mockApi } from "../../test/app"
import {
  fetchDocument,
  fetchDocuments,
  findDocumentByTitle,
  type DocumentSummary,
} from "./document"

const card = (id: number, title: string): DocumentSummary => ({
  id,
  title,
  description: "Описание.",
  category: "start_work",
})

describe("findDocumentByTitle", () => {
  it("prefers the document with exactly this title", () => {
    const documents = [card(1, "Первые шаги стажёра"), card(2, "Первые шаги")]

    expect(findDocumentByTitle(documents, "Первые шаги")?.id).toBe(2)
  })

  it("takes a refined title, whatever the case and «ё»", () => {
    const documents = [card(1, "Первый день"), card(2, "ПЕРВЫЕ ШАГИ стажера")]

    expect(findDocumentByTitle(documents, "Первые шаги стажёра")?.id).toBe(2)
    expect(findDocumentByTitle(documents, "первые шаги")?.id).toBe(2)
  })

  it("finds nothing when no title has the words", () => {
    expect(findDocumentByTitle([card(1, "Первый день")], "Первые шаги")).toBeUndefined()
  })
})

describe("fetchDocument", () => {
  it("adds the id the backend does not send", async () => {
    mockApi({
      "GET /api/documents/5": () =>
        json({ title: "Code review", category: "development", text: "# Code review" }),
    })

    expect(await fetchDocument(5)).toEqual({
      id: 5,
      title: "Code review",
      category: "development",
      text: "# Code review",
    })
  })

  it("rejects an answer that is not a document", async () => {
    mockApi({ "GET /api/documents/5": () => json(["Code review"]) })

    await expect(fetchDocument(5)).rejects.toThrow("Expected a document")
  })

  it("leaves the category empty when the backend sends none", async () => {
    mockApi({ "GET /api/documents/5": () => json({ title: "Code review", text: "Текст" }) })

    expect(await fetchDocument(5)).toMatchObject({ category: "" })
  })
})

describe("fetchDocuments", () => {
  it("rejects an answer that is not a list", async () => {
    mockApi({ "GET /api/documents": () => json({ documents: [] }) })

    await expect(fetchDocuments()).rejects.toThrow("Expected a list of documents")
  })
})
