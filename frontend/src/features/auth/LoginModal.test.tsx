import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { intern, json, mockApi, renderApp, status } from "../../test/app"

type Handlers = Parameters<typeof mockApi>[0]

/** Opens the login modal from the landing page of a guest. */
async function openLogin(handlers: Handlers = {}) {
  const fetchMock = mockApi({ "GET /api/user": () => status(401), ...handlers })
  const user = userEvent.setup()
  const app = renderApp("/welcome")

  await user.click(await screen.findByRole("button", { name: "Войти в сервис" }))
  const dialog = screen.getByRole("dialog", { name: "Вход в AI Buddy" }) as HTMLDialogElement

  return { ...app, fetchMock, user, dialog }
}

const usernameField = () => screen.getByRole("textbox", { name: "Логин" })
const passwordField = () => screen.getByLabelText("Пароль")
const submitButton = () => screen.getByRole("button", { name: /Отправ/ })

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(usernameField(), "intern")
  await user.type(passwordField(), "secret")
  await user.click(submitButton())
}

/** A backend that accepts any credentials and starts the session. */
function workingBackend(): Handlers {
  let loggedIn = false
  return {
    "GET /api/user": () => (loggedIn ? json(intern) : status(401)),
    // #36 answers with an empty body and puts the tokens into httpOnly cookies
    "POST /api/auth/login": () => {
      loggedIn = true
      return status(200)
    },
  }
}

describe("LoginModal", () => {
  it("starts with an empty form and the login field focused", async () => {
    await openLogin()

    expect(usernameField()).toHaveValue("")
    expect(usernameField()).toHaveFocus()
    expect(passwordField()).toHaveValue("")
    expect(passwordField()).toHaveAttribute("type", "password")
    expect(submitButton()).toHaveTextContent("Отправить")
  })

  it("sends the username and password as JSON and opens the main page", async () => {
    const { fetchMock, router, user } = await openLogin(workingBackend())

    await fillAndSubmit(user)

    expect(await screen.findByRole("heading", { name: "Привет, Аня!" })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")

    const loginCall = fetchMock.mock.calls.find(([url]) => url === "/api/auth/login")
    const init = loginCall?.[1]
    expect(init?.method).toBe("POST")
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json")
    expect(JSON.parse(String(init?.body))).toEqual({ username: "intern", password: "secret" })
  })

  it("blocks the form while the request is in flight", async () => {
    let respond: (response: Response) => void = () => {}
    const backend = workingBackend()
    const { fetchMock, user } = await openLogin({
      ...backend,
      "POST /api/auth/login": (init) =>
        new Promise((resolve) => {
          respond = resolve
        }).then(() => backend["POST /api/auth/login"](init)),
    })

    await fillAndSubmit(user)

    expect(submitButton()).toHaveAttribute("aria-disabled", "true")
    expect(submitButton()).toHaveTextContent("Отправляем…")
    // the button stays focusable, so keyboard users keep their place in the modal
    expect(submitButton()).toHaveFocus()

    await user.click(submitButton())
    await user.type(passwordField(), "{Enter}")
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/login")).toHaveLength(1)

    respond(status(200))

    expect(await screen.findByRole("heading", { name: "Привет, Аня!" })).toBeInTheDocument()
  })

  it.each([401, 400])("reports wrong credentials when the backend answers %i", async (code) => {
    const warn = vi.spyOn(console, "warn")
    const { dialog, router, user } = await openLogin({ "POST /api/auth/login": () => status(code) })

    await fillAndSubmit(user)

    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent("Неверный логин или пароль")
    expect(usernameField()).toBeInvalid()
    expect(usernameField()).toHaveAccessibleDescription("Неверный логин или пароль")
    expect(passwordField()).toBeInvalid()
    expect(dialog.open).toBe(true)
    expect(router.state.location.pathname).toBe("/welcome")
    expect(warn).not.toHaveBeenCalled()
  })

  it("hides the error once the values are edited", async () => {
    const { user } = await openLogin({ "POST /api/auth/login": () => status(401) })
    await fillAndSubmit(user)
    expect(await screen.findByRole("alert")).toBeInTheDocument()

    await user.type(passwordField(), "!")

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(usernameField()).toBeValid()
    expect(passwordField()).toHaveValue("secret!")
  })

  it("asks to try again later when the backend is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { router, user } = await openLogin({
      "POST /api/auth/login": () => Promise.reject(new TypeError("Failed to fetch")),
    })

    await fillAndSubmit(user)

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось войти. Попробуй ещё раз чуть позже",
    )
    expect(usernameField()).toBeValid()
    expect(router.state.location.pathname).toBe("/welcome")
    expect(warn).toHaveBeenCalledOnce()
  })

  it("stays on the landing page when the session did not start after logging in", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { router, user } = await openLogin({ "POST /api/auth/login": () => json({}) })

    await fillAndSubmit(user)

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось войти")
    expect(router.state.location.pathname).toBe("/welcome")
    expect(warn).toHaveBeenCalledOnce()
  })

  it("does not send the form until both fields are filled", async () => {
    const { fetchMock, user } = await openLogin(workingBackend())

    await user.click(submitButton())
    await user.type(usernameField(), "intern")
    await user.click(submitButton())

    expect(passwordField()).toBeRequired()
    expect(fetchMock).not.toHaveBeenCalledWith("/api/auth/login", expect.anything())
  })

  it("shows and hides the password", async () => {
    const { user } = await openLogin()
    await user.type(passwordField(), "secret")
    const toggle = screen.getByRole("button", { name: "Показать пароль" })
    expect(toggle).toHaveAttribute("aria-pressed", "false")

    await user.click(toggle)

    expect(passwordField()).toHaveAttribute("type", "text")
    expect(toggle).toHaveAttribute("aria-pressed", "true")

    await user.click(toggle)

    expect(passwordField()).toHaveAttribute("type", "password")
    expect(passwordField()).toHaveValue("secret")
  })

  it("hides the password again on submit", async () => {
    const { user } = await openLogin({ "POST /api/auth/login": () => status(401) })
    await user.click(screen.getByRole("button", { name: "Показать пароль" }))

    await fillAndSubmit(user)

    expect(passwordField()).toHaveAttribute("type", "password")
  })

  it("forgets what was typed when the modal is closed", async () => {
    const { dialog, user } = await openLogin()
    await user.type(usernameField(), "intern")
    await user.type(passwordField(), "secret")

    await user.click(within(dialog).getByRole("button", { name: "Закрыть" }))
    await user.click(screen.getByRole("button", { name: "Войти в сервис" }))

    expect(usernameField()).toHaveValue("")
    expect(passwordField()).toHaveValue("")
  })
})
