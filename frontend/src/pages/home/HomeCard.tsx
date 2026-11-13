import { useId, type ReactNode } from "react"
import styles from "./HomeCard.module.css"

interface HomeCardProps {
  title: string
  subtitle: string
  children: ReactNode
}

/** A white card of the main page with a heading; its body stretches to the card height. */
export function HomeCard({ title, subtitle, children }: HomeCardProps) {
  const titleId = useId()

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p className={styles.subtitle}>{subtitle}</p>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
