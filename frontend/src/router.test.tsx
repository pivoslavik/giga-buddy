import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { User } from "./entities/session/session"
import { intern, json, mockApi, renderApp, status } from "./test/app"

function renderWithSession(path: string, session: User | null) {
  const fetchMock = mockApi({ "GET /api/user": () => (session ? json(session) : status(401)) })
  return { ...renderApp(path), fetchMock }
}

const landingHeading = { level: 1, name: "Твой AI-помощник на стажировке" } as const

describe("session-based routing", () => {
  it("shows the landing page to guests", async () => {
    const { router } = renderWithSession("/welcome", null)

    expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/welcome")
  })

  it.each(["/", "/profile", "/chat"])(
    "sends guests from %s, which needs a session, to the landing page",
    async (path) => {
      const { router } = renderWithSession(path, null)

      expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
      expect(router.state.location.pathname).toBe("/welcome")
    },
  )

  it("lets users with a session into the app", async () => {
    const { router } = renderWithSession("/", intern)

    expect(await screen.findByRole("heading", { name: "Привет, Аня!" })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
  })

  it("sends users with a session from the landing page to the app", async () => {
    const { router, fetchMock } = renderWithSession("/welcome", intern)

    expect(await screen.findByRole("heading", { name: "Привет, Аня!" })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
    // both guards read the session from the query cache instead of refetching it
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
