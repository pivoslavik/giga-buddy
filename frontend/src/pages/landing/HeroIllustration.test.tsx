import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HeroIllustration } from "./HeroIllustration"

function stubPointer({ fine }: { fine: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: fine, media: query }) as MediaQueryList),
  )
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
}

function renderScene() {
  const { container, unmount } = render(<HeroIllustration />)
  return { scene: container.firstElementChild as HTMLElement, unmount }
}

describe("HeroIllustration", () => {
  it("is decorative and hidden from assistive tech", () => {
    const { scene } = renderScene()

    expect(scene).toHaveAttribute("aria-hidden", "true")
    expect(scene.querySelector("img")).toHaveAttribute("alt", "")
  })

  it("follows a mouse pointer with the parallax variables", () => {
    stubPointer({ fine: true })
    const { scene } = renderScene()

    fireEvent(window, new MouseEvent("pointermove", { clientX: window.innerWidth, clientY: 0 }))

    expect(scene.style.getPropertyValue("--parallax-x")).toBe("1.000")
    expect(scene.style.getPropertyValue("--parallax-y")).toBe("-1.000")
  })

  it("stops listening after unmount", () => {
    stubPointer({ fine: true })
    const { scene, unmount } = renderScene()
    unmount()

    fireEvent(window, new MouseEvent("pointermove", { clientX: 0, clientY: 0 }))

    expect(scene.style.getPropertyValue("--parallax-x")).toBe("")
  })

  it("stays still on touch screens and with reduced motion", () => {
    stubPointer({ fine: false })
    const { scene } = renderScene()

    fireEvent(window, new MouseEvent("pointermove", { clientX: 0, clientY: 0 }))

    expect(scene.style.getPropertyValue("--parallax-x")).toBe("")
  })
})
