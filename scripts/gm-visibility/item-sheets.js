// scripts/gm-visibility/item-sheets.js

import { isHighlightEnabled, ROOT_CLASS, MARKER_CLASS } from './settings.js'
import { gmOnlyTabKeys } from './tab-rules.js'
import { addBadgeOnce } from './badge.js'

/**
 * Mark GM-only tabs (nav button + panel) on a rendered item sheet.
 * @param {ItemSheetV2} application
 * @param {HTMLElement} element
 */
export function highlightItemSheet (application, element) {
  if (!isHighlightEnabled()) return
  try {
    const keys = gmOnlyTabKeys(application.document)
    if (!keys.length) return

    let marked = false
    keys.forEach(key => {
      const nav = element.querySelector(`nav.sheet-tabs a[data-tab="${key}"]`)
      if (nav && !nav.classList.contains(MARKER_CLASS)) {
        nav.classList.add(MARKER_CLASS)
        // Tab labels render inside a <span>; fall back to the <a> if a theme omits it.
        addBadgeOnce(nav.querySelector('span') ?? nav, 'append')
        marked = true
      }
      const panel = element.querySelector(`section.tab[data-tab="${key}"]`)
      if (panel && !panel.classList.contains(MARKER_CLASS)) {
        panel.classList.add(MARKER_CLASS)
        marked = true
      }
    })

    // No ROOT_CLASS removal needed: renderItemSheetV2 hands a freshly rebuilt element each render.
    if (marked) element.classList.add(ROOT_CLASS)
  } catch (err) {
    console.warn('[coc7-qol] GM-visibility item-sheet highlight failed:', err)
  }
}
