import { queryOptions, skipToken } from "@tanstack/react-query"
import { apiFetch, ApiError } from "../../shared/api/client"

/** The `document_category` enum of the database (#13), in the order the knowledge base shows it. */
export const DOCUMENT_CATEGORIES = [
  "start_work",
  "development",
  "work_processes",
  "team_values",
  "contacts",
  "company",
  "ai_answers",
] as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  start_work: "Начало работы",
  development: "Разработка",
  work_processes: "Процессы",
  team_values: "Ценности",
  contacts: "Контакты",
  company: "Компания",
  ai_answers: "Ответы AI",
}

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value)
}

/** The name of a category; one the frontend does not know yet is shown as «Другое». */
export function documentCategoryLabel(category: string) {
  return isDocumentCategory(category) ? DOCUMENT_CATEGORY_LABELS[category] : "Другое"
}

/**
 * A card of the knowledge base from GET /api/documents (#13). The category is typed as a string:
 * the integration service picks it, so the enum may grow before the frontend knows the new value.
 */
export interface DocumentSummary {
  id: number
  title: string
  description: string
  category: string
}

/**
 * How many documents the knowledge base asks for. The backend has neither a search nor an offset
 * yet, so the page shows these first documents and searches and filters among them.
 */
export const DOCUMENTS_LIMIT = 20

/**
 * GET /api/documents?amount=…&category=…: `amount` and at least one `category` are required,
 * so every known category is sent and the page filters by category itself.
 */
export function documentsPath(amount = DOCUMENTS_LIMIT) {
  const params = new URLSearchParams({ amount: String(amount) })
  for (const category of DOCUMENT_CATEGORIES) params.append("category", category)
  return `/api/documents?${params}`
}

export async function fetchDocuments(signal?: AbortSignal): Promise<DocumentSummary[]> {
  const documents = await apiFetch<DocumentSummary[]>(documentsPath(), { signal })
  if (!Array.isArray(documents)) throw new Error("Expected a list of documents")
  return documents
}

export const documentsQueryOptions = queryOptions({
  queryKey: ["documents", "list"],
  queryFn: ({ signal }) => fetchDocuments(signal),
  staleTime: 5 * 60 * 1000,
  // the page shows the error right away with a button to try again
  retry: false,
})

/**
 * A whole document from GET /api/documents/{id} (#14). The response has no id, the request
 * adds it, so the document can be linked to. `text` is the markdown of the document.
 */
export interface DocumentDetails {
  id: number
  title: string
  category: string
  text: string
}

export function documentPath(id: number) {
  return `/api/documents/${id}`
}

export async function fetchDocument(id: number, signal?: AbortSignal): Promise<DocumentDetails> {
  const document = await apiFetch<Partial<Omit<DocumentDetails, "id">> | undefined>(
    documentPath(id),
    { signal },
  )
  if (typeof document?.title !== "string" || typeof document.text !== "string") {
    throw new Error("Expected a document with a title and a text")
  }
  return {
    id,
    title: document.title,
    category: String(document.category ?? ""),
    text: document.text,
  }
}

/**
 * Which document to show: the one with this id, or the one with this title. A page knows the title
 * of a document it links to, like «Первые шаги» on the main page, but not its id in the database.
 */
export type DocumentRef = { id: number } | { title: string }

const normalizeTitle = (title: string) => title.trim().toLocaleLowerCase("ru").replaceAll("ё", "е")

/**
 * The document with the given title. The integration lets a model name the documents, after their
 * own heading as a rule, so the title may come refined: «Первые шаги стажёра» counts as
 * «Первые шаги» when no document has exactly that title.
 */
export function findDocumentByTitle(documents: DocumentSummary[], title: string) {
  const wanted = normalizeTitle(title)
  return (
    documents.find((document) => normalizeTitle(document.title) === wanted) ??
    documents.find((document) => normalizeTitle(document.title).includes(wanted))
  )
}

/**
 * Loads a document; without one the query waits. A document asked by its title is looked up in
 * the list of the knowledge base first (the cached one, if it is fresh); when there is no such
 * document, the query fails with a 404 like an unknown id does.
 */
export function documentQueryOptions(ref: DocumentRef | undefined) {
  return queryOptions({
    queryKey: ["documents", "detail", ref ?? null],
    queryFn:
      ref === undefined
        ? skipToken
        : async ({ client, signal }): Promise<DocumentDetails> => {
            if ("id" in ref) return fetchDocument(ref.id, signal)

            const documents = await client.fetchQuery(documentsQueryOptions)
            const summary = findDocumentByTitle(documents, ref.title)
            if (!summary) throw new ApiError(404, `There is no document titled «${ref.title}»`)
            return client.fetchQuery(documentQueryOptions({ id: summary.id }))
          },
    staleTime: 5 * 60 * 1000,
    // the modal shows the error right away with a button to try again
    retry: false,
  })
}

/** Whether the document is missing: deleted, never added or asked by a wrong id. */
export function isDocumentNotFound(error: unknown) {
  return error instanceof ApiError && (error.status === 404 || error.status === 400)
}
