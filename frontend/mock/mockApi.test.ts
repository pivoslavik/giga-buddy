import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import { createMockApi } from "./mockApi.ts"

let server: Server | undefined

afterEach(() => {
  server?.close()
  server = undefined
})

const ACCESS_TOKEN_TTL_MS = 60_000

/** Starts the mock API on a free port; returns a fetch bound to it and the clock of its tokens. */
async function startMockApi() {
  const clock = { now: 0 }
  const handle = createMockApi({
    latencyMs: 0,
    accessTokenTtlMs: ACCESS_TOKEN_TTL_MS,
    now: () => clock.now,
  })
  server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo

  const api = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init)
  return { api, clock }
}

type Api = Awaited<ReturnType<typeof startMockApi>>["api"]

const login = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

/** The `name=value` part of every cookie the response sets, by cookie name. */
function cookiesOf(response: Response): Record<string, string> {
  const pairs = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0])
  return Object.fromEntries(pairs.map((pair) => [pair.split("=")[0], pair]))
}

async function logIn(api: Api) {
  return cookiesOf(await api("/api/auth/login", login({ username: "intern", password: "secret" })))
}

const withCookie = (cookie: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { Cookie: cookie },
})

describe("mock API", () => {
  it("logs the user in with an access and a refresh token, like the backend", async () => {
    const { api } = await startMockApi()
    expect((await api("/api/user")).status).toBe(401)

    const response = await api("/api/auth/login", login({ username: "intern", password: "secret" }))

    expect(response.status).toBe(204)
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(
        /^access_token=[\w-]+; Path=\/api; Max-Age=60; HttpOnly; SameSite=Lax$/,
      ),
      expect.stringMatching(
        /^refresh_token=[\w-]+; Path=\/api\/auth; Max-Age=604800; HttpOnly; SameSite=Lax$/,
      ),
    ])

    const user = await api("/api/user", withCookie(cookiesOf(response).access_token))
    expect(user.status).toBe(200)
    expect(await user.json()).toMatchObject({ username: "intern", display_name: "Аня" })
  })

  it("answers like the backend to wrong and malformed requests", async () => {
    const { api } = await startMockApi()
    const statusOf = async (path: string, init?: RequestInit) => (await api(path, init)).status
    const loginStatus = (body: unknown) => statusOf("/api/auth/login", login(body))

    expect(await loginStatus({ username: "intern", password: "nope" })).toBe(400)
    expect(await loginStatus({ username: "intern" })).toBe(400)
    expect(await statusOf("/api/auth/login", { method: "POST", body: "not json" })).toBe(400)
    expect(await loginStatus({ username: "down", password: "x" })).toBe(500)
    expect(await statusOf("/api/auth/refresh", { method: "POST" })).toBe(401)
    expect(await statusOf("/api/documents")).toBe(404)
  })

  it("trades the refresh token for a new pair once the access token expires", async () => {
    const { api, clock } = await startMockApi()
    const cookies = await logIn(api)

    clock.now += ACCESS_TOKEN_TTL_MS
    expect((await api("/api/user", withCookie(cookies.access_token))).status).toBe(401)

    const refresh = withCookie(cookies.refresh_token, { method: "POST" })
    const refreshed = await api("/api/auth/refresh", refresh)
    expect(refreshed.status).toBe(204)
    const fresh = cookiesOf(refreshed)
    expect(fresh.access_token).not.toBe(cookies.access_token)
    expect(fresh.refresh_token).not.toBe(cookies.refresh_token)

    expect((await api("/api/user", withCookie(fresh.access_token))).status).toBe(200)
    // each refresh token works once
    expect((await api("/api/auth/refresh", refresh)).status).toBe(401)
  })

  it("ends the session on logout", async () => {
    const { api } = await startMockApi()
    const cookies = await logIn(api)
    const bothTokens = `${cookies.access_token}; ${cookies.refresh_token}`

    const response = await api("/api/auth/logout", withCookie(bothTokens, { method: "POST" }))

    expect(response.status).toBe(204)
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^access_token=; Path=\/api; Max-Age=0;/),
      expect.stringMatching(/^refresh_token=; Path=\/api\/auth; Max-Age=0;/),
    ])
    expect((await api("/api/user", withCookie(cookies.access_token))).status).toBe(401)
    const refresh = withCookie(cookies.refresh_token, { method: "POST" })
    expect((await api("/api/auth/refresh", refresh)).status).toBe(401)
  })
})
