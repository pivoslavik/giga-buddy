import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import { createMockApi } from "./mockApi.ts"

let server: Server | undefined

afterEach(() => {
  server?.close()
  server = undefined
})

/** Starts the mock API on a free port and returns a fetch bound to it. */
async function startMockApi() {
  const handle = createMockApi({ latencyMs: 0 })
  server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo

  return (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init)
}

const login = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

function sessionCookie(response: Response) {
  return response.headers.getSetCookie()[0]?.split(";")[0] ?? ""
}

describe("mock API", () => {
  it("logs the user in and recognizes the session afterwards", async () => {
    const api = await startMockApi()
    expect((await api("/api/user")).status).toBe(401)

    const response = await api("/api/login", login({ username: "intern", password: "secret" }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: { id: 1, username: "intern", email: "intern@example.com" },
    })
    expect(response.headers.getSetCookie()[0]).toMatch(/HttpOnly/)

    const user = await api("/api/user", { headers: { Cookie: sessionCookie(response) } })
    expect(user.status).toBe(200)
    expect(await user.json()).toMatchObject({ username: "intern", display_name: "Аня" })
  })

  it("answers like the backend to wrong and malformed requests", async () => {
    const api = await startMockApi()
    const statusOf = async (path: string, init?: RequestInit) => (await api(path, init)).status

    expect(await statusOf("/api/login", login({ username: "intern", password: "nope" }))).toBe(401)
    expect(await statusOf("/api/login", login({ username: "intern" }))).toBe(400)
    expect(await statusOf("/api/login", { method: "POST", body: "not json" })).toBe(400)
    expect(await statusOf("/api/login", login({ username: "down", password: "x" }))).toBe(500)
    expect(await statusOf("/api/documents")).toBe(404)
  })

  it("ends the session on logout", async () => {
    const api = await startMockApi()
    const response = await api("/api/login", login({ username: "intern", password: "secret" }))
    const headers = { Cookie: sessionCookie(response) }

    expect((await api("/api/auth/logout", { method: "POST", headers })).status).toBe(204)
    expect((await api("/api/user", { headers })).status).toBe(401)
  })
})
