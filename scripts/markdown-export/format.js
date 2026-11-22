/**
 * Text helpers for the Markdown export. Pure: no Foundry globals, no DOM.
 */

export const FALLBACK_FILE_NAME = 'investigator.md'

const FILE_NAME_FORBIDDEN = /[\\/:*?"<>|#^[\]]/g

const toText = (value) => (value === null || value === undefined) ? '' : String(value)

// C0 and C1 control characters, except the whitespace ones (tab to carriage return) flatten turns into spaces.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g
const LEADING_MARKER = /^[#>*+\-=_~`]/
const LEADING_ORDINAL = /^(\d+)([.)])/

/** Drop control characters, then collapse every run of whitespace (line breaks included) to a single space. */
const flatten = (value) => toText(value).replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim()

/** Keep `<` from opening a tag and an entity from being decoded; a plain `&` stays as it is. */
const escapeMarkup = (text) => text.replace(/&(?=#?\w+;)/g, '&amp;').replaceAll('<', '&lt;')

/** Break `[[` so the text never becomes an Obsidian wikilink. */
const defuseWikilinks = (text) => text.replaceAll('[[', '\\[\\[')

/** A double-quoted YAML scalar on a single line. */
export function yamlString (value) {
  const escaped = flatten(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  return `"${escaped}"`
}

/** Text safe inside a Markdown table cell. */
export function tableCell (value) {
  return escapeMarkup(defuseWikilinks(flatten(value))).replaceAll('|', '\\|')
}

/** Text safe in a heading or list item. */
export function inlineText (value) {
  return escapeMarkup(defuseWikilinks(flatten(value)))
}

/**
 * Backslash-escape a marker at the start of a Markdown line that would make it a heading, quote,
 * list item, thematic break or code fence. The rest of the line is left as it is.
 */
export function defuseLineStart (line) {
  return line.replace(LEADING_MARKER, '\\$&').replace(LEADING_ORDINAL, '$1\\$2')
}

/** Plain text that starts a paragraph of its own (assets details, notes). */
export function plainLine (value) {
  return defuseLineStart(inlineText(value))
}

/** The download file name for an investigator. */
export function fileNameFor (name) {
  const base = flatten(toText(name).replace(FILE_NAME_FORBIDDEN, ''))
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
  return base ? `${base}.md` : FALLBACK_FILE_NAME
}
