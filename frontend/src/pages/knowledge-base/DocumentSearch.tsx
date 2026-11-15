import { useEffect, useRef } from "react"
import { SearchIcon } from "../../shared/ui/icons/icons"
import styles from "./DocumentSearch.module.css"

const SHORTCUT_HINT = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ K" : "Ctrl K"

interface DocumentSearchProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

/** The search field of the knowledge base; Ctrl+K (⌘K on a Mac) moves the focus into it. */
export function DocumentSearch({ value, onChange, className }: DocumentSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function focusOnShortcut(event: KeyboardEvent) {
      // the key, not the letter: the shortcut works with any keyboard layout, e.g. the Russian one
      const isShortcut =
        event.code === "KeyK" &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey
      // behind an open modal the page is inert, so the keys stay with the browser
      if (!isShortcut || document.querySelector("dialog[open]")) return

      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }

    document.addEventListener("keydown", focusOnShortcut)
    return () => document.removeEventListener("keydown", focusOnShortcut)
  }, [])

  return (
    <div role="search" className={className ? `${styles.search} ${className}` : styles.search}>
      <SearchIcon className={styles.icon} />
      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Поиск по названию или описанию"
        aria-keyshortcuts="Control+K Meta+K"
        placeholder="Поиск по названию или описанию"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {!value && (
        <kbd className={styles.shortcut} aria-hidden="true">
          {SHORTCUT_HINT}
        </kbd>
      )}
    </div>
  )
}
