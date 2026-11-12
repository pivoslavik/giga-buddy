import styles from "./Avatar.module.css"

interface AvatarProps {
  /** Whose avatar it is: the first letter is shown. */
  name: string
  className?: string
}

/**
 * A circle with the first letter of the name. Hidden from assistive tech: the control or text
 * around it should say whose it is.
 */
export function Avatar({ name, className }: AvatarProps) {
  // Array.from splits by code points, so a name starting with an emoji is not cut in half
  const [initial = "?"] = Array.from(name.trim())

  return (
    <span
      className={className ? `${styles.avatar} ${className}` : styles.avatar}
      aria-hidden="true"
    >
      {initial.toLocaleUpperCase("ru")}
    </span>
  )
}
