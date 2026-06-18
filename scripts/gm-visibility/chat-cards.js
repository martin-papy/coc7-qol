// scripts/gm-visibility/chat-cards.js

import { isHighlightEnabled, ROOT_CLASS, MARKER_CLASS, READONLY_CLASS } from './settings.js'
import { addBadgeOnce } from './badge.js'

/**
 * Mark GM-only chat-card elements, distinguishing two cases the system treats
 * differently:
 *   - .keeper-only-block      → removed from the player's DOM (HIDDEN). Solid
 *                               crimson + eye-slash badge.
 *   - .keeper-only-control    → disabled for the player but still visible
 *                               (READ-ONLY). Dashed amber + lock badge.
 * Deliberately ignores .owner-and-keeper-block (owners see/use those too).
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function highlightChatCard (message, html) {
  if (!isHighlightEnabled()) return
  try {
    const blocks = html.querySelectorAll('.keeper-only-block')
    const looseControls = html.querySelectorAll('.keeper-only-control')
    if (!blocks.length && !looseControls.length) return

    let marked = false
    blocks.forEach(block => {
      if (block.classList.contains(MARKER_CLASS)) return
      block.classList.add(MARKER_CLASS)
      addBadgeOnce(block, { icon: 'fa-eye-slash', tooltipKey: 'COC7QOL.GmVisibility.BadgeTooltip', position: 'prepend' })
      marked = true
    })

    looseControls.forEach(control => {
      // Controls inside a flagged block are already hidden with the block.
      if (control.closest('.keeper-only-block')) return
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
  } catch (err) {
    console.warn('[coc7-qol] GM-visibility chat highlight failed:', err)
  }
}
