import styles from "./PageTitle.module.css"

interface PageTitleProps {
  title: string
  subtitle?: string
  className?: string
}

/** The big heading every app page starts with, optionally with a line under it. */
export function PageTitle({ title, subtitle, className }: PageTitleProps) {
  return (
    <div className={className}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  )
}
