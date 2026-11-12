import styles from "./Faq.module.css"
import { HomeCard } from "./HomeCard"
import { FAQ } from "./homeContent"

/**
 * Questions interns ask most often, as an accordion on native <details>: the browser handles
 * the keyboard and tells assistive tech whether an answer is expanded. A shared `name` keeps
 * one answer open at a time where it is supported; the first one is open from the start.
 */
export function Faq() {
  return (
    <HomeCard title="Частые вопросы" subtitle="Ответы на вопросы, с которыми приходят к AI Buddy">
      <div className={styles.list}>
        {FAQ.map(({ question, answer, command }, index) => (
          <details key={question} name="faq" className={styles.item} open={index === 0}>
            <summary className={styles.question}>
              {question}
              <span className={styles.toggle} aria-hidden="true" />
            </summary>

            <div className={styles.answer}>
              <p>{answer}</p>
              {command && (
                <pre className={styles.command}>
                  <code>{command}</code>
                </pre>
              )}
            </div>
          </details>
        ))}
      </div>
    </HomeCard>
  )
}
