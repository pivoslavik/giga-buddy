import type { Heading, Nodes, Root } from "mdast"

/** The level the top headings of a document get: the title of the modal is an <h2>. */
const TOP_LEVEL = 3

function collectHeadings(node: Nodes, headings: Heading[]) {
  if (node.type === "heading") headings.push(node)
  if ("children" in node) {
    for (const child of node.children) collectHeadings(child, headings)
  }
  return headings
}

/**
 * A remark plugin that fits the headings of a document under the title of the modal.
 *
 * - A document starts with its own title as a rule. The modal shows the title from the API above
 *   the text, so the first heading is dropped when it is the only `#` heading of the document.
 *   (Several `#` headings are sections, the first of them stays.)
 * - The other headings keep their order, but the top ones become <h3> under the <h2> title:
 *   a document of `##` and `###` sections gets <h3> and <h4>, as one of `#` and `##` does.
 */
export function remarkDocumentHeadings() {
  return (tree: Root) => {
    const headings = collectHeadings(tree, [])

    const [first] = tree.children
    const titles = headings.filter((heading) => heading.depth === 1)
    if (first?.type === "heading" && first.depth === 1 && titles.length === 1) {
      tree.children.shift()
      headings.splice(headings.indexOf(first), 1)
    }

    const top = Math.min(...headings.map((heading) => heading.depth))
    for (const heading of headings) {
      heading.depth = Math.min(6, heading.depth - top + TOP_LEVEL) as Heading["depth"]
    }
  }
}
