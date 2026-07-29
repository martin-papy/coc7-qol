import { isHighlightEnabled, ROOT_CLASS, MARKER_CLASS, READONLY_CLASS } from './settings.js'
import { addBadgeOnce } from './badge.js'
import { gmOnlyChatRegions } from './chat-rules.js'

// How long a card stays watched for GM-only content the system adds after the render
// hook has already returned. Generous enough to cover an uncached template fetch on a
// cold load, short enough that observers never accumulate.
const LATE_CONTENT_WINDOW_MS = 2000

/**
 * True when the element already sits inside a region we marked, in which case the
 * enclosing highlight already carries the message and a nested one would only add noise.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function insideMarkedRegion (el) {
  return Boolean(el.parentElement?.closest(`.${MARKER_CLASS}`))
}

/**
 * Mark GM-only chat-card elements, distinguishing two cases the system treats
 * differently:
 *   - hidden regions        → removed from the player's DOM, or never built for them
 *                             at all. Solid crimson + eye-slash badge.
 *   - .keeper-only-control  → disabled for the player but still visible (READ-ONLY).
 *                             Dashed amber + lock badge.
 * Deliberately ignores .owner-and-keeper-block (owners see/use those too).
 *
 * Idempotent: every step is guarded on its own marker class so repeated passes over the
 * same card are no-ops. The late-content watcher relies on that.
 * @param {HTMLElement} html
 * @returns {boolean} whether this pass marked anything
 */
function applyChatHighlights (html) {
  // Rule-resolved regions run first: they are the coarsest unit, so marking them lets
  // any .keeper-only-block nested inside be skipped as redundant below.
  const regions = gmOnlyChatRegions(html)
  const blocks = html.querySelectorAll('.keeper-only-block')
  const looseControls = html.querySelectorAll('.keeper-only-control')
  if (!regions.length && !blocks.length && !looseControls.length) return false

  let marked = false
  regions.forEach(region => {
    if (region.classList.contains(MARKER_CLASS)) return
    region.classList.add(MARKER_CLASS)
    addBadgeOnce(region, { icon: 'fa-eye-slash', tooltipKey: 'COC7QOL.GmVisibility.BadgeTooltip', position: 'prepend' })
    marked = true
  })

  blocks.forEach(block => {
    if (block.classList.contains(MARKER_CLASS) || insideMarkedRegion(block)) return
    block.classList.add(MARKER_CLASS)
    addBadgeOnce(block, { icon: 'fa-eye-slash', tooltipKey: 'COC7QOL.GmVisibility.BadgeTooltip', position: 'prepend' })
    marked = true
  })

  looseControls.forEach(control => {
    // Controls inside a flagged region are already hidden with the region.
    if (control.closest('.keeper-only-block') || insideMarkedRegion(control)) return
    if (control.classList.contains(READONLY_CLASS)) return
    control.classList.add(READONLY_CLASS)
    // A lock badge fits inside button controls; sliders (<input>) can't hold
    // children, so they rely on the dashed outline alone.
    if (control.tagName === 'BUTTON') {
      addBadgeOnce(control, { icon: 'fa-lock', tooltipKey: 'COC7QOL.GmVisibility.ReadOnlyTooltip', position: 'append' })
    }
    marked = true
  })

  if (marked) html.classList.add(ROOT_CLASS)
  return marked
}

/**
 * Re-run the highlight pass while the system finishes building the card.
 *
 * Foundry's Hooks.callAll is a synchronous loop that never awaits handlers, but the
 * system's own renderChatMessageHTML handler is async: it awaits
 * CoC7Utilities.canModifyActor() before it even dispatches to a card renderer, and
 * CoC7ChatMessage._onRenderMessage then awaits renderTemplate() before appending the
 * damage/heal buttons. Our pass therefore runs while that DOM does not exist yet, and a
 * single synchronous attempt can only ever see the statically rendered parts of a card.
 *
 * A MutationObserver is used rather than a fixed delay because the number of awaits, and
 * whether the template is already cached, both vary — there is no delay that is correct
 * in every case.
 * @param {HTMLElement} html
 */
function watchForLateContent (html) {
  const observer = new MutationObserver(() => {
    // Observer callbacks run outside the caller's try/catch, so guard here too:
    // an unhandled throw would surface as a bare console error on every mutation.
    try {
      applyChatHighlights(html)
    } catch (err) {
      observer.disconnect()
      console.warn('[coc7-qol] GM-visibility late chat highlight failed:', err)
    }
  })
  observer.observe(html, { childList: true, subtree: true })
  window.setTimeout(() => observer.disconnect(), LATE_CONTENT_WINDOW_MS)
}

/**
 * Highlight the GM-only parts of a rendered chat card.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function highlightChatCard (message, html) {
  if (!isHighlightEnabled()) return
  try {
    applyChatHighlights(html)

    // CoC7 internal coupling: a `load.as` flag is the system's own gate for dispatching a
    // card to an async renderer (coc7/hooks/render-chat-message-html.js), so it marks
    // exactly the cards whose DOM can still grow after this hook returns. Watching only
    // those keeps a full chat-log render from spawning an observer per message.
    if (typeof message?.flags?.CoC7?.load?.as !== 'undefined') watchForLateContent(html)
  } catch (err) {
    console.warn('[coc7-qol] GM-visibility chat highlight failed:', err)
  }
}
