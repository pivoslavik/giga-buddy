import { getRouteApi } from "@tanstack/react-router"
import { useEffect, useId, useRef, useState, type FocusEvent } from "react"
import { useLogout } from "../../features/auth/logout"
import { Avatar } from "../../shared/ui/Avatar/Avatar"
import { LogoutIcon } from "../../shared/ui/icons/icons"
import styles from "./UserMenu.module.css"

const authenticatedRoute = getRouteApi("/authenticated")

/**
 * The avatar in the header: it opens a panel that says who is logged in and lets them log out.
 *
 * This is a disclosure, not an ARIA menu: the panel has a single button, Tab reaches it.
 * The panel closes on Esc (focus goes back to the avatar), on a click outside and when
 * focus leaves it.
 */
export function UserMenu() {
  const { user } = authenticatedRoute.useRouteContext()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const logoutMutation = useLogout()
  const { isPending, isError } = logoutMutation
  const name = user.display_name || user.username

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setIsOpen(false)
      toggleRef.current?.focus()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  const handleToggle = () => {
    // an error is about the previous attempt, the reopened panel starts clean
    if (!isOpen && isError) logoutMutation.reset()
    setIsOpen(!isOpen)
  }

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false)
  }

  const handleLogout = () => {
    if (!isPending) logoutMutation.mutate()
  }

  return (
    <div ref={rootRef} className={styles.root} onBlur={handleBlur}>
      <button
        ref={toggleRef}
        type="button"
        className={styles.toggle}
        aria-label={`Аккаунт: ${name}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={handleToggle}
      >
        <Avatar name={name} />
      </button>

      {/* focusable, so a click on the text inside does not count as focus leaving the panel */}
      <div id={panelId} className={styles.panel} hidden={!isOpen} tabIndex={-1}>
        <div className={styles.account}>
          <Avatar name={name} />
          <div className={styles.who}>
            <p className={styles.name}>{name}</p>
            <p className={styles.login}>{user.email || user.username}</p>
          </div>
        </div>

        {/* aria-disabled keeps focus on the button while the request is in flight */}
        <button
          type="button"
          className={styles.logout}
          aria-disabled={isPending || undefined}
          onClick={handleLogout}
        >
          <LogoutIcon />
          {isPending ? "Выходим…" : "Выйти из аккаунта"}
        </button>

        {isError && (
          <p role="alert" className={styles.error}>
            Не удалось выйти. Попробуй ещё раз чуть позже
          </p>
        )}
      </div>
    </div>
  )
}
