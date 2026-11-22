import { t } from '../utils.js'
import { LOG_PREFIX } from '../constants.js'
import { LABEL_KEYS } from './labels.js'
import { fileNameFor } from './format.js'
import { richTextToMarkdown } from './rich-text.js'
import { collectSheetData } from './collect.js'
import { renderNote } from './render.js'

const EXPORT_ACTION = 'coc7qol-export-markdown'
const SYSTEM_ID = 'CoC7'

/** Local date as YYYY-MM-DD (toISOString would give the UTC date). */
function localDate (now = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Name of a UUID's document, or undefined: fromUuidSync throws for some compendium UUIDs. */
function resolveName (uuid) {
  try {
    return fromUuidSync(uuid)?.name
  } catch (_) {
    return undefined
  }
}

/**
 * Write the investigator as an Obsidian note and offer it as a download.
 * @param {Actor} actor
 * @returns {void}
 */
function exportActor (actor) {
  try {
    // Read once: the Keeper rule must be the same for the sheet data and the rich text.
    const isGM = game.user.isGM
    const data = collectSheetData(actor, {
      isGM,
      oneBlockBackstory: game.settings.get(SYSTEM_ID, 'oneBlockBackstory'),
      displayPlayerName: game.settings.get(SYSTEM_ID, 'displayPlayerNameOnSheet'),
      locale: game.i18n.lang
    })
    // HTML is only ever parsed in this inert document, never in the live one.
    const doc = document.implementation.createHTMLDocument('')
    const converter = new window.showdown.Converter()
    const htmlToMarkdown = html => converter.makeMarkdown(html, doc)
    const labels = Object.fromEntries(Object.entries(LABEL_KEYS).map(([key, i18nKey]) => [key, t(i18nKey)]))
    const note = renderNote(data, {
      labels,
      today: localDate(),
      richText: html => richTextToMarkdown(html, { isGM, doc, htmlToMarkdown, resolveName })
    })
    foundry.utils.saveDataToFile(note, 'text/markdown', fileNameFor(actor.name))
  } catch (err) {
    console.error(LOG_PREFIX, 'Exporting the investigator to Markdown failed:', err)
    // Passing `format` makes Foundry escape the values: an actor name is user-written text.
    ui.notifications.error('COC7QOL.MarkdownExport.Failed', { format: { name: actor.name, error: err.message } })
  }
}

Hooks.on('getHeaderControlsActorSheetV2', (app, controls) => {
  const actor = app.document
  if (actor?.type !== 'character' || !actor.isOwner) return
  controls.push({
    action: EXPORT_ACTION,
    icon: 'fa-solid fa-file-export',
    label: 'COC7QOL.MarkdownExport.Button',
    onClick: () => exportActor(actor)
  })
})
