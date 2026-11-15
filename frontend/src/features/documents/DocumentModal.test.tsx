import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { DocumentSummary } from "../../entities/document/document"
import { intern, json, mockApi, renderApp, status } from "../../test/app"

const SETUP: DocumentSummary = {
  id: 2,
  title: "Настройка окружения",
  description: "Подготовь инструменты и запусти проект локально.",
  category: "development",
}

const SETUP_TEXT = `# Настройка окружения

## 1. Необходимые инструменты

- **Docker** — для запуска сервисов
- **Git** — для работы с репозиторием

## 2. Запуск проекта

\`\`\`bash
git clone git@github.com:pivoslavik/giga-buddy.git
docker compose up -d --build
\`\`\`

> Подробная инструкция — в файле \`README.md\`.
`

type Handler = () => Response | Promise<Response>

/** The knowledge base with one document open in the modal, by its link. */
async function openDocument(
  id: number,
  document: Handler = () =>
    json({ title: SETUP.title, category: SETUP.category, text: SETUP_TEXT }),
  list: Handler = () => json([SETUP]),
) {
  const fetchMock = mockApi({
    "GET /api/user": () => json(intern),
    "GET /api/documents": list,
    [`GET /api/documents/${id}`]: document,
  })
  renderApp(`/knowledge-base?doc=${id}`)
  const dialog = await screen.findByRole("dialog")
  return { dialog, fetchMock }
}

describe("DocumentModal", () => {
  it("shows the document under its category with the description from its card", async () => {
    const { dialog } = await openDocument(2)

    const steps = await within(dialog).findByRole("heading", {
      level: 3,
      name: "1. Необходимые инструменты",
    })
    expect(steps).toBeVisible()
    expect(dialog).toHaveAccessibleName("Настройка окружения")
    expect(dialog).toHaveAccessibleDescription("Подготовь инструменты и запусти проект локально.")
    expect(dialog).toHaveTextContent(/^Разработка/)
    // the heading of the text is the title of the modal, it is not repeated
    expect(within(dialog).getAllByRole("heading", { name: "Настройка окружения" })).toHaveLength(1)
    expect(within(dialog).getByText("Docker")).toBeVisible()
    expect(within(dialog).getByText(/Подробная инструкция/)).toBeVisible()
  })

  it("asks for the document by its id", async () => {
    const { dialog, fetchMock } = await openDocument(2)
    await within(dialog).findByText("Docker")

    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls).toContain("/api/documents/2")
  })

  it("links the document for a new tab", async () => {
    const { dialog } = await openDocument(2)

    const link = within(dialog).getByRole("link", { name: "Открыть в новой вкладке" })
    expect(link).toHaveAttribute("href", "/knowledge-base?doc=2")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("copies a command from the document", async () => {
    const user = userEvent.setup()
    const { dialog } = await openDocument(2)

    await user.click(await within(dialog).findByRole("button", { name: "Скопировать код" }))

    expect(await navigator.clipboard.readText()).toBe(
      "git clone git@github.com:pivoslavik/giga-buddy.git\ndocker compose up -d --build",
    )
    expect(within(dialog).getByRole("status")).toHaveTextContent("Скопировано")
  })

  it("shows the card of the document while its text is loading", async () => {
    let respond: (response: Response) => void = () => {}
    const { dialog } = await openDocument(
      2,
      () => new Promise<Response>((resolve) => (respond = resolve)),
    )

    expect(
      await within(dialog).findByRole("heading", { name: "Настройка окружения" }),
    ).toBeVisible()
    expect(within(dialog).getByRole("status")).toHaveTextContent("Загружаем документ…")

    respond(json({ title: SETUP.title, category: SETUP.category, text: SETUP_TEXT }))

    expect(await within(dialog).findByText("Docker")).toBeVisible()
    expect(within(dialog).queryByText("Загружаем документ…")).not.toBeInTheDocument()
  })

  it("loads a document that is not in the list of the knowledge base", async () => {
    const { dialog } = await openDocument(
      42,
      () => json({ title: "Глоссарий", category: "glossary", text: "Термины проекта." }),
      () => json([]),
    )

    expect(await within(dialog).findByText("Термины проекта.")).toBeVisible()
    expect(dialog).toHaveAccessibleName("Глоссарий")
    // a category the frontend does not know yet
    expect(dialog).toHaveTextContent(/^Другое/)
  })

  it("says when the document does not exist", async () => {
    const { dialog } = await openDocument(99, () => status(404))

    expect(await within(dialog).findByRole("heading", { name: "Документ не найден" })).toBeVisible()
    expect(within(dialog).getByRole("link", { name: "спроси AI Buddy" })).toHaveAttribute(
      "href",
      "/chat",
    )
    expect(
      within(dialog).queryByRole("link", { name: "Открыть в новой вкладке" }),
    ).not.toBeInTheDocument()
  })

  it("offers to try again when the document fails to load", async () => {
    const user = userEvent.setup()
    let fails = true
    const { dialog } = await openDocument(2, () =>
      fails
        ? status(500)
        : json({ title: SETUP.title, category: SETUP.category, text: SETUP_TEXT }),
    )

    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent("Не удалось загрузить документ")
    // the card of the list still names the document
    expect(within(dialog).getByRole("heading", { name: SETUP.title })).toBeVisible()

    fails = false
    await user.click(within(alert).getByRole("button", { name: "Попробовать ещё раз" }))

    expect(await within(dialog).findByText("Docker")).toBeVisible()
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()
  })

  it("calls a document that failed to load and is not in the list just «Документ»", async () => {
    const { dialog } = await openDocument(5, () => status(500))

    expect(await within(dialog).findByRole("alert")).toBeVisible()
    expect(within(dialog).getByRole("heading", { name: "Документ" })).toBeVisible()
  })

  it("treats an answer without a text as a failure", async () => {
    const { dialog } = await openDocument(2, () => json({ title: SETUP.title }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Не удалось загрузить документ",
    )
  })
})
