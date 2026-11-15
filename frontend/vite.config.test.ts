// @vitest-environment node
import { createServer as createHttpServer, type IncomingHttpHeaders, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { fileURLToPath } from "node:url"
import { createServer, resolveConfig, type ViteDevServer } from "vite"
import { afterEach, describe, expect, it, vi } from "vitest"

const configFile = fileURLToPath(new URL("./vite.config.ts", import.meta.url))

interface BackendRequest {
  method?: string
  url?: string
  headers: IncomingHttpHeaders
  body: string
}

let backend: Server | undefined
let devServer: ViteDevServer | undefined

afterEach(async () => {
  await devServer?.close()
  backend?.close()
  devServer = undefined
  backend = undefined
})

/** A backend that records every request and answers like POST /api/auth/login does. */
async function startBackend() {
  const requests: BackendRequest[] = []
  backend = createHttpServer(async (req, res) => {
    let body = ""
    for await (const chunk of req) body += chunk
    requests.push({ method: req.method, url: req.url, headers: req.headers, body })

    res.setHeader("Set-Cookie", [
      "access_token=a; Domain=backend.internal; Path=/api; HttpOnly; SameSite=Lax",
      "refresh_token=r; Domain=backend.internal; Path=/api/auth; HttpOnly; SameSite=Lax",
    ])
    res.writeHead(204).end()
  })
  await new Promise<void>((resolve) => backend?.listen(0, "127.0.0.1", resolve))
  const { port } = backend.address() as AddressInfo

  return { url: `http://127.0.0.1:${port}`, requests }
}

/** Starts the dev server of `npm run dev` with API_PROXY_TARGET pointing at `apiTarget`. */
async function startDevServer(apiTarget: string) {
  vi.stubEnv("API_PROXY_TARGET", apiTarget)
  devServer = await createServer({
    configFile,
    mode: "development",
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, watch: null },
  })
  await devServer.listen()
  const { port } = devServer.httpServer?.address() as AddressInfo

  return `http://127.0.0.1:${port}`
}

describe("API proxy", () => {
  it("forwards /api requests to the backend with their headers, cookies and body", async () => {
    const api = await startBackend()
    const app = await startDevServer(api.url)

    const response = await fetch(`${app}/api/auth/login?from=welcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "theme=dark", "X-Request-Id": "42" },
      body: JSON.stringify({ username: "intern", password: "secret" }),
    })

    expect(response.status).toBe(204)
    expect(api.requests).toHaveLength(1)
    const [request] = api.requests
    expect(request).toMatchObject({
      method: "POST",
      url: "/api/auth/login?from=welcome",
      body: '{"username":"intern","password":"secret"}',
    })
    expect(request.headers).toMatchObject({
      "content-type": "application/json",
      cookie: "theme=dark",
      "x-request-id": "42",
      "x-forwarded-proto": "http",
    })
    expect(request.headers["x-forwarded-for"]).toContain("127.0.0.1")
    // without the backend's Domain the browser keeps the cookies for the host of the dev server
    expect(response.headers.getSetCookie()).toEqual([
      "access_token=a; Path=/api; HttpOnly; SameSite=Lax",
      "refresh_token=r; Path=/api/auth; HttpOnly; SameSite=Lax",
    ])
  })

  it("leaves the pages of the app to the dev server", async () => {
    const api = await startBackend()
    const app = await startDevServer(api.url)

    const response = await fetch(`${app}/welcome`)

    expect(response.headers.get("Content-Type")).toMatch(/^text\/html/)
    expect(api.requests).toHaveLength(0)
  })

  it("is used by `npm run preview` too", async () => {
    vi.stubEnv("API_PROXY_TARGET", "http://backend.test")

    const config = await resolveConfig({ configFile, logLevel: "silent" }, "serve", "production")

    expect(config.preview.proxy).toMatchObject({ "/api/": { target: "http://backend.test" } })
  })

  it("is off in the mock mode, where the mock API answers /api", async () => {
    const config = await resolveConfig({ configFile, mode: "mock", logLevel: "silent" }, "serve")

    expect(config.server.proxy).toBeUndefined()
  })
})
