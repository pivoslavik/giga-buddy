import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENTS_LIMIT,
  type DocumentSummary,
} from "../../entities/document/document"
import { intern, json, mockApi, renderApp, status } from "../../test/app"

const DOCUMENTS: DocumentSummary[] = [
  {
    id: 1,
    title: "Первый день в команде",
    description: "Доступы, знакомства и первые шаги на стажировке.",
    category: "start_work",
  },
  {
    id: 2,
    title: "Настройка окружения",
    description: "Подготовь инструменты и запусти проект локально.",
    category: "development",
  },
  {
    id: 3,
    title: "Архитектура проекта",
    description: "Как устроены сервисы и как они связаны между собой.",
    category: "development",
  },
  {
    id: 4,
    title: "К кому обратиться",
    description: "Найди нужного человека и получи помощь.",
    category: "contacts",
  },
]

type DocumentsHandler = () => Response | Promise<Response>

/** GET /api/documents/{id} of every document in the list: a heading and a line of text. */
const documentHandlers = Object.fromEntries(
  DOCUMENTS.map(({ id, title, category }) => [
    `GET /api/documents/${id}`,
    () => json({ title, category, text: `# ${title}\n\nТекст документа «${title}».` }),
  ]),
)

async function renderKnowledgeBase(
  path = "/knowledge-base",
  documents: DocumentsHandler = () => json(DOCUMENTS),
) {
  const fetchMock = mockApi({
    "GET /api/user": () => json(intern),
    "GET /api/documents": documents,
    ...documentHandlers,
  })
  const app = renderApp(path)
  await screen.findByRole("heading", { level: 1, name: "База знаний" })
  return { ...app, fetchMock }
}

const documentList = () => within(screen.getByRole("region", { name: /документы|Разработка/ }))
const cardTitles = async () => {
  const links = await documentList().findAllByRole("link")
  return links.map((link) => link.textContent)
}
const categoryButton = (name: string) =>
  within(screen.getByRole("group", { name: "Категории" })).getByRole("button", { name })

