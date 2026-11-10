import { describe, expect, it, vi } from "vitest"
import { ApiError, apiFetch } from "./client"

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal("fetch", fetchMock)
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

    await apiFetch("/api/login", {
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

    await expect(apiFetch("/api/login", { method: "POST" })).resolves.toBeUndefined()
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
