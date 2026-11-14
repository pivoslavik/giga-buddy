import { Link } from "@tanstack/react-router"
import type { ComponentType, SVGProps } from "react"
import {
  DOCUMENT_CATEGORY_LABELS,
  isDocumentCategory,
  type DocumentCategory,
  type DocumentSummary,
} from "../../entities/document/document"
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BuildingIcon,
  CalendarIcon,
  CodeIcon,
  DocumentIcon,
  HeartIcon,
  RocketIcon,
  SparkleIcon,
  UsersIcon,
} from "../../shared/ui/icons/icons"
import styles from "./DocumentCard.module.css"

interface CategoryLook {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  tone: "green" | "blue" | "pink" | "yellow" | "cyan" | "slate" | "purple"
}

const CATEGORY_LOOKS: Record<DocumentCategory, CategoryLook> = {
  start_work: { icon: RocketIcon, tone: "green" },
  development: { icon: CodeIcon, tone: "blue" },
  work_processes: { icon: CalendarIcon, tone: "pink" },
  team_values: { icon: HeartIcon, tone: "yellow" },
  contacts: { icon: UsersIcon, tone: "cyan" },
  company: { icon: BuildingIcon, tone: "slate" },
  ai_answers: { icon: SparkleIcon, tone: "purple" },
}

/** A category the backend added before the frontend learned about it. */
const OTHER: CategoryLook & { label: string } = {
  icon: DocumentIcon,
  tone: "slate",
  label: "Другое",
}

function lookOf(category: string) {
  return isDocumentCategory(category)
    ? { ...CATEGORY_LOOKS[category], label: DOCUMENT_CATEGORY_LABELS[category] }
    : OTHER
}

interface DocumentCardProps {
  document: DocumentSummary
  /** Called when the card is clicked, before the router opens the document. */
  onOpen: () => void
}

/**
 * A document of the knowledge base. The title is the link to the document; it stretches over
 * the whole card, so the card is clicked anywhere, while a screen reader hears just the title.
 */
export function DocumentCard({ document, onOpen }: DocumentCardProps) {
  const { icon: Icon, tone, label } = lookOf(document.category)

  return (
    <li className={`${styles.card} ${styles[tone]}`}>
      <span className={styles.icon}>
        <Icon />
      </span>

      <div className={styles.text}>
        <p className={styles.category}>{label}</p>
        <h3 className={styles.title}>
          <Link
            to="/knowledge-base"
            search={{ doc: document.id }}
            className={styles.link}
            aria-haspopup="dialog"
            onClick={onOpen}
          >
            {document.title}
          </Link>
        </h3>
        <p className={styles.description}>{document.description}</p>
      </div>

      <span className={styles.more} aria-hidden="true">
        Открыть документ
        <ArrowUpRightIcon />
      </span>
      <ArrowRightIcon className={styles.hoverArrow} />
    </li>
  )
}
