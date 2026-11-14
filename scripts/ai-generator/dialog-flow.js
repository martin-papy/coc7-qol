// DOM steps of the generation flow that need no Foundry globals, so they are unit-tested in
// Node (test/ai-dialog-flow.test.js).

const PENDING_FLAG = 'coc7qolAcceptPending'

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

/**
 * Run a review dialog's accept callback with every button of the dialog disabled, so a
 * double-click cannot create two documents. A call made while one is pending is ignored.
 * On failure (the callback returns anything but true, or throws) the buttons come back so
 * the GM can retry or cancel; on success they stay disabled while the dialog closes.
 * @param {HTMLElement} root   The dialog element.
 * @param {() => Promise<boolean> | boolean} accept
 * @returns {Promise<boolean>} whether the callback succeeded
 */
export async function runAccept (root, accept) {
  if (root.dataset[PENDING_FLAG]) return false
  root.dataset[PENDING_FLAG] = '1'
  const buttons = [...root.querySelectorAll('button')]
  buttons.forEach(button => { button.disabled = true })

  let ok = false
  try {
    ok = (await accept()) === true
    return ok
  } finally {
    if (!ok) {
      buttons.forEach(button => { button.disabled = false })
      delete root.dataset[PENDING_FLAG]
    }
  }
}
