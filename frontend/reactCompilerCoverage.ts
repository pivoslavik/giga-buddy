import type { CoverageV8Options } from "vitest/node"

type IgnoreNode = NonNullable<CoverageV8Options["ignoreNode"]>
type Node = Parameters<IgnoreNode>[0]

/** `$[3]`: a slot of the memo cache that the React Compiler gives every component and hook. */
function isCacheSlot(node: Node) {
  return (
    node.type === "MemberExpression" &&
    node.computed &&
    node.object.type === "Identifier" &&
    node.object.name === "$" &&
    node.property.type === "Literal" &&
    typeof node.property.value === "number"
  )
}

/** `$[0] !== title || $[1] !== subtitle`, `$[2] === Symbol.for("react.memo_cache_sentinel")` */
function isCacheCheck(node: Node): boolean {
  if (node.type === "LogicalExpression") return isCacheCheck(node.left) && isCacheCheck(node.right)
  return node.type === "BinaryExpression" && isCacheSlot(node.left)
}

/**
 * Leaves the memoization of the React Compiler out of the coverage. The compiler wraps every
 * value a component renders in `if ($[0] !== deps) { compute; $[0] = deps } else { t0 = $[1] }`,
 * and the source map ties these checks to the lines of the component. The `else` only runs when
 * the component renders again with the same values, so without this filter every component that
 * renders once shows half of its "branches" as missed, although no line of ours is left out.
 *
 * Only the checks and the reads and writes of the cache are skipped: what the compiler moved
 * inside the `if` is our code and is still counted.
 */
export const ignoreReactCompilerCache: IgnoreNode = (node, type) => {
  if (node.type === "IfStatement") return isCacheCheck(node.test)
  // `$[0] !== a || $[1] !== b` is a branch of its own besides the `if`
  if (node.type === "LogicalExpression") return isCacheCheck(node)
  if (type === "statement" && node.type === "ExpressionStatement") {
    const { expression } = node
    return (
      expression.type === "AssignmentExpression" &&
      (isCacheSlot(expression.left) || isCacheSlot(expression.right))
    )
  }
  return false
}
