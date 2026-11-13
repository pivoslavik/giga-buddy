import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Modal } from "./Modal"

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onClose = vi.fn()
  const view = render(
    <Modal open title="Вход в AI Buddy" onClose={onClose} {...props}>
      <input aria-label="Логин" />
    </Modal>,
  )
  const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement
  return { ...view, dialog, onClose }
}

describe("Modal", () => {
  it("opens as a labelled dialog with its content", () => {
    const { dialog } = renderModal({ description: "Авторизуйся, чтобы продолжить" })

    expect(dialog.open).toBe(true)
    expect(screen.getByRole("dialog", { name: "Вход в AI Buddy" })).toHaveAccessibleDescription(
      "Авторизуйся, чтобы продолжить",
    )
    expect(screen.getByRole("textbox", { name: "Логин" })).toBeInTheDocument()
  })

  it("focuses the element marked with data-autofocus when it opens", () => {
    render(
      <Modal open title="Вход в AI Buddy" onClose={() => {}}>
        <button type="button">Отмена</button>
        <input aria-label="Логин" data-autofocus />
      </Modal>,
    )

    expect(screen.getByRole("textbox", { name: "Логин" })).toHaveFocus()
  })

  it("stays closed while open is false", () => {
    const { dialog, onClose } = renderModal({ open: false })

    expect(dialog.open).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("closes from the close button and reports it once", async () => {
    const { dialog, onClose } = renderModal()

    await userEvent.click(screen.getByRole("button", { name: "Закрыть" }))

    expect(dialog.open).toBe(false)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("reports closing triggered by the browser, e.g. by Esc", () => {
    const { dialog, onClose } = renderModal()

    dialog.close()

    expect(onClose).toHaveBeenCalledOnce()
  })

  it("closes on a backdrop click but not on a click inside", async () => {
    const { dialog, onClose } = renderModal()

    await userEvent.click(screen.getByRole("textbox", { name: "Логин" }))
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(dialog)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("does not close when a press starts inside and ends on the backdrop", () => {
    const { dialog, onClose } = renderModal()

    fireEvent.mouseDown(screen.getByRole("textbox", { name: "Логин" }))
    fireEvent.click(dialog)

    expect(dialog.open).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("follows the open prop", () => {
    const { dialog, rerender } = renderModal({ open: false })

    rerender(<Modal open title="Вход в AI Buddy" onClose={() => {}} />)
    expect(dialog.open).toBe(true)

    rerender(<Modal open={false} title="Вход в AI Buddy" onClose={() => {}} />)
    expect(dialog.open).toBe(false)
  })
})
