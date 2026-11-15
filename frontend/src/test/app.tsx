import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router"
import { render } from "@testing-library/react"
import { vi } from "vitest"
import type { User } from "../entities/session/session"
import { createAppRouter } from "../router"

export const intern: User = {
  id: 1,
  username: "intern",
  email: "intern@example.com",
  role: "intern",
  display_name: "Аня",
}

export function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init)
}

export function status(code: number) {
  return new Response(null, { status: code })
}

type ApiHandler = (init: RequestInit | undefined) => Response | Promise<Response>

/**
 * Stubs fetch with handlers keyed by "METHOD /path", with or without the query string.
 * Any other request gets a 404.
 */
export function mockApi(handlers: Record<string, ApiHandler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    const url = String(input)
    const handler = handlers[`${method} ${url}`] ?? handlers[`${method} ${url.split("?")[0]}`]
    return handler ? handler(init) : status(404)
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

/** Renders the whole app (routes, session guards and query cache) at the given path. */
export function renderApp(path: string) {
  const queryClient = new QueryClient()
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }))
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}
