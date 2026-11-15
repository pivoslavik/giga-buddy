import { randomUUID } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import { loadEnv, type Plugin } from "vite"
import { MOCK_DOCUMENT_CATEGORIES, MOCK_DOCUMENTS } from "./mockDocuments.ts"

/*
 * Fake backend for `npm run dev:mock`: answers the endpoints the frontend uses, so the login flow
 * can be clicked through without docker compose. It follows the backend contract:
 * POST /api/auth/login (#6, #36), GET /api/user (#9), POST /api/auth/refresh (#37),
 * POST /api/auth/logout, GET /api/documents (#13) and GET /api/documents/{id} (#14).
 * Tokens live in memory until a restart.
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

const ACCESS_COOKIE = "access_token"
const REFRESH_COOKIE = "refresh_token"
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Like the backend: the access token goes with every /api request, the refresh one to /api/auth. */
function tokenCookie(name: string, token: string, path: string, ttlMs: number) {
  const maxAge = Math.floor(ttlMs / 1000)
  return `${name}=${token}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
}

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

interface MockApiOptions {
  /** Delay of every answer, so loading states are visible. */
  latencyMs?: number
  /** How long an access token is accepted; the backend uses 15 minutes. */
  accessTokenTtlMs?: number
  /** The clock tokens expire by, replaceable in tests. */
  now?: () => number
}

/** Request handler for /api/* paths; anything it does not know gets a 404. */
export function createMockApi({
  latencyMs = 400,
  accessTokenTtlMs = ACCESS_TOKEN_TTL_MS,
  now = Date.now,
}: MockApiOptions = {}): Handler {
  const accessTokens = new Map<string, { account: MockAccount; expiresAt: number }>()
  const refreshTokens = new Map<string, MockAccount>()

  /** Sets a new pair of tokens, as the backend does on login and on refresh. */
  function issueTokens(res: ServerResponse, account: MockAccount) {
    const accessToken = randomUUID()
    const refreshToken = randomUUID()
    accessTokens.set(accessToken, { account, expiresAt: now() + accessTokenTtlMs })
    refreshTokens.set(refreshToken, account)
    res.setHeader("Set-Cookie", [
      tokenCookie(ACCESS_COOKIE, accessToken, "/api", accessTokenTtlMs),
      tokenCookie(REFRESH_COOKIE, refreshToken, "/api/auth", REFRESH_TOKEN_TTL_MS),
    ])
  }

  function accountOf(req: IncomingMessage) {
    const session = accessTokens.get(readCookie(req, ACCESS_COOKIE) ?? "")
    return session && session.expiresAt > now() ? session.account : undefined
  }

  return async (req, res) => {
    await new Promise((resolve) => setTimeout(resolve, latencyMs))
    const url = new URL(req.url ?? "/", "http://mock")
    const path = url.pathname

    // like #14: the title, the category and the markdown of one document
    const documentId = /^\/api\/documents\/([^/]+)$/.exec(path)?.[1]
    if (req.method === "GET" && documentId !== undefined) {
      if (!accountOf(req)) return send(res, 401, { error: "unauthorized" })
      if (!/^\d+$/.test(documentId)) {
        return send(res, 400, { error: "document id must be a positive integer" })
      }

      const document = MOCK_DOCUMENTS.find(({ id }) => id === Number(documentId))
      if (!document) return send(res, 404, { error: "document not found" })
      const { title, category, text } = document
      return send(res, 200, { title, category, text })
    }

    switch (`${req.method} ${path}`) {
      case "POST /api/auth/login": {
        const body = await readJson(req)
        if (!isCredentials(body)) return send(res, 400, { error: "invalid request" })

        const username = body.username.trim()
        if (username === FAILING_USERNAME) return send(res, 500, { error: "internal error" })

        const account = MOCK_ACCOUNTS.find(
          (candidate) =>
            candidate.user.username === username && candidate.password === body.password,
        )
        // as in the contract (#6, #36): a wrong password is a 400, a successful login is a 204
        if (!account) return send(res, 400, { error: "invalid login credentials" })

        issueTokens(res, account)
        return send(res, 204)
      }

      case "GET /api/user": {
        const account = accountOf(req)
        return account ? send(res, 200, account.user) : send(res, 401, { error: "unauthorized" })
      }

      // the refresh token is swapped for a new pair, so each one works only once
      case "POST /api/auth/refresh": {
        const refreshToken = readCookie(req, REFRESH_COOKIE) ?? ""
        const account = refreshTokens.get(refreshToken)
        if (!account) return send(res, 401, { error: "invalid refresh token" })

        refreshTokens.delete(refreshToken)
        issueTokens(res, account)
        return send(res, 204)
      }

      case "POST /api/auth/logout":
        accessTokens.delete(readCookie(req, ACCESS_COOKIE) ?? "")
        refreshTokens.delete(readCookie(req, REFRESH_COOKIE) ?? "")
        res.setHeader("Set-Cookie", [
          tokenCookie(ACCESS_COOKIE, "", "/api", 0),
          tokenCookie(REFRESH_COOKIE, "", "/api/auth", 0),
        ])
        return send(res, 204)

      // like the backend (#13, PR #52): `amount` and at least one known `category` are required
      case "GET /api/documents": {
        if (!accountOf(req)) return send(res, 401, { error: "unauthorized" })

        const amount = url.searchParams.get("amount")
        if (amount === null) return send(res, 400, { error: "amount query parameter is required" })
        if (!/^\d+$/.test(amount)) {
          return send(res, 400, {
            error: "amount query parameter must be a positive integer value",
          })
        }

        const categories = url.searchParams.getAll("category")
        if (categories.length === 0) {
          return send(res, 400, { error: "categories query parameter is required" })
        }
        const unknown = categories.find((category) => !MOCK_DOCUMENT_CATEGORIES.includes(category))
        if (unknown) return send(res, 400, { error: `invalid category: ${unknown}` })

        const documents = MOCK_DOCUMENTS.filter((document) =>
          categories.includes(document.category),
        )
        // the cards go without the text
        const cards = documents.map(({ id, title, description, category }) => ({
          id,
          title,
          description,
          category,
        }))
        return send(res, 200, cards.slice(0, Number(amount)))
      }

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
      // e.g. MOCK_ACCESS_TOKEN_TTL_SECONDS=20 in .env.mock.local, to see the refresh in action
      const { config } = server
      const env = loadEnv(config.mode, config.envDir || config.root, "MOCK_")
      const ttlSeconds = Number(env.MOCK_ACCESS_TOKEN_TTL_SECONDS)
      const accessTokenTtlMs = ttlSeconds > 0 ? ttlSeconds * 1000 : ACCESS_TOKEN_TTL_MS

      const handle = createMockApi({ accessTokenTtlMs })
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next()
        handle(req, res).catch(next)
      })

      const [{ user, password }] = MOCK_ACCOUNTS
      server.httpServer?.once("listening", () => {
        config.logger.info(
          `\n  Mock API: log in as ${user.username} / ${password}, ` +
            `"${FAILING_USERNAME}" makes the backend fail, ` +
            `access tokens live ${accessTokenTtlMs / 1000}s\n`,
        )
      })
    },
  }
}
