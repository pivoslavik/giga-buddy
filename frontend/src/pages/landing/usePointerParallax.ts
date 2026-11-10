import { useEffect, type RefObject } from "react"

const PARALLAX_QUERY =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"

/**
 * Writes the pointer position relative to the viewport center into `--parallax-x` and
 * `--parallax-y` (from -1 to 1) on the element, so CSS can shift layers by their depth.
 * Only for mouse users who did not ask the system to reduce motion.
 */
export function usePointerParallax(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current
    if (!element || !window.matchMedia?.(PARALLAX_QUERY).matches) return

    let frame = 0
    const handlePointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth) * 2 - 1
        const y = (event.clientY / window.innerHeight) * 2 - 1
        element.style.setProperty("--parallax-x", x.toFixed(3))
        element.style.setProperty("--parallax-y", y.toFixed(3))
      })
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      cancelAnimationFrame(frame)
    }
  }, [ref])
}
