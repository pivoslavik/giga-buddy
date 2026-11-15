import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})

// vite.config.test.ts runs in the node environment, where there is no DOM to patch
if (typeof window !== "undefined") {
  // jsdom does not implement scrolling and logs an error whenever the router restores scroll position
  window.scrollTo = () => {}

  // jsdom does not implement the modal <dialog> API, so we emulate the part the app relies on:
  // showModal() opens the dialog, close() hides it and fires the "close" event like browsers do.
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true
    }

    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      if (!this.open) return
      this.open = false
      this.dispatchEvent(new Event("close"))
    }
  }
}
