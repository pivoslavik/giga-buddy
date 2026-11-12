import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { mockApi, renderApp, status } from "../../test/app"
import { LandingPage } from "./LandingPage"

describe("LandingPage", () => {
  it("introduces the service", () => {
    render(<LandingPage />)

    expect(
      screen.getByRole("heading", { level: 1, name: "Твой AI-помощник на стажировке" }),
    ).toBeInTheDocument()
    expect(screen.getByText(/развивайся быстрее вместе с AI Buddy/)).toBeInTheDocument()
  })

  it("lists what AI Buddy helps with", () => {
    render(<LandingPage />)

    const features = within(screen.getByRole("region", { name: "Что умеет AI Buddy" }))
    expect(features.getAllByRole("listitem")).toHaveLength(3)
    expect(features.getByRole("heading", { name: "Ответы на вопросы" })).toBeInTheDocument()
    expect(features.getByRole("heading", { name: "Помощь с задачами" })).toBeInTheDocument()
    expect(features.getByRole("heading", { name: "Быстрый старт" })).toBeInTheDocument()
  })

  it("opens the login modal from the call to action and closes it", async () => {
    const user = userEvent.setup()
    mockApi({ "GET /api/user": () => status(401) })
    // the login form inside the modal needs the router and the query cache
    renderApp("/welcome")
    const callToAction = await screen.findByRole("button", { name: "Войти в сервис" })
    const loginDialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement
    expect(loginDialog.open).toBe(false)

    await user.click(callToAction)

    expect(screen.getByRole("dialog", { name: "Вход в AI Buddy" })).toBe(loginDialog)
    expect(loginDialog.open).toBe(true)

    await user.click(within(loginDialog).getByRole("button", { name: "Закрыть" }))

    expect(loginDialog.open).toBe(false)
  })
})
