import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { User } from "./entities/session/session"
import { intern, json, mockApi, renderApp, status } from "./test/app"

function renderWithSession(path: string, session: User | null) {
  const fetchMock = mockApi({
    "GET /api/user": () => (session ? json(session) : status(401)),
    "POST /api/auth/refresh": () => status(401),
    "GET /api/chat": () => json({ messages: [] }),
  })
  return { ...renderApp(path), fetchMock }
}

const landingHeading = { level: 1, name: "Твой AI-помощник на стажировке" } as const

describe("session-based routing", () => {
  it("shows the landing page to guests", async () => {
    const { router } = renderWithSession("/welcome", null)

    expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/welcome")
  })

  it.each(["/", "/profile", "/chat", "/knowledge-base"])(
    "sends guests from %s, which needs a session, to the landing page",
    async (path) => {
      const { router, fetchMock } = renderWithSession(path, null)

      expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
      expect(router.state.location.pathname).toBe("/welcome")
      expect(fetchMock.mock.calls.map(([url, init]) => [init?.method ?? "GET", url])).toEqual([
        ["GET", "/api/user"],
        ["POST", "/api/auth/refresh"],
      ])
    },
  )

  it("lets users with a session into the app", async () => {
    const { router } = renderWithSession("/", intern)

    expect(
      await screen.findByRole("heading", { level: 1, name: "С чего начнём?" }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
  })

  it("shows the chat under the shared layout and loads the signed-in user's history", async () => {
    const { router, fetchMock } = renderWithSession("/chat", intern)

    const heading = await screen.findByRole("heading", { level: 1, name: "Чат с AI Buddy" })
    expect(screen.getByRole("main")).toContainElement(heading)

    const navigation = screen.getByRole("navigation")
    expect(navigation).toHaveAccessibleName("Разделы")
    expect(within(navigation).getByRole("link", { name: "Чат" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("button", { name: "Аккаунт: Аня" })).toBeInTheDocument()

    const panel = screen.getByRole("region", { name: "Чат с AI Buddy" })
    expect(panel).toHaveTextContent("AI Buddy")
    expect(
      await within(panel).findByRole("heading", { name: "Напиши первое сообщение" }),
    ).toBeInTheDocument()
    expect(
      within(panel).getByText("Задай вопрос, попроси помочь с задачей или узнай что-то о проекте"),
    ).toBeInTheDocument()
    expect(within(panel).queryByRole("article")).not.toBeInTheDocument()
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/chat")
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/user", "/api/chat"])
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        credentials: "include",
      }),
    )
  })

  it("sends users with a session from the landing page to the app", async () => {
    const { router, fetchMock } = renderWithSession("/welcome", intern)

    expect(
      await screen.findByRole("heading", { level: 1, name: "С чего начнём?" }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
    // both guards read the session from the query cache instead of refetching it
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("keeps users whose access token expired in the app by refreshing it", async () => {
    let accessTokenIsValid = false
    mockApi({
      "GET /api/user": () => (accessTokenIsValid ? json(intern) : status(401)),
      "POST /api/auth/refresh": () => {
        accessTokenIsValid = true
        return status(204)
      },
    })
    const { router } = renderApp("/")

    expect(
      await screen.findByRole("heading", { level: 1, name: "С чего начнём?" }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
  })

  it("sends users whose refresh token expired too to the landing page", async () => {
    mockApi({ "GET /api/user": () => status(401), "POST /api/auth/refresh": () => status(401) })
    const { router } = renderApp("/")

    expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/welcome")
  })
})
