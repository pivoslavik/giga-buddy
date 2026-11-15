import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import {
  documentCategoryLabel,
  documentQueryOptions,
  documentsQueryOptions,
  isDocumentNotFound,
  type DocumentRef,
} from "../../entities/document/document"
import { Button } from "../../shared/ui/Button/Button"
import { ChevronRightIcon, ExternalLinkIcon } from "../../shared/ui/icons/icons"
import { Modal } from "../../shared/ui/Modal/Modal"
import { DocumentMarkdown } from "./DocumentMarkdown"
import styles from "./DocumentModal.module.css"

interface DocumentModalProps {
  /** The document to show: the modal is open while there is one. */
  document: DocumentRef | undefined
  onClose: () => void
}

/**
 * A document of the knowledge base, loaded from GET /api/documents/{id} (#14) and rendered from
 * its markdown. While the text loads, the modal shows what the list of the knowledge base already
 * knows about the document (its title, category and description), if the list is in the cache.
 */
export function DocumentModal({ document: wanted, onClose }: DocumentModalProps) {
  const query = useQuery(documentQueryOptions(wanted))
  const document = query.data
  const id = document?.id ?? (wanted && "id" in wanted ? wanted.id : undefined)
  // reads the card from the cached list without loading the list
  const { data: summary } = useQuery({
    ...documentsQueryOptions,
    select: (documents) => documents.find((candidate) => candidate.id === id),
    enabled: false,
  })

  const notFound = query.isError && isDocumentNotFound(query.error)
  const category = notFound ? undefined : (document?.category ?? summary?.category)
  const title = document?.title ?? summary?.title

  let heading: ReactNode
  let content: ReactNode
  if (notFound) {
    heading = "Документ не найден"
    content = <NotFound />
  } else if (query.isError) {
    heading = title ?? "Документ"
    content = (
      <div className={styles.notice} role="alert">
        <p className={styles.noticeTitle}>Не удалось загрузить документ</p>
        <p>Проверь соединение и попробуй ещё раз.</p>
        <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? "Загружаем…" : "Попробовать ещё раз"}
        </Button>
      </div>
    )
  } else if (document) {
    heading = document.title
    content = <DocumentMarkdown text={document.text} />
  } else {
    heading = title ?? (
      <>
        <span className={styles.visuallyHidden}>Документ</span>
        <span className={`${styles.skeleton} ${styles.titleSkeleton}`} aria-hidden="true" />
      </>
    )
    content = <TextSkeleton />
  }

  const toolbar = (
    <>
      <p className={styles.path}>
        {category !== undefined && (
          <>
            {documentCategoryLabel(category)}
            <ChevronRightIcon className={styles.chevron} />
            {/* the heading right below says it once more */}
            <span className={styles.pathTitle} aria-hidden="true">
              {title}
            </span>
          </>
        )}
        {category === undefined && !query.isError && (
          <span className={`${styles.skeleton} ${styles.pathSkeleton}`} />
        )}
      </p>

      {id !== undefined && !notFound && (
        <Link
          to="/knowledge-base"
          search={{ doc: id }}
          target="_blank"
          rel="noopener"
          className={styles.newTab}
          title="Открыть в новой вкладке"
        >
          <ExternalLinkIcon />
          <span className={styles.newTabLabel}>Открыть в новой вкладке</span>
        </Link>
      )}
    </>
  )

  return (
    <Modal
      open={wanted !== undefined}
      onClose={onClose}
      title={heading}
      description={!notFound ? summary?.description : undefined}
      toolbar={toolbar}
      className={styles.dialog}
    >
      {content}
    </Modal>
  )
}

function NotFound() {
  return (
    <div className={styles.notice}>
      <p>
        Возможно, его удалили или ещё не добавили. Поищи нужное в{" "}
        <Link to="/knowledge-base" className={styles.link}>
          базе знаний
        </Link>{" "}
        или{" "}
        <Link to="/chat" className={styles.link}>
          спроси AI Buddy
        </Link>
        .
      </p>
    </div>
  )
}

function TextSkeleton() {
  return (
    <>
      <p role="status" className={styles.visuallyHidden}>
        Загружаем документ…
      </p>
      <div className={styles.textSkeleton} aria-hidden="true">
        {["40%", "100%", "92%", "64%", "36%", "100%", "84%"].map((width, index) => (
          <span key={index} className={styles.skeleton} style={{ width }} />
        ))}
      </div>
    </>
  )
}
