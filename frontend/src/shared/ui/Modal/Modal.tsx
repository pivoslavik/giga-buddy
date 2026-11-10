import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react"
import { CloseIcon } from "../icons/icons"
import styles from "./Modal.module.css"

interface ModalProps {
  open: boolean
  /** Called once whenever the modal closes: close button, Esc, backdrop click or `open={false}`. */
  onClose: () => void
  title: string
  description?: string
  className?: string
  children?: ReactNode
}

/**
 * Modal built on the native <dialog>: the browser gives us the top layer, focus trapping,
 * Esc handling and an inert page behind it, so we only sync it with the `open` prop.
 */
export function Modal({ open, onClose, title, description, className, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pressStartedOnBackdrop = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
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
      <div className={styles.content}>
        <button type="button" className={styles.close} aria-label="Закрыть" onClick={requestClose}>
          <CloseIcon />
        </button>

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
