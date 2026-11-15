import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { intern, json, mockApi, renderApp } from "../../test/app"
import { FAQ, FIRST_STEPS } from "./homeContent"

type Handlers = Parameters<typeof mockApi>[0]

async function renderHome(handlers: Handlers = {}) {
  const fetchMock = mockApi({ "GET /api/user": () => json(intern), ...handlers })
  const app = renderApp("/")
  await screen.findByRole("heading", { level: 1, name: "С чего начнём?" })
  return { ...app, fetchMock }
}

const firstDay = {
  id: 1,
  title: "Первый день в команде",
  description: "Доступы, знакомства и первые шаги на стажировке.",
  category: "start_work",
}

const region = (name: string) => within(screen.getByRole("region", { name }))

/** The <details> of a FAQ question: its <summary> is the element with the question text. */
function faqItem(question: string) {
  return screen.getByText(question).closest("details") as HTMLDetailsElement
}

describe("HomePage", () => {
  it("says where to start", async () => {
    await renderHome()

    expect(screen.getByText("Освойся в команде и найди ответы вместе с AI Buddy")).toBeVisible()
  })

  it("lists the first steps in order", async () => {
    await renderHome()
    const steps = region("Первые шаги")

    const items = steps.getAllByRole("listitem")
    expect(items).toHaveLength(FIRST_STEPS.length)
    expect(items.map((item) => within(item).getByRole("heading").textContent)).toEqual([
      "Получи доступы",
      "Настрой окружение",
      "Изучи проект",
      "Возьми первую задачу",
    ])
    expect(steps.getByRole("list").tagName).toBe("OL")
  })

  it("opens the document with the first steps from the knowledge base", async () => {
    const user = userEvent.setup()
    const firstSteps = {
      id: 13,
      title: "Первые шаги стажёра",
      description: "План на первую неделю.",
      category: "start_work",
    }
    const { fetchMock } = await renderHome({
      "GET /api/documents": () => json([firstDay, firstSteps]),
      "GET /api/documents/13": () =>
        json({
          title: firstSteps.title,
          category: "start_work",
          text: "# Первые шаги\n\n## 1. Получи доступы\n\nПроверь доступ к репозиторию.",
        }),
    })
    // the main page itself does not ask for documents
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Открыть документ „Первые шаги“" }))

    const dialog = (await screen.findByRole("dialog", {
      name: "Первые шаги стажёра",
    })) as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(dialog).toHaveAccessibleDescription("План на первую неделю.")
    expect(
      await within(dialog).findByRole("heading", { level: 3, name: "1. Получи доступы" }),
    ).toBeVisible()
    expect(within(dialog).getByRole("link", { name: "Открыть в новой вкладке" })).toHaveAttribute(
      "href",
      "/knowledge-base?doc=13",
    )

    await user.click(within(dialog).getByRole("button", { name: "Закрыть" }))

    expect(dialog.open).toBe(false)
  })

  it("says when the knowledge base has no document with the first steps", async () => {
    const user = userEvent.setup()
    await renderHome({ "GET /api/documents": () => json([firstDay]) })

    await user.click(screen.getByRole("button", { name: "Открыть документ „Первые шаги“" }))

    const dialog = await screen.findByRole("dialog", { name: "Документ не найден" })
    expect(within(dialog).getByRole("link", { name: "базе знаний" })).toHaveAttribute(
      "href",
      "/knowledge-base",
    )
    expect(within(dialog).getByRole("link", { name: "спроси AI Buddy" })).toHaveAttribute(
      "href",
      "/chat",
    )
    expect(
      within(dialog).queryByRole("link", { name: "Открыть в новой вкладке" }),
    ).not.toBeInTheDocument()
  })

  it("answers the first question right away and the rest on demand", async () => {
    const user = userEvent.setup()
    await renderHome()
    const faq = region("Частые вопросы")

    expect(faq.getAllByText(/\?$/)).toHaveLength(FAQ.length)
    expect(faqItem("Как запустить проект локально?").open).toBe(true)
    expect(faq.getByText("docker compose up -d --build")).toBeVisible()

    const question = "Как подготовить код к ревью?"
    expect(faqItem(question).open).toBe(false)

    await user.click(screen.getByText(question))

    expect(faqItem(question).open).toBe(true)
    expect(faq.getByText(/линтер и тесты проходят/)).toBeVisible()
  })

  it("leads to the knowledge base from the answer about documentation", async () => {
    const user = userEvent.setup()
    const { router } = await renderHome()

    await user.click(screen.getByText("Где найти документацию проекта?"))
    await user.click(screen.getByRole("link", { name: "Открыть базу знаний" }))

    expect(await screen.findByRole("heading", { level: 1, name: "База знаний" })).toBeVisible()
    expect(router.state.location.pathname).toBe("/knowledge-base")
  })

  it("leads to the chat for other questions", async () => {
    const user = userEvent.setup()
    const { router } = await renderHome()
    const banner = region("Остались вопросы?")

    await user.click(banner.getByRole("link", { name: "Перейти в чат" }))

    expect(await screen.findByRole("heading", { level: 1, name: "Чат с AI Buddy" })).toBeVisible()
    expect(router.state.location.pathname).toBe("/chat")
  })
})
