import { describe, expect, it } from "vitest"
import type { DocumentSummary } from "../../entities/document/document"
import { documentCount, filterDocuments } from "./filterDocuments"

const documents: DocumentSummary[] = [
  {
    id: 1,
    title: "Настройка окружения",
    description: "Подготовь инструменты и запусти проект локально.",
    category: "development",
  },
  {
    id: 2,
    title: "Как мы работаем",
    description: "Задачи, встречи и правила взаимодействия в команде.",
    category: "work_processes",
  },
  {
    id: 3,
    title: "Code review",
    description: "Как подготовить изменения и получить обратную связь.",
    category: "development",
  },
  {
    id: 4,
    title: "Ёлка в офисе",
    description: "Когда и где проходит новогодний праздник.",
    category: "company",
  },
]

const titles = (list: DocumentSummary[]) => list.map(({ title }) => title)
const all = { query: "", category: "all", order: "asc" } as const

describe("filterDocuments", () => {
  it("sorts every document by title, Russian ones first, in both directions", () => {
    expect(titles(filterDocuments(documents, all))).toEqual([
      "Ёлка в офисе",
      "Как мы работаем",
      "Настройка окружения",
      "Code review",
    ])
    expect(titles(filterDocuments(documents, { ...all, order: "desc" }))).toEqual([
      "Code review",
      "Настройка окружения",
      "Как мы работаем",
      "Ёлка в офисе",
    ])
  })

  it("finds every word of the query in the title or the description, in any order and case", () => {
    const search = (query: string) => titles(filterDocuments(documents, { ...all, query }))

    expect(search("ПРОЕКТ  настройка ")).toEqual(["Настройка окружения"])
    expect(search("как")).toEqual(["Как мы работаем", "Code review"])
    expect(search("review связь")).toEqual(["Code review"])
    expect(search("review встречи")).toEqual([])
    expect(search("   ")).toHaveLength(documents.length)
  })

  it("treats «ё» and «е» as the same letter", () => {
    const search = (query: string) => titles(filterDocuments(documents, { ...all, query }))

    expect(search("елка")).toEqual(["Ёлка в офисе"])
    expect(search("новогодний ёлка")).toEqual(["Ёлка в офисе"])
  })

  it("finds Russian words in other forms than the query", () => {
    const search = (query: string) => titles(filterDocuments(documents, { ...all, query }))

    expect(search("окружение")).toEqual(["Настройка окружения"])
    expect(search("настройки инструментов")).toEqual(["Настройка окружения"])
    expect(search("елки праздники")).toEqual(["Ёлка в офисе"])
    expect(search("работа команды")).toEqual(["Как мы работаем"])
    // short words keep their ending, or «мы» would find every «м»
    expect(search("мы")).toEqual(["Как мы работаем"])
  })

  it("keeps only the chosen category", () => {
    const development = filterDocuments(documents, { ...all, category: "development" })

    expect(titles(development)).toEqual(["Настройка окружения", "Code review"])
    expect(filterDocuments(documents, { ...all, category: "contacts" })).toEqual([])
  })

  it("leaves the given list as it is", () => {
    const copy = [...documents]

    filterDocuments(documents, { ...all, order: "desc" })

    expect(documents).toEqual(copy)
  })
})

describe("documentCount", () => {
  it.each([
    [0, "0 документов"],
    [1, "1 документ"],
    [3, "3 документа"],
    [6, "6 документов"],
    [11, "11 документов"],
    [21, "21 документ"],
    [24, "24 документа"],
  ])("says %i as «%s»", (count, text) => {
    expect(documentCount(count)).toBe(text)
  })
})
