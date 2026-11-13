import { markStrongSkills } from './highlight.js'
import { registerSkillHighlightSettings, activeThreshold } from './settings.js'

/**
 * Mark the strong skills on one actor sheet.
 * @param {ActorSheetV2} app
 * @param {HTMLElement} element
 */
function markSheet (app, element) {
  const actor = app.document
  if (!element || !actor?.items) return
  const values = new Map(actor.items.filter(item => item.type === 'skill').map(item => [item.uuid, item.system.value]))
  markStrongSkills(element, { threshold: activeThreshold(), valueFor: uuid => values.get(uuid) })
}

/** Re-mark every open actor sheet after a setting changed. */
function refreshOpenSheets () {
  for (const app of foundry.applications.instances.values()) {
    if (app.document?.documentName === 'Actor' && app.element) markSheet(app, app.element)
  }
}

Hooks.once('init', () => registerSkillHighlightSettings(refreshOpenSheets))

// No sheet-class filter: the row selector scopes it, so this is a no-op on container and vehicle sheets.
Hooks.on('renderActorSheetV2', markSheet)
