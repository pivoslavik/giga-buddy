import { queryOptions } from "@tanstack/react-query"
import { apiFetch } from "../../shared/api/client"

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
 * How many documents the knowledge base asks for. The backend has no search and no offset, and
 * the page searches the titles and descriptions itself, so it loads the whole base at once.
 */
export const DOCUMENTS_LIMIT = 500

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
