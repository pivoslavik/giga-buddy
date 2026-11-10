import { describe, expect, it, vi } from "vitest"
import { fetchSessionUser, type User } from "./session"

const user: User = {
  id: 1,
  username: "intern",
  email: "intern@example.com",
  role: "intern",
  display_name: "Стажёр",
}

describe("fetchSessionUser", () => {
  it("returns the user when the session is valid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(user))))

    await expect(fetchSessionUser()).resolves.toEqual(user)
  })

  it.each([401, 403])("returns null without warnings for status %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(fetchSessionUser()).resolves.toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it("falls back to a guest and warns when the backend fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(fetchSessionUser()).resolves.toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })

  it("falls back to a guest and warns when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(fetchSessionUser()).resolves.toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })
})
