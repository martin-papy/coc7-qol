import { isHighlightEnabled, ROOT_CLASS, MARKER_CLASS } from './settings.js'
import { gmOnlyTabKeys } from './tab-rules.js'

/**
 * Mark GM-only tabs (nav button + panel) on a rendered item or actor sheet.
 * Document-type-agnostic: the GM-only tab keys come from the tab-rules registry,
 * keyed by document type, so the same routine serves renderItemSheetV2 and
 * renderActorSheetV2.
 * @param {DocumentSheetV2} application
 * @param {HTMLElement} element
 */
export function highlightSheetTabs (application, element) {
  if (!isHighlightEnabled()) return
  try {
    const keys = gmOnlyTabKeys(application.document)
    if (!keys.length) return

    let marked = false
    keys.forEach(key => {
      const nav = element.querySelector(`nav.sheet-tabs a[data-tab="${key}"]`)
      if (nav && !nav.classList.contains(MARKER_CLASS)) {
        // The crimson tab label is the only cue here — no badge (kept for chat cards,
        // whose GM-only blocks have no inherent label).
        nav.classList.add(MARKER_CLASS)
        marked = true
      }
      const panel = element.querySelector(`section.tab[data-tab="${key}"]`)
      if (panel && !panel.classList.contains(MARKER_CLASS)) {
        panel.classList.add(MARKER_CLASS)
        marked = true
      }
    })

    // No ROOT_CLASS removal needed: the render hooks hand a freshly rebuilt element each render.
    if (marked) element.classList.add(ROOT_CLASS)
  } catch (err) {
    console.warn('[coc7-qol] GM-visibility sheet-tab highlight failed:', err)
  }
}
