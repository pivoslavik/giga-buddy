import { useState } from "react"
import type { DocumentRef } from "../../entities/document/document"
import { DocumentModal } from "../../features/documents/DocumentModal"
import { ArrowUpRightIcon, DocumentIcon } from "../../shared/ui/icons/icons"
import styles from "./FirstSteps.module.css"
import { HomeCard } from "./HomeCard"
import { FIRST_STEPS } from "./homeContent"

/**
 * The document of the knowledge base the steps come from (#5). Its id is not known in advance,
 * so it is looked up by the title.
 */
const FIRST_STEPS_DOCUMENT: DocumentRef = { title: "Первые шаги" }

/** The onboarding plan in four steps and the way to its full document. */
export function FirstSteps() {
  const [isDocumentOpen, setIsDocumentOpen] = useState(false)

  return (
    <HomeCard title="Первые шаги" subtitle="Твой старт в проекте">
      <ol className={styles.steps}>
        {FIRST_STEPS.map(({ title, text, tone }, index) => (
          <li key={title} className={styles.step}>
            {/* the list already numbers the steps for assistive tech */}
            <span className={`${styles.number} ${styles[tone]}`} aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <h3 className={styles.stepTitle}>{title}</h3>
              <p className={styles.stepText}>{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.documentButton}
          aria-haspopup="dialog"
          onClick={() => setIsDocumentOpen(true)}
        >
          <DocumentIcon />
          Открыть документ „Первые шаги“
          <ArrowUpRightIcon className={styles.arrow} />
        </button>
      </div>

      <DocumentModal
        document={isDocumentOpen ? FIRST_STEPS_DOCUMENT : undefined}
        onClose={() => setIsDocumentOpen(false)}
      />
    </HomeCard>
  )
}
