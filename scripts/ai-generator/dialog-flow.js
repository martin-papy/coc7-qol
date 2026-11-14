// DOM steps of the generation flow that need no Foundry globals, so they are unit-tested in
// Node (test/ai-dialog-flow.test.js).

/**
 * Detach every child of `parent` except `keep`, and return a function that puts the same
 * nodes back in their original order, dropping whatever was added meanwhile. Moving the
 * original nodes rather than cloning them keeps select values and event listeners.
 * @param {HTMLElement} parent
 * @param {Node | null} [keep]
 * @returns {() => void} restore
 */
export function stashChildren (parent, keep = null) {
  const original = [...parent.childNodes]
  for (const node of original) {
    if (node !== keep) node.remove()
  }
  return () => parent.replaceChildren(...original)
}
