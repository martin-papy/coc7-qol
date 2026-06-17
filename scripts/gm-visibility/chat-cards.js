// scripts/gm-visibility/chat-cards.js

import { isHighlightEnabled, ROOT_CLASS, MARKER_CLASS } from './settings.js'
import { addBadgeOnce } from './badge.js'

/**
 * Mark GM-only regions and standalone controls on a rendered chat card.
 * Targets the system's stable .keeper-only-block / .keeper-only-control markers.
 * Deliberately ignores .owner-and-keeper-block (owners see those too).
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function highlightChatCard (message, html) {
  if (!isHighlightEnabled()) return
  try {
    const blocks = html.querySelectorAll('.keeper-only-block')
    const looseControls = html.querySelectorAll('.keeper-only-control')
    if (!blocks.length && !looseControls.length) return

    html.classList.add(ROOT_CLASS)

    blocks.forEach(block => {
      if (block.classList.contains(MARKER_CLASS)) return
      block.classList.add(MARKER_CLASS)
      addBadgeOnce(block, 'prepend')
    })

    looseControls.forEach(control => {
      // Controls inside a flagged block are already covered by the block styling.
      if (control.closest('.keeper-only-block')) return
      control.classList.add(MARKER_CLASS)
    })
  } catch (err) {
    console.warn('[coc7-qol] GM-visibility chat highlight failed:', err)
  }
}
