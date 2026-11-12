import { describe, expect, it, vi } from "vitest"
import { json, mockApi, status } from "../../test/app"
import { ApiError, apiFetch } from "./client"

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

/** "METHOD /path" of every request sent, in order. */
function requestsOf(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`)
}

/** A backend whose access token has expired; `refresh` decides what POST /api/auth/refresh does. */
function expiredAccessToken(refresh: () => Response | Promise<Response> = () => status(204)) {
  let tokenIsValid = false
  const fetchMock = mockApi({
    "GET /api/user": () => (tokenIsValid ? json({ id: 1 }) : status(401)),
    "POST /api/chat": () => (tokenIsValid ? json({ answer: "hi" }) : status(401)),
    "POST /api/auth/refresh": async () => {
      const response = await refresh()
      tokenIsValid = response.ok
      return response
    },
  })
  return fetchMock
}

describe("apiFetch", () => {
  it("returns parsed JSON and sends cookies with the request", async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await expect(apiFetch("/api/user")).resolves.toEqual({ ok: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/user")
    expect(init?.credentials).toBe("include")
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json")
  })

  it("keeps headers and options passed by the caller", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }))

    await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { Accept: "text/plain", "Content-Type": "application/json" },
      body: "{}",
    })

    const init = fetchMock.mock.calls[0][1]
    const headers = new Headers(init?.headers)
    expect(init?.method).toBe("POST")
    expect(init?.body).toBe("{}")
    expect(headers.get("Accept")).toBe("text/plain")
    expect(headers.get("Content-Type")).toBe("application/json")
  })

  it("resolves to undefined when the response body is empty", async () => {
    mockFetch(new Response(null, { status: 204 }))

    await expect(apiFetch("/api/auth/login", { method: "POST" })).resolves.toBeUndefined()
  })

  it("throws ApiError with the response status for non-2xx responses", async () => {
    mockFetch(new Response("Unauthorized", { status: 401 }))

    const error = await apiFetch("/api/user").catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, message: "GET /api/user failed with status 401" })
  })

  it("prefixes requests with VITE_API_URL when it is set", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com")
    const fetchMock = mockFetch(new Response("{}", { status: 200 }))

    await apiFetch("/api/user")

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/api/user")
  })
})

describe("apiFetch with an expired access token", () => {
  it("refreshes the tokens and sends the request once more", async () => {
    const fetchMock = expiredAccessToken()

    await expect(apiFetch("/api/user")).resolves.toEqual({ id: 1 })

    expect(requestsOf(fetchMock)).toEqual([
      "GET /api/user",
      "POST /api/auth/refresh",
      "GET /api/user",
    ])
    expect(fetchMock.mock.calls[1][1]?.credentials).toBe("include")
  })

  it("sends the same body when it repeats the request", async () => {
    const fetchMock = expiredAccessToken()

    await apiFetch("/api/chat", { method: "POST", body: '{"question":"hi"}' })

    const chatCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/chat")
    expect(chatCalls.map(([, init]) => init?.body)).toEqual([
      '{"question":"hi"}',
      '{"question":"hi"}',
    ])
  })

  it("refreshes once for requests that hit the expired token together", async () => {
    let finishRefresh: () => void = () => {}
    const fetchMock = expiredAccessToken(
      () => new Promise((resolve) => (finishRefresh = () => resolve(status(204)))),
    )

    const requests = Promise.all([apiFetch("/api/user"), apiFetch("/api/chat", { method: "POST" })])
    await vi.waitFor(() => expect(requestsOf(fetchMock)).toContain("POST /api/auth/refresh"))
    finishRefresh()

    await expect(requests).resolves.toEqual([{ id: 1 }, { answer: "hi" }])
    expect(requestsOf(fetchMock).filter((call) => call.endsWith("/refresh"))).toHaveLength(1)
  })

  it.each([
    ["rejects the refresh token", () => status(401)],
    ["is unreachable", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("keeps the 401 when the backend %s", async (_, refresh) => {
    const fetchMock = expiredAccessToken(refresh)

    await expect(apiFetch("/api/user")).rejects.toMatchObject({ status: 401 })
    expect(requestsOf(fetchMock)).toEqual(["GET /api/user", "POST /api/auth/refresh"])
  })

  it("repeats the request only once", async () => {
    const fetchMock = mockApi({
      "GET /api/user": () => status(401),
      "POST /api/auth/refresh": () => status(204),
    })

    const error = await apiFetch("/api/user").catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(requestsOf(fetchMock)).toEqual([
      "GET /api/user",
      "POST /api/auth/refresh",
      "GET /api/user",
    ])
  })

  it.each(["/api/auth/login", "/api/auth/logout", "/api/auth/refresh"])(
    "does not refresh when %s answers 401",
    async (path) => {
      const fetchMock = mockApi({ [`POST ${path}`]: () => status(401) })

      await expect(apiFetch(path, { method: "POST" })).rejects.toMatchObject({ status: 401 })
      expect(requestsOf(fetchMock)).toEqual([`POST ${path}`])
    },
  )
})
