import styles from "./Logo.module.css"

interface LogoProps {
  className?: string
}

export function LogoMark({ className }: LogoProps) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="11" cy="9" r="6" fill="var(--color-accent-purple)" />
      <circle cx="28" cy="10" r="8" fill="var(--color-accent-blue)" />
      <circle cx="13" cy="27" r="11" fill="var(--color-accent-green)" />
      <circle cx="31" cy="30" r="7" fill="var(--color-accent-red)" />
    </svg>
  )
}

export function Logo({ className }: LogoProps) {
  return (
    <span className={className ? `${styles.logo} ${className}` : styles.logo}>
      <LogoMark className={styles.mark} />
      <span className={styles.text}>AI Buddy</span>
    </span>
  )
}
