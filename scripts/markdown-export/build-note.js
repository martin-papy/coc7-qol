/**
 * Builds the whole Markdown note for an investigator: sheet data, rich text and rendering.
 * Pure: everything Foundry-side (user, settings, converter, inert document) arrives in `deps`,
 * so the Keeper rule can be tested end to end. index.js only reads those and downloads the note.
 */
import { collectSheetData } from './collect.js'
import { richTextToMarkdown } from './rich-text.js'
import { renderNote } from './render.js'

/**
 * @typedef {object} BuildDeps
 * @property {boolean} isGM the one Keeper switch, for the sheet data and the rich text alike
 * @property {boolean} oneBlockBackstory the CoC7 setting: one backstory block, or biography sections
 * @property {boolean} displayPlayerName the CoC7 setting: fall back to the owner's name for the player
 * @property {string} locale sort order for skills
 * @property {Document} doc inert document, the only place HTML is parsed
 * @property {(html: string) => string} htmlToMarkdown the HTML to Markdown converter
 * @property {(uuid: string) => (string | undefined)} resolveName name of a linked document
 * @property {Record<string, string>} labels localized headings and labels
 * @property {string} today local date, YYYY-MM-DD
 */

/**
 * @param {object} actor a CoC7 character actor
 * @param {BuildDeps} deps
 * @returns {string} the note
 */
export function buildNote (actor, deps) {
  const { isGM, doc, htmlToMarkdown, resolveName } = deps
  const data = collectSheetData(actor, {
    isGM,
    oneBlockBackstory: deps.oneBlockBackstory,
    displayPlayerName: deps.displayPlayerName,
    locale: deps.locale
  })
  return renderNote(data, {
    labels: deps.labels,
    today: deps.today,
    richText: html => richTextToMarkdown(html, { isGM, doc, htmlToMarkdown, resolveName })
  })
}
