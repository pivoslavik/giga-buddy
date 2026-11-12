import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Avatar } from "./Avatar"

function initialOf(name: string) {
  const { container } = render(<Avatar name={name} />)
  return container.textContent
}

describe("Avatar", () => {
  it("shows the first letter of the name in upper case", () => {
    expect(initialOf("георгий")).toBe("Г")
    expect(initialOf("  intern")).toBe("I")
  })

  it("keeps a name that starts with an emoji whole", () => {
    expect(initialOf("🦊 Лиса")).toBe("🦊")
  })

  it("falls back to a question mark for an empty name", () => {
    expect(initialOf(" ")).toBe("?")
  })

  it("is hidden from assistive tech", () => {
    const { container } = render(<Avatar name="Аня" />)

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true")
  })
})
