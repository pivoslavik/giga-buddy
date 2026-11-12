export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Login, refresh and logout answer 401 for their own reasons, so a refresh would not help. */
const AUTH_PATH_PREFIX = "/api/auth/"

function send(path: string, init: RequestInit) {
  const baseUrl = import.meta.env.VITE_API_URL ?? ""
  const headers = new Headers(init.headers)
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }

  return fetch(`${baseUrl}${path}`, { ...init, headers, credentials: "include" })
}

let pendingRefresh: Promise<boolean> | undefined

/**
 * POST /api/auth/refresh (#37): trades the refresh token cookie for new access and refresh tokens.
 * Resolves to whether that worked. Requests that hit an expired token together share one refresh,
 * since the backend may rotate the refresh token and accept the old one only once.
 */
function refreshTokens(): Promise<boolean> {
  pendingRefresh ??= send("/api/auth/refresh", { method: "POST" })
    .then(async (response) => {
      // read the empty body through, or the browser reports the request as aborted
      await response.text()
      return response.ok
    })
    .catch(() => false)
    .finally(() => {
      pendingRefresh = undefined
    })
  return pendingRefresh
}

/**
 * Thin wrapper around fetch for our backend.
 *
 * - Auth lives in httpOnly cookies, so every request is sent with credentials.
 * - The access token lives 15 minutes: on a 401 the tokens are refreshed and the request is sent
 *   once more, so `init.body` has to be reusable (a string, FormData or Blob, not a stream).
 *   If the refresh fails too, the 401 stands: the session is over.
 * - VITE_API_URL lets the static frontend talk to an API hosted on another origin;
 *   by default requests go to the same origin (nginx proxies /api to the backend).
 * - Non-2xx responses become ApiError, an empty body resolves to undefined.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init)

  if (response.status === 401 && !path.startsWith(AUTH_PATH_PREFIX) && (await refreshTokens())) {
    response = await send(path, init)
  }

  if (!response.ok) {
    const method = init.method ?? "GET"
    throw new ApiError(response.status, `${method} ${path} failed with status ${response.status}`)
  }

  const body = await response.text()
  return (body ? JSON.parse(body) : undefined) as T
}
