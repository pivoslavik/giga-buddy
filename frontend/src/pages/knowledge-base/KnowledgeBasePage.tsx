import { useQuery } from "@tanstack/react-query"
import { getRouteApi, Link, useRouter } from "@tanstack/react-router"
import { useDeferredValue, useId, useRef, useState, type ReactNode } from "react"
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  documentsQueryOptions,
  type DocumentSummary,
} from "../../entities/document/document"
import { DocumentModal } from "../../features/documents/DocumentModal"
import { Button } from "../../shared/ui/Button/Button"
import { ArrowDownIcon, ArrowRightIcon } from "../../shared/ui/icons/icons"
import { PageTitle } from "../../shared/ui/PageTitle/PageTitle"
import { DocumentCard } from "./DocumentCard"
import { DocumentSearch } from "./DocumentSearch"
import { DocumentsIllustration } from "./DocumentsIllustration"
import {
  documentCount,
  filterDocuments,
  type CategoryFilter,
  type SortOrder,
} from "./filterDocuments"
import styles from "./KnowledgeBasePage.module.css"

/** Search params of /knowledge-base. */
export interface KnowledgeBaseSearch {
  /** The id of the document open in the modal. */
  doc?: number
}

const route = getRouteApi("/authenticated/knowledge-base")

const SKELETON_CARDS = 6

/**
 * The knowledge base: every document as a card, with a search by title and description,
 * a filter by category and sorting by title. A card opens its document in a modal over the list;
 * the open document is in the URL (`?doc=<id>`), so it can be opened in a new tab or shared.
 */
export function KnowledgeBasePage() {
  const { doc } = route.useSearch()
  const navigate = route.useNavigate()
  const router = useRouter()
  const documents = useQuery(documentsQueryOptions)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<CategoryFilter>("all")
  const [order, setOrder] = useState<SortOrder>("asc")
  const deferredQuery = useDeferredValue(query)
  const openedFromList = useRef(false)
  const headingId = useId()

  const allDocuments = documents.data ?? []
  // only the categories that have documents get a filter, so none of them leads to an empty list
  const categories = DOCUMENT_CATEGORIES.filter((value) =>
    allDocuments.some((document) => document.category === value),
  )
  const activeCategory = category !== "all" && categories.includes(category) ? category : "all"
  const visibleDocuments = filterDocuments(allDocuments, {
    query: deferredQuery,
    category: activeCategory,
    order,
  })
  const openDocument = allDocuments.find((document) => document.id === doc)

  function resetFilters() {
    setQuery("")
    setCategory("all")
  }

  function closeDocument() {
    // the modal reports closing also when Back has already taken the document out of the URL
    if (doc === undefined) return

    // A document opened from the list is one history entry after it, so going back closes it and
    // Back keeps leading to the page before the list. Opened by its link, it gives way to the list.
    if (openedFromList.current) {
      router.history.back()
    } else {
      void navigate({ search: {}, replace: true })
    }
  }

  let list: ReactNode
  if (documents.isPending) {
    list = <SkeletonList />
  } else if (documents.isError && !documents.data) {
    list = (
      <Notice role="alert" title="Не удалось загрузить документы">
        <p>Проверь соединение и попробуй ещё раз.</p>
        <Button onClick={() => void documents.refetch()} disabled={documents.isFetching}>
          {documents.isFetching ? "Загружаем…" : "Попробовать ещё раз"}
        </Button>
      </Notice>
    )
  } else if (allDocuments.length === 0) {
    list = (
      <Notice title="В базе знаний пока нет документов">
        <p>Пока их добавляют, спроси AI Buddy в чате: он знает ответы на частые вопросы.</p>
      </Notice>
    )
  } else if (visibleDocuments.length === 0) {
    list = (
      <Notice title="Ничего не нашлось">
        <p>Попробуй другие слова или спроси AI Buddy в чате.</p>
        <Button onClick={resetFilters}>Показать все документы</Button>
      </Notice>
    )
  } else {
    list = (
      <DocumentGrid
        documents={visibleDocuments}
        onOpen={() => {
          openedFromList.current = true
        }}
      />
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <PageTitle
          className={styles.title}
          title="База знаний"
          subtitle="Всё, что нужно для уверенного старта в команде"
        />
        <DocumentsIllustration className={styles.art} />
        <DocumentSearch className={styles.search} value={query} onChange={setQuery} />

        <div className={styles.categories} role="group" aria-label="Категории">
          <CategoryButton pressed={activeCategory === "all"} onClick={() => setCategory("all")}>
            Все документы
          </CategoryButton>
          {categories.map((value) => (
            <CategoryButton
              key={value}
              pressed={activeCategory === value}
              onClick={() => setCategory(value)}
            >
              {DOCUMENT_CATEGORY_LABELS[value]}
            </CategoryButton>
          ))}
        </div>
      </div>

      <section
        className={styles.documents}
        aria-labelledby={headingId}
        aria-busy={documents.isPending}
      >
        <div className={styles.listHeader}>
          <h2 id={headingId} className={styles.listTitle}>
            {activeCategory === "all" ? "Все документы" : DOCUMENT_CATEGORY_LABELS[activeCategory]}
          </h2>
          {/* announces how many documents the search leaves */}
          <p className={styles.count} aria-live="polite">
            {documents.data && documentCount(visibleDocuments.length)}
          </p>
          <button
            type="button"
            className={styles.sort}
            aria-label={`По названию, ${order === "asc" ? "от А до Я" : "от Я до А"}`}
            title="Поменять порядок"
            onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
          >
            По названию
            <ArrowDownIcon className={order === "desc" ? styles.reversed : undefined} />
          </button>
        </div>

        {list}
      </section>

      <p className={styles.footer}>
        Не нашёл ответ?
        <Link to="/chat" className={styles.ask}>
          Спроси AI Buddy
          <ArrowRightIcon />
        </Link>
      </p>

      {/* TODO(#17): the modal loads the document from GET /api/documents/{id} by itself */}
      <DocumentModal
        title={openDocument?.title ?? "Документ"}
        open={doc !== undefined}
        onClose={closeDocument}
      />
    </div>
  )
}

function CategoryButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={styles.category} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

function DocumentGrid({ documents, onOpen }: { documents: DocumentSummary[]; onOpen: () => void }) {
  return (
    <ul className={styles.grid}>
      {documents.map((document) => (
        <DocumentCard key={document.id} document={document} onOpen={onOpen} />
      ))}
    </ul>
  )
}

function SkeletonList() {
  return (
    <>
      <p role="status" className={styles.visuallyHidden}>
        Загружаем документы…
      </p>
      <ul className={styles.grid} aria-hidden="true">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <li key={index} className={styles.skeleton} />
        ))}
      </ul>
    </>
  )
}

function Notice({ title, role, children }: { title: string; role?: "alert"; children: ReactNode }) {
  return (
    <div className={styles.notice} role={role}>
      <p className={styles.noticeTitle}>{title}</p>
      {children}
    </div>
  )
}
