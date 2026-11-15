// jsdom has no AnimationEvent. Without it react-dom listens to webkitAnimationEnd instead of
// animationend, so fireEvent.animationEnd would never reach an onAnimationEnd handler.
// vite.config.test.ts runs in the node environment, where there is no window.
if (typeof window !== "undefined" && typeof window.AnimationEvent !== "function") {
  window.AnimationEvent = class AnimationEvent extends Event {
    readonly animationName: string
    readonly elapsedTime: number
    readonly pseudoElement: string

    constructor(type: string, init: AnimationEventInit = {}) {
      super(type, init)
      this.animationName = init.animationName ?? ""
      this.elapsedTime = init.elapsedTime ?? 0
      this.pseudoElement = init.pseudoElement ?? ""
    }
  }
}
