export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/**
 * Thin wrapper around fetch for our backend.
 *
 * - Auth lives in httpOnly cookies, so every request is sent with credentials.
 * - VITE_API_URL lets the static frontend talk to an API hosted on another origin;
 *   by default requests go to the same origin (nginx proxies /api to the backend).
 * - Non-2xx responses become ApiError, an empty body resolves to undefined.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_URL ?? ""
  const headers = new Headers(init.headers)
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, credentials: "include" })

  if (!response.ok) {
    const method = init.method ?? "GET"
    throw new ApiError(response.status, `${method} ${path} failed with status ${response.status}`)
  }

  const body = await response.text()
  return (body ? JSON.parse(body) : undefined) as T
}
