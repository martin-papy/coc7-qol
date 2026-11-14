import { CLOSE_BUTTON_SELECTOR } from './card-closing.js'

/**
 * Closing a finished card the way CoC7 does: by pressing its Close card button.
 *
 * The system exposes no function for this, and its Close does more than flip
 * the flag — on an opposed card it first flags the winner's skill for
 * development, on a combined card every successful skill. Writing the flag
 * from here would skip that silently. So the message is rendered off screen,
 * which makes CoC7 bind its own click handler to the button, and the button is
 * clicked. Whatever the running CoC7 version does on Close then happens.
 */

/** How long CoC7 gets to bind its handler to the rendered card. */
const BIND_TIMEOUT_MS = 2000

/** How long CoC7 gets to write the closed card back after the click. */
const CLOSE_TIMEOUT_MS = 5000

/** Marks our own off-screen render among the renderChatMessageHTML calls. */
const RENDER_MARK = 'coc7qolSystemClose'

/**
 * Resolve with a promise's value, or with `fallback` once the time is up.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {T} fallback
 * @returns {Promise<T>}
 */
function within (promise, ms, fallback) {
  let timer
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Resolve once a click listener has been added to a button.
 *
 * CoC7 binds its handlers after an await (render-chat-message-html.js resolves
 * the card's actors first), so "rendered" does not mean "clickable", and a
 * listener cannot be detected after the fact. The button's addEventListener is
 * therefore shadowed for the one call that matters and restored at once.
 * @param {HTMLElement} button
 * @returns {Promise<true>}
 */
function clickListenerAdded (button) {
  return new Promise(resolve => {
    button.addEventListener = function (type, ...rest) {
      EventTarget.prototype.addEventListener.call(this, type, ...rest)
      if (type !== 'click') return
      delete this.addEventListener
      // CoC7 adds a second, generic [data-action] listener in the same task; let it land.
      setTimeout(() => resolve(true), 0)
    }
  })
}

/**
 * Render a message off screen and resolve with its Close card button once CoC7
 * has bound a click handler to it.
 * @param {ChatMessage} message
 * @param {number} bindTimeoutMs
 * @returns {Promise<HTMLElement|null>}  null when the card has no such button or nothing bound it in time
 */
async function renderBoundCloseButton (message, bindTimeoutMs) {
  const mark = Symbol(message.id)
  let button = null
  let bound = Promise.resolve(false)

  // Hooks run in registration order, so this one runs after the synchronous
  // part of CoC7's own render hook and before its asynchronous binding.
  const hookId = Hooks.on('renderChatMessageHTML', (rendered, html, context) => {
    if (context?.[RENDER_MARK] !== mark) return
    button = html.querySelector(CLOSE_BUTTON_SELECTOR)
    if (button) bound = clickListenerAdded(button)
  })
  try {
    await message.renderHTML({ [RENDER_MARK]: mark })
  } finally {
    Hooks.off('renderChatMessageHTML', hookId)
  }

  if (!button) return null
  const isBound = await within(bound, bindTimeoutMs, false)
  if (!isBound) delete button.addEventListener
  return isBound ? button : null
}

/**
 * Resolve with true once a message has been updated to a closed card.
 * @param {string} messageId
 * @param {number} closeTimeoutMs
 * @returns {Promise<boolean>}  false when it did not happen in time
 */
function cardClosed (messageId, closeTimeoutMs) {
  let hookId
  const updated = new Promise(resolve => {
    hookId = Hooks.on('updateChatMessage', message => {
      if (message.id === messageId && message.flags?.CoC7?.load?.cardOpen === false) resolve(true)
    })
  })
  return within(updated, closeTimeoutMs, false).finally(() => Hooks.off('updateChatMessage', hookId))
}

/**
 * Click a button so that CoC7's handler can still tell which button it was.
 *
 * CoC7's handlers read `event.currentTarget` after an await (check.js:
 * `await loadFromMessage(message)`, then `event.currentTarget.dataset.set`).
 * A real click survives that: the browser runs the pending microtasks between
 * listeners, while the event is still being dispatched. A click dispatched
 * from script does not — the caller is still on the stack, the microtasks
 * wait, and by the time the handler resumes the browser has reset
 * `currentTarget` to null, so the handler throws and nothing is closed. The
 * event therefore carries its target as an own property, which outlives the
 * dispatch.
 * @param {HTMLElement} button
 */
function clickKeepingTarget (button) {
  const { MouseEvent } = button.ownerDocument.defaultView
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'currentTarget', { value: button })
  button.dispatchEvent(event)
}

/**
 * Close a finished card by clicking the system's own Close card button.
 * @param {ChatMessage|undefined} message
 * @param {object} [options]
 * @param {number} [options.bindTimeoutMs]  How long CoC7 gets to bind its handler
 * @param {number} [options.closeTimeoutMs]  How long CoC7 gets to write the closed card back
 * @returns {Promise<boolean>}  false when the system did not close the card; the caller then falls back to closing it itself
 */
export async function closeWithSystemButton (message, { bindTimeoutMs = BIND_TIMEOUT_MS, closeTimeoutMs = CLOSE_TIMEOUT_MS } = {}) {
  if (!message || message.flags?.CoC7?.load?.cardOpen !== true) return false
  const button = await renderBoundCloseButton(message, bindTimeoutMs)
  if (!button) return false
  const closed = cardClosed(message.id, closeTimeoutMs)
  clickKeepingTarget(button)
  return closed
}
