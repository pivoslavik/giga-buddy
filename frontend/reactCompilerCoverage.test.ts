// @vitest-environment node
import { parseSync, transformAsync } from "@babel/core"
import { reactCompilerPreset } from "@vitejs/plugin-react"
import { describe, expect, it } from "vitest"
import { ignoreReactCompilerCache } from "./reactCompilerCoverage.ts"

type Node = Parameters<typeof ignoreReactCompilerCache>[0]

const component = `
export function Greeting({ name, unread }) {
  if (!name) return null
  const label = unread > 0 && unread + " new"
  return <p title={name}>{name} {label}</p>
}
`

/** Compiles the component with the React Compiler the way vite.config.ts does. */
async function compile(source: string) {
  const options = {
    filename: "Greeting.jsx",
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["jsx" as const] },
  }
  const result = await transformAsync(source, {
    ...options,
    presets: [reactCompilerPreset().preset],
  })
  const code = result?.code ?? ""
  // the ESTree shape is what the coverage provider passes to the filter
  const ast = parseSync(code, { ...options, parserOpts: { plugins: ["jsx", "estree"] } })
  return { code, ast }
}

/** Every node of the tree, depth first. */
function* nodesOf(value: unknown): Generator<Node> {
  if (Array.isArray(value)) {
    for (const item of value) yield* nodesOf(item)
  } else if (value && typeof value === "object") {
    if ("type" in value && typeof value.type === "string") yield value as Node
    for (const [key, child] of Object.entries(value)) if (key !== "loc") yield* nodesOf(child)
  }
}

describe("ignoreReactCompilerCache", () => {
  it("skips the memo cache of the React Compiler and keeps the code of the component", async () => {
    const { code, ast } = await compile(component)
    const source = (node: Node) => {
      const { start, end } = node as Node & { start: number; end: number }
      return code.slice(start, end).split("\n", 1)[0]
    }
    const ignored = (node: Node) =>
      ignoreReactCompilerCache(node, "branch") || ignoreReactCompilerCache(node, "statement")
    const nodes = [...nodesOf(ast?.program)]
    const skipped = nodes.filter(ignored).map(source)
    const counted = nodes.filter((node) => !ignored(node)).map(source)

    // the compiler did memoize the component
    expect(code).toContain("_c(")
    expect(skipped.length).toBeGreaterThan(0)
    for (const line of skipped) {
      // a check of the cache, a branch of such a check, or a write to or a read from the cache
      expect(line).toMatch(/^if \(\$\[\d+\] |^\$\[\d+\] [!=]== |^\$\[\d+\] = |^t\d+ = \$\[\d+\];$/)
    }
    // statements, which end with a semicolon, are what the coverage counts, not their expressions
    expect(counted.filter((line) => /^if \(\$\[|\$\[\d+\];$|^\$\[\d+\] = .*;$/.test(line))).toEqual(
      [],
    )

    expect(counted).toContain("if (!name) {")
    expect(counted).toContain('unread > 0 && unread + " new"')
  })
})
