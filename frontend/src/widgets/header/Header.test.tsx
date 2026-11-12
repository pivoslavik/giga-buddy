import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { intern, json, mockApi, renderApp } from "../../test/app"

function renderWithUser(path: string) {
  mockApi({ "GET /api/user": () => json(intern) })
  return renderApp(path)
}

async function findNavigation() {
  return within(await screen.findByRole("navigation", { name: "Разделы" }))
}

describe("Header", () => {
  it("links to every section of the app", async () => {
    renderWithUser("/")
    const nav = await findNavigation()

    expect(nav.getByRole("link", { name: "Главная" })).toHaveAttribute("href", "/")
    expect(nav.getByRole("link", { name: "Личный кабинет" })).toHaveAttribute("href", "/profile")
    expect(nav.getByRole("link", { name: "Чат" })).toHaveAttribute("href", "/chat")
  })

  it.each([
    ["/", "Главная"],
    ["/profile", "Личный кабинет"],
    ["/chat", "Чат"],
  ])("marks the section of %s as the current page", async (path, section) => {
    renderWithUser(path)
    const nav = await findNavigation()

    const current = nav
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page")
    expect(current.map((link) => link.textContent)).toEqual([section])
  })

  it("opens a section from the navigation and comes back by the logo", async () => {
    const user = userEvent.setup()
    const { router } = renderWithUser("/")
    const nav = await findNavigation()

    await user.click(nav.getByRole("link", { name: "Чат" }))

    expect(await screen.findByRole("heading", { level: 1, name: "Чат с AI Buddy" })).toBeVisible()
    expect(router.state.location.pathname).toBe("/chat")

    await user.click(screen.getByRole("link", { name: "AI Buddy, на главную" }))

    expect(await screen.findByRole("heading", { level: 1, name: "С чего начнём?" })).toBeVisible()
    expect(router.state.location.pathname).toBe("/")
  })
})
