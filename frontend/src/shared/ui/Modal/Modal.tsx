import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react"
import { CloseIcon } from "../icons/icons"
import styles from "./Modal.module.css"

interface ModalProps {
  open: boolean
  /** Called once whenever the modal closes: close button, Esc, backdrop click or `open={false}`. */
  onClose: () => void
  /** The heading, which also names the dialog for assistive tech. */
  title: ReactNode
  description?: string
  /**
   * A bar over the title, next to the close button: where the content comes from and actions
   * with it. It stays in place while a long content scrolls under it.
   */
  toolbar?: ReactNode
  className?: string
  children?: ReactNode
}

/**
 * Modal built on the native <dialog>: the browser gives us the top layer, focus trapping,
 * Esc handling and an inert page behind it, so we only sync it with the `open` prop.
 *
 * On open the close button gets the focus, even when the toolbar comes before it.
 * Mark another element with `data-autofocus` to start there instead, e.g. the first field
 * of a form. (React's `autoFocus` does not help: it focuses on mount, before the dialog opens.)
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  toolbar,
  className,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pressStartedOnBackdrop = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
      // a modal opened once more starts from the top, not where its last content was scrolled to
      dialog.scrollTop = 0
      const autofocus = dialog.querySelector<HTMLElement>("[data-autofocus]") ?? closeRef.current
      autofocus?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Every way of closing goes through dialog.close(), so onClose is reported
  // only from the native "close" event and never fires twice.
  const requestClose = () => dialogRef.current?.close()

  // The content fills the whole dialog box, so a press on the <dialog> element itself
  // is a press on the backdrop. Both ends must be there: selecting text inside
  // the modal and releasing the mouse outside should not close it.
  const handleMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    pressStartedOnBackdrop.current = event.target === event.currentTarget
  }

  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (pressStartedOnBackdrop.current && event.target === event.currentTarget) {
      requestClose()
    }
    pressStartedOnBackdrop.current = false
  }

  const closeButton = (
    <button
      ref={closeRef}
      type="button"
      className={styles.close}
      aria-label="Закрыть"
      onClick={requestClose}
    >
      <CloseIcon />
    </button>
  )

  return (
    <dialog
      ref={dialogRef}
      className={className ? `${styles.dialog} ${className}` : styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div className={toolbar ? `${styles.content} ${styles.withToolbar}` : styles.content}>
        {toolbar ? (
          <div className={styles.toolbar}>
            {toolbar}
            {closeButton}
          </div>
        ) : (
          closeButton
        )}

        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        )}

        {children && <div className={styles.body}>{children}</div>}
      </div>
    </dialog>
  )
}
