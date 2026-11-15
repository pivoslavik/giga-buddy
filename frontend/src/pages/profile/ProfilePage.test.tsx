import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { User } from "../../entities/session/session"
import { intern, json, mockApi, renderApp, status } from "../../test/app"

const landingHeading = { level: 1, name: "Твой AI-помощник на стажировке" } as const

/** Opens /profile for `account`; `onLogout` decides what POST /api/auth/logout does. */
async function renderProfile(
  account: User = intern,
  onLogout: (session: { user: User | null }) => Response | Promise<Response> = () => status(500),
) {
  const session: { user: User | null } = { user: account }
  mockApi({
    "GET /api/user": () => (session.user ? json(session.user) : status(401)),
    "POST /api/auth/logout": () => onLogout(session),
  })
  const app = renderApp("/profile")
  await screen.findByRole("heading", { level: 1, name: "Личный кабинет" })
  return { ...app, card: within(screen.getByRole("region", { name: "Данные аккаунта" })) }
}

const endSession = (session: { user: User | null }) => {
  session.user = null
  return status(204)
}

describe("ProfilePage", () => {
  it("shows the account of the user", async () => {
    const { card } = await renderProfile()

    expect(card.getByText("Аня")).toBeVisible()
    expect(card.getByText("Стажёр")).toBeVisible()
    expect(card.getByText("Логин").nextElementSibling).toHaveTextContent("intern")
    expect(card.getByText("Электронная почта").nextElementSibling).toHaveTextContent(
      "intern@example.com",
    )
  })

  it("names the user by the login without a display name, and shows a role it does not know", async () => {
    const { card } = await renderProfile({ ...intern, display_name: "  ", role: "mentor" })

    expect(card.getAllByText("intern")).toHaveLength(2)
    expect(card.getByText("mentor")).toBeVisible()
  })

  it("logs out and opens the landing page", async () => {
    const user = userEvent.setup()
    let finishLogout = () => {}
    const { card, router } = await renderProfile(
      intern,
      (session) =>
        new Promise((resolve) => {
          finishLogout = () => resolve(endSession(session))
        }),
    )

    await user.click(card.getByRole("button", { name: "Выйти из аккаунта" }))
    expect(card.getByRole("button", { name: "Выходим…" })).toBeDisabled()
    finishLogout()

    expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/welcome")
  })

  it("stays on the page and says so when logging out fails", async () => {
    const user = userEvent.setup()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { card, router } = await renderProfile()

    await user.click(card.getByRole("button", { name: "Выйти из аккаунта" }))

    expect(await card.findByRole("alert")).toHaveTextContent("Не удалось выйти")
    expect(card.getByRole("button", { name: "Выйти из аккаунта" })).toBeEnabled()
    expect(router.state.location.pathname).toBe("/profile")
    expect(warn).toHaveBeenCalledOnce()
  })
})
