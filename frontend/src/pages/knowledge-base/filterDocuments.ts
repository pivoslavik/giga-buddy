import type { DocumentCategory, DocumentSummary } from "../../entities/document/document"

export type CategoryFilter = DocumentCategory | "all"
export type SortOrder = "asc" | "desc"

interface DocumentFilters {
  query: string
  category: CategoryFilter
  order: SortOrder
}

/** Lowercase, «ё» as «е» and single spaces: the form in which titles and queries are compared. */
function normalize(text: string) {
  return text.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/g, " ").trim()
}

/* endings of Russian nouns, adjectives and verbs; the regex takes the longest one that fits */
const ENDING =
  /(?:ями|ами|ыми|ими|ого|его|ому|ему|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|ую|юю|ам|ям|ах|ях|ом|ем|ов|ев|ию|ия|ье|ья|ет|ит|ут|ют|ят|[аяоеыиуюьй])$/

/**
 * A query word without its ending, so that «окружение» finds «Настройка окружения» and
 * «документов» finds «Документы». Short words and words in other alphabets stay as they are.
 */
function stem(word: string) {
  const stemmed = word.replace(ENDING, "")
  return stemmed.length >= 3 ? stemmed : word
}

const collator = new Intl.Collator("ru", { sensitivity: "base", numeric: true })

/**
 * The documents of the chosen category whose title or description contains every word of the
 * query, in any order, case and grammatical form, sorted by title.
 */
export function filterDocuments(
  documents: DocumentSummary[],
  { query, category, order }: DocumentFilters,
) {
  const words = normalize(query).split(" ").filter(Boolean).map(stem)
  const direction = order === "asc" ? 1 : -1

  return documents
    .filter((document) => category === "all" || document.category === category)
    .filter((document) => {
      const text = normalize(`${document.title} ${document.description}`)
      return words.every((word) => text.includes(word))
    })
    .sort((a, b) => direction * collator.compare(a.title, b.title))
}

const pluralRules = new Intl.PluralRules("ru")
const DOCUMENT_FORMS: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: "документ",
  few: "документа",
  many: "документов",
}

/** «1 документ», «3 документа», «6 документов». */
export function documentCount(count: number) {
  return `${count} ${DOCUMENT_FORMS[pluralRules.select(count)] ?? "документов"}`
}
