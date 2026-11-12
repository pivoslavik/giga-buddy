import { randomUUID } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"

/*
 * Fake backend for `npm run dev:mock`: answers the endpoints the frontend uses, so the login flow
 * can be clicked through without docker compose. It follows the backend contract:
 * POST /api/login (#6, #36) and GET /api/user (#9). Sessions live in memory until a restart.
 */

interface MockUser {
  id: number
  username: string
  email: string
  role: string
  display_name: string
}

interface MockAccount {
  password: string
  user: MockUser
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    password: "secret",
    user: {
      id: 1,
      username: "intern",
      email: "intern@example.com",
      role: "intern",
      display_name: "Аня",
    },
  },
]

/** Logging in with this username makes the backend fail, to see how the UI handles it. */
export const FAILING_USERNAME = "down"

const SESSION_COOKIE = "mock_session"
const EXPIRED_SESSION_COOKIE = `${SESSION_COOKIE}=; Path=/; Max-Age=0`

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end()
    return
  }
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body))
}

function readCookie(req: IncomingMessage, name: string) {
  for (const cookie of req.headers.cookie?.split(";") ?? []) {
    const [key, ...value] = cookie.trim().split("=")
    if (key === name) return value.join("=")
  }
  return undefined
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = ""
  for await (const chunk of req) raw += chunk
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function isCredentials(body: unknown): body is { username: string; password: string } {
  if (typeof body !== "object" || body === null) return false
  const { username, password } = body as Record<string, unknown>
  return (
    typeof username === "string" &&
    username !== "" &&
    typeof password === "string" &&
    password !== ""
  )
}

/** Request handler for /api/* paths; anything it does not know gets a 404. */
export function createMockApi({ latencyMs = 400 } = {}): Handler {
  const sessions = new Map<string, MockAccount>()
  const sessionToken = (req: IncomingMessage) => readCookie(req, SESSION_COOKIE) ?? ""
  const endSession = (req: IncomingMessage, res: ServerResponse) => {
    sessions.delete(sessionToken(req))
    res.setHeader("Set-Cookie", EXPIRED_SESSION_COOKIE)
  }

  return async (req, res) => {
    // a little latency, so loading states are visible
    await new Promise((resolve) => setTimeout(resolve, latencyMs))
    const path = new URL(req.url ?? "/", "http://mock").pathname

    switch (`${req.method} ${path}`) {
      case "POST /api/login": {
        const body = await readJson(req)
        if (!isCredentials(body)) return send(res, 400, { error: "invalid request" })

        const username = body.username.trim()
        if (username === FAILING_USERNAME) return send(res, 500, { error: "internal error" })

        const account = MOCK_ACCOUNTS.find(
          (candidate) =>
            candidate.user.username === username && candidate.password === body.password,
        )
        if (!account) return send(res, 401, { error: "invalid credentials" })

        const token = randomUUID()
        sessions.set(token, account)
        res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`)
        const { id, email } = account.user
        return send(res, 200, { user: { id, username, email } })
      }

      case "GET /api/user": {
        const account = sessions.get(sessionToken(req))
        return account ? send(res, 200, account.user) : send(res, 401, { error: "unauthorized" })
      }

      case "POST /api/auth/logout":
        endSession(req, res)
        return send(res, 204)

      // there is no logout button yet: open this in the browser to become a guest again
      case "GET /api/mock/logout":
        endSession(req, res)
        res.setHeader("Location", "/welcome")
        return send(res, 302)

      default:
        return send(res, 404, { error: `${req.method} ${path} is not in the mock API` })
    }
  }
}

/** Serves the mock API from the Vite dev server instead of proxying /api to the backend. */
export function mockApiPlugin(): Plugin {
  return {
    name: "giga-buddy:mock-api",
    apply: "serve",
    configureServer(server) {
      const handle = createMockApi()
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next()
        handle(req, res).catch(next)
      })

      const [{ user, password }] = MOCK_ACCOUNTS
      server.httpServer?.once("listening", () => {
        server.config.logger.info(
          `\n  Mock API: log in as ${user.username} / ${password}, ` +
            `"${FAILING_USERNAME}" makes the backend fail, /api/mock/logout logs out\n`,
        )
      })
    },
  }
}