describe("KnowledgeBasePage", () => {
  it("asks for every category at once and lists the documents by title", async () => {
    const { fetchMock } = await renderKnowledgeBase()

    expect(await cardTitles()).toEqual([
      "Архитектура проекта",
      "К кому обратиться",
      "Настройка окружения",
      "Первый день в команде",
    ])
    expect(screen.getByRole("heading", { level: 2, name: "Все документы" })).toBeVisible()
    expect(screen.getByText("4 документа")).toBeVisible()

    const [url] = fetchMock.mock.calls.map(([input]) => String(input)).slice(-1)
    const query = new URL(url, "http://app").searchParams
    expect(query.get("amount")).toBe(String(DOCUMENTS_LIMIT))
    expect(query.getAll("category")).toEqual([...DOCUMENT_CATEGORIES])
  })

  it("shows a card with its category, description and the way to the document", async () => {
    await renderKnowledgeBase()

    const link = await screen.findByRole("link", { name: "Настройка окружения" })
    const card = link.closest("li") as HTMLElement

    expect(link).toHaveAttribute("href", "/knowledge-base?doc=2")
    expect(within(card).getByText("Разработка")).toBeVisible()
    expect(within(card).getByText("Подготовь инструменты и запусти проект локально.")).toBeVisible()
    expect(within(card).getByText("Открыть документ")).toBeVisible()
  })

  it("searches the titles and descriptions as the user types", async () => {
    const user = userEvent.setup()
    await renderKnowledgeBase()
    await cardTitles()

    await user.type(screen.getByRole("searchbox"), "сервисы проект")

    await waitFor(async () => expect(await cardTitles()).toEqual(["Архитектура проекта"]))
    expect(screen.getByText("1 документ")).toBeVisible()
  })

  it("says when nothing is found and brings every document back", async () => {
    const user = userEvent.setup()
    await renderKnowledgeBase()
    await cardTitles()
    await user.click(categoryButton("Контакты"))

    await user.type(screen.getByRole("searchbox"), "бухгалтерия")

    expect(await screen.findByText("Ничего не нашлось")).toBeVisible()
    expect(screen.getByText("0 документов")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Показать все документы" }))

    expect(screen.getByRole("searchbox")).toHaveValue("")
    expect(categoryButton("Все документы")).toHaveAttribute("aria-pressed", "true")
    expect(await cardTitles()).toHaveLength(DOCUMENTS.length)
  })

  it("filters by the categories that have documents", async () => {
    const user = userEvent.setup()
    await renderKnowledgeBase()
    await cardTitles()

    const categories = within(screen.getByRole("group", { name: "Категории" }))
    expect(categories.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Все документы",
      "Начало работы",
      "Разработка",
      "Контакты",
    ])
    expect(categoryButton("Все документы")).toHaveAttribute("aria-pressed", "true")

    await user.click(categoryButton("Разработка"))

    expect(categoryButton("Разработка")).toHaveAttribute("aria-pressed", "true")
    expect(categoryButton("Все документы")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("heading", { level: 2, name: "Разработка" })).toBeVisible()
    expect(await cardTitles()).toEqual(["Архитектура проекта", "Настройка окружения"])
    expect(screen.getByText("2 документа")).toBeVisible()

    await user.click(categoryButton("Все документы"))

    expect(categoryButton("Все документы")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("heading", { level: 2, name: "Все документы" })).toBeVisible()
    expect(await cardTitles()).toHaveLength(DOCUMENTS.length)
  })

  it("orders the categories like the knowledge base does and marks every card with its own", async () => {
    // one document of every category, in the reverse order
    const documents = DOCUMENT_CATEGORIES.toReversed().map((category, index) => ({
      id: 10 + index,
      title: `Документ ${index}`,
      description: "Описание.",
      category,
    }))
    await renderKnowledgeBase("/knowledge-base", () => json(documents))
    await cardTitles()

    const categories = within(screen.getByRole("group", { name: "Категории" }))
    expect(categories.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Все документы",
      ...DOCUMENT_CATEGORIES.map((category) => DOCUMENT_CATEGORY_LABELS[category]),
    ])
    for (const { title, category } of documents) {
      const card = screen.getByRole("link", { name: title }).closest("li") as HTMLElement
      expect(within(card).getByText(DOCUMENT_CATEGORY_LABELS[category])).toBeVisible()
      expect(card.querySelector("svg")).toBeInTheDocument()
    }
  })

  it("reverses the order of the documents and back", async () => {
    const user = userEvent.setup()
    await renderKnowledgeBase()
    const ascending = await cardTitles()

    await user.click(screen.getByRole("button", { name: "По названию, от А до Я" }))

    expect(screen.getByRole("button", { name: "По названию, от Я до А" })).toBeVisible()
    expect(await cardTitles()).toEqual([
      "Первый день в команде",
      "Настройка окружения",
      "К кому обратиться",
      "Архитектура проекта",
    ])

    await user.click(screen.getByRole("button", { name: "По названию, от Я до А" }))

    expect(await cardTitles()).toEqual(ascending)
  })

  it("moves the focus to the search on Ctrl+K and ⌘K", async () => {
    const user = userEvent.setup()
    await renderKnowledgeBase()
    const search = screen.getByRole("searchbox")

    await user.keyboard("{Control>}k{/Control}")
    expect(search).toHaveFocus()

    search.blur()
    await user.keyboard("{Meta>}k{/Meta}")
    expect(search).toHaveFocus()
  })

  it("opens a document over the list and goes back to the list when it is closed", async () => {
    const user = userEvent.setup()
    const { router } = await renderKnowledgeBase()
    await user.type(screen.getByRole("searchbox"), "окружение")

    await user.click(await screen.findByRole("link", { name: "Настройка окружения" }))

    const dialog = (await screen.findByRole("dialog", {
      name: "Настройка окружения",
    })) as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(router.state.location.search).toEqual({ doc: 2 })
    expect(await within(dialog).findByText("Текст документа «Настройка окружения».")).toBeVisible()

    await user.click(within(dialog).getByRole("button", { name: "Закрыть" }))

    await waitFor(() => expect(router.state.location.search).toEqual({}))
    expect(dialog.open).toBe(false)
    // closing went back in history instead of adding the list once more
    expect(router.history.canGoBack()).toBe(false)
    // the search survives the document
    expect(screen.getByRole("searchbox")).toHaveValue("окружение")
  })

  it("closes the document on Back without leaving the list", async () => {
    const user = userEvent.setup()
    const { router } = await renderKnowledgeBase()

    await user.click(await screen.findByRole("link", { name: "Архитектура проекта" }))
    const dialog = (await screen.findByRole("dialog")) as HTMLDialogElement

    router.history.back()

    await waitFor(() => expect(dialog.open).toBe(false))
    expect(router.state.location.pathname).toBe("/knowledge-base")
    expect(router.state.location.search).toEqual({})
  })

  it("opens a document from its link and leaves the list in its place when it is closed", async () => {
    const user = userEvent.setup()
    const { router } = await renderKnowledgeBase("/knowledge-base?doc=4")

    const dialog = (await screen.findByRole("dialog", {
      name: "К кому обратиться",
    })) as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(await within(dialog).findByText("Текст документа «К кому обратиться».")).toBeVisible()

    await user.keyboard("{Escape}")
    // jsdom does not close a modal dialog on Esc by itself
    dialog.close()

    await waitFor(() => expect(router.state.location.search).toEqual({}))
    expect(router.state.location.pathname).toBe("/knowledge-base")
    expect(router.history.canGoBack()).toBe(false)
  })

  it("ignores a document id that is not a number", async () => {
    const { router } = await renderKnowledgeBase("/knowledge-base?doc=abc")
    await cardTitles()

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(router.state.location.search).toEqual({ doc: undefined })
  })

  it("shows the documents of categories it does not know yet under «all»", async () => {
    await renderKnowledgeBase("/knowledge-base", () =>
      json([{ id: 7, title: "Глоссарий", description: "Термины проекта.", category: "glossary" }]),
    )

    const card = (await screen.findByRole("link", { name: "Глоссарий" })).closest("li")
    expect(card).toHaveTextContent("Другое")
    expect(
      within(screen.getByRole("group", { name: "Категории" })).getAllByRole("button"),
    ).toHaveLength(1)
  })

  it("says when the knowledge base is empty", async () => {
    await renderKnowledgeBase("/knowledge-base", () => json([]))

    expect(await screen.findByText("В базе знаний пока нет документов")).toBeVisible()
    expect(screen.getByText("0 документов")).toBeVisible()
  })

  it("shows loading placeholders until the documents arrive", async () => {
    let respond: (response: Response) => void = () => {}
    await renderKnowledgeBase(
      "/knowledge-base",
      () => new Promise<Response>((resolve) => (respond = resolve)),
    )

    expect(screen.getByRole("status")).toHaveTextContent("Загружаем документы…")

    respond(json(DOCUMENTS))

    expect(await cardTitles()).toHaveLength(DOCUMENTS.length)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("offers to try again when the documents fail to load", async () => {
    const user = userEvent.setup()
    let fails = true
    await renderKnowledgeBase("/knowledge-base", () => (fails ? status(500) : json(DOCUMENTS)))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Не удалось загрузить документы")

    fails = false
    await user.click(within(alert).getByRole("button", { name: "Попробовать ещё раз" }))

    expect(await cardTitles()).toHaveLength(DOCUMENTS.length)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("leads to the chat when the answer is not in the documents", async () => {
    await renderKnowledgeBase()

    expect(screen.getByRole("link", { name: "Спроси AI Buddy" })).toHaveAttribute("href", "/chat")
  })
})
