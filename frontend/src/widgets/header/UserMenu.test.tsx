import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { User } from "../../entities/session/session"
import { intern, json, mockApi, renderApp, status } from "../../test/app"

const landingHeading = { level: 1, name: "Твой AI-помощник на стажировке" } as const

/** A backend with a logged-in intern; `onLogout` decides what POST /api/auth/logout does. */
function renderLoggedIn(
  onLogout: (session: { user: User | null }) => Response | Promise<Response>,
) {
  const session: { user: User | null } = { user: intern }
  const fetchMock = mockApi({
    "GET /api/user": () => (session.user ? json(session.user) : status(401)),
    "POST /api/auth/logout": () => onLogout(session),
  })
  const app = renderApp("/")
  return { ...app, fetchMock }
}

const endSession = (session: { user: User | null }) => {
  session.user = null
  return status(204)
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const toggle = await screen.findByRole("button", { name: "Аккаунт: Аня" })
  await user.click(toggle)
  return toggle
}

function logoutCalls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.filter(([path]) => path === "/api/auth/logout")
}

describe("UserMenu", () => {
  it("shows the initial of the user and who is logged in", async () => {
    const user = userEvent.setup()
    renderLoggedIn(endSession)
    const toggle = await screen.findByRole("button", { name: "Аккаунт: Аня" })
    expect(toggle).toHaveTextContent("А")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("intern@example.com")).not.toBeVisible()

    await user.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("intern@example.com")).toBeVisible()
    expect(screen.getByRole("button", { name: "Выйти из аккаунта" })).toBeVisible()
  })

  it("closes on Escape and returns focus to the avatar", async () => {
    const user = userEvent.setup()
    renderLoggedIn(endSession)
    const toggle = await openMenu(user)
    await user.tab()
    expect(screen.getByRole("button", { name: "Выйти из аккаунта" })).toHaveFocus()

    await user.keyboard("{Escape}")

    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveFocus()
  })

  it("closes on a click outside, but not on a click inside", async () => {
    const user = userEvent.setup()
    renderLoggedIn(endSession)
    const toggle = await openMenu(user)

    await user.click(screen.getByText("intern@example.com"))
    expect(toggle).toHaveAttribute("aria-expanded", "true")

    await user.click(screen.getByRole("heading", { level: 1 }))
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  it("closes when focus leaves it", async () => {
    const user = userEvent.setup()
    renderLoggedIn(endSession)
    const toggle = await openMenu(user)

    await user.tab()
    await user.tab()

    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  it("logs out and opens the landing page", async () => {
    const user = userEvent.setup()
    const { router, fetchMock } = renderLoggedIn(endSession)
    await openMenu(user)

    await user.click(screen.getByRole("button", { name: "Выйти из аккаунта" }))

    expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/welcome")
    expect(logoutCalls(fetchMock)).toHaveLength(1)
  })

  it("ignores repeated clicks while logging out", async () => {
    const user = userEvent.setup()
    let finishLogout = () => {}
    const { fetchMock } = renderLoggedIn(
      (session) =>
        new Promise((resolve) => {
          finishLogout = () => resolve(endSession(session))
        }),
    )
    await openMenu(user)

    await user.click(screen.getByRole("button", { name: "Выйти из аккаунта" }))
    const pending = screen.getByRole("button", { name: "Выходим…" })
    expect(pending).toHaveAttribute("aria-disabled", "true")
    await user.click(pending)
    finishLogout()

    expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
    expect(logoutCalls(fetchMock)).toHaveLength(1)
  })

  it.each([
    ["the backend fails", () => status(500)],
    ["the session is still there", () => status(204)],
  ])("stays in the app and says so when %s", async (_, onLogout) => {
    const user = userEvent.setup()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { router } = renderLoggedIn(onLogout)
    const toggle = await openMenu(user)

    await user.click(screen.getByRole("button", { name: "Выйти из аккаунта" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось выйти")
    expect(router.state.location.pathname).toBe("/")
    expect(warn).toHaveBeenCalledOnce()

    // the error belongs to that attempt: a reopened menu starts clean
    await user.click(toggle)
    await user.click(toggle)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
