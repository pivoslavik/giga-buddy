import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { User } from "./entities/session/session"
import { createAppRouter } from "./router"

const user: User = {
  id: 1,
  username: "intern",
  email: "intern@example.com",
  role: "intern",
  display_name: "Аня",
}

function renderApp(path: string, session: User | null) {
  const fetchMock = vi.fn(async () =>
    session ? new Response(JSON.stringify(session)) : new Response(null, { status: 401 }),
  )
  vi.stubGlobal("fetch", fetchMock)

  const queryClient = new QueryClient()
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }))
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { router, fetchMock }
}

const landingHeading = { level: 1, name: "Твой AI-помощник на стажировке" } as const

describe("session-based routing", () => {
  it("shows the landing page to guests", async () => {
    const { router } = renderApp("/welcome", null)

    expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/welcome")
  })

  it("sends guests from pages that need a session to the landing page", async () => {
    const { router } = renderApp("/", null)

    expect(await screen.findByRole("heading", landingHeading)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/welcome")
  })

  it("lets users with a session into the app", async () => {
    const { router } = renderApp("/", user)

    expect(await screen.findByRole("heading", { name: "Привет, Аня!" })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
  })

  it("sends users with a session from the landing page to the app", async () => {
    const { router, fetchMock } = renderApp("/welcome", user)

    expect(await screen.findByRole("heading", { name: "Привет, Аня!" })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
    // both guards read the session from the query cache instead of refetching it
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
