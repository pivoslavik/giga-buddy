import type { ElementContent } from "hast"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { InfoIcon } from "../../shared/ui/icons/icons"
import { CodeBlock } from "./CodeBlock"
import { remarkDocumentHeadings } from "./documentHeadings"
import styles from "./DocumentMarkdown.module.css"

const remarkPlugins = [remarkGfm, remarkDocumentHeadings]

function textOf(node: ElementContent): string {
  if (node.type === "text") return node.value
  return node.type === "element" ? node.children.map(textOf).join("") : ""
}

const components: Components = {
  pre({ node }) {
    // the markdown parser ends the code of a block with a line break
    const code = node ? node.children.map(textOf).join("").replace(/\n$/, "") : ""
    return <CodeBlock code={code} />
  },
  // a wide table scrolls by itself instead of the whole modal
  table({ children }) {
    return (
      <div className={styles.tableScroll} role="region" aria-label="Таблица" tabIndex={0}>
        <table>{children}</table>
      </div>
    )
  },
  // quotes in the documents are notes to the text around them, like the one in the reference
  blockquote({ children }) {
    return (
      <blockquote className={styles.note}>
        <InfoIcon className={styles.noteIcon} />
        <div className={styles.noteText}>{children}</div>
      </blockquote>
    )
  },
  // links lead out of the app, mostly to the services of the team: the document stays open
  a({ href, title, children }) {
    const external = href !== undefined && /^https?:\/\//i.test(href)
    return (
      <a
        href={href}
        title={title}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    )
  },
  img({ src, alt, title }) {
    return <img src={src} alt={alt ?? ""} title={title} loading="lazy" />
  },
}

/**
 * The text of a document, written in markdown with GitHub extensions (tables, task lists, strike).
 * HTML inside the markdown is skipped: the documents come from a shared drive, not from the app.
 */
export function DocumentMarkdown({ text }: { text: string }) {
  return (
    <div className={styles.markdown}>
      <Markdown skipHtml remarkPlugins={remarkPlugins} components={components}>
        {text}
      </Markdown>
    </div>
  )
}
