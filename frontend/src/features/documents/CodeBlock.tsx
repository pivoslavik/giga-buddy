import { useEffect, useRef, useState } from "react"
import { CheckIcon, CopyIcon } from "../../shared/ui/icons/icons"
import styles from "./DocumentMarkdown.module.css"

/** How long the block says how copying went. */
const STATUS_MS = 2500

type CopyStatus = "copied" | "failed" | undefined

/**
 * A code block of a document: numbered lines and a button that copies the code. The numbers are
 * drawn by CSS, so a code selected by hand is copied without them too.
 */
export function CodeBlock({ code }: { code: string }) {
  const [status, setStatus] = useState<CopyStatus>()
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(undefined), STATUS_MS)
    return () => clearTimeout(timer)
  }, [status])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setStatus("copied")
    } catch {
      // No clipboard over plain http or without the permission: the code is selected instead,
      // so copying it by hand takes one shortcut.
      if (codeRef.current) window.getSelection()?.selectAllChildren(codeRef.current)
      setStatus("failed")
    }
  }

  return (
    <div className={styles.codeBlock}>
      <pre className={styles.pre}>
        <code ref={codeRef}>
          {code.split("\n").map((line, index) => (
            <span key={index} className={styles.line}>
              {line}
            </span>
          ))}
        </code>
      </pre>
      <button
        type="button"
        className={styles.copy}
        aria-label="Скопировать код"
        title="Скопировать код"
        onClick={copy}
      >
        {status === "copied" ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span role="status" className={styles.copyStatus}>
        {status === "copied" && "Скопировано"}
        {status === "failed" && "Код выделен, скопируй его вручную"}
      </span>
    </div>
  )
}
