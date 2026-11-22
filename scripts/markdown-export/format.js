/**
 * Text helpers for the Markdown export. Pure: no Foundry globals, no DOM.
 */

export const FALLBACK_FILE_NAME = 'investigator.md'

const FILE_NAME_FORBIDDEN = /[\\/:*?"<>|#^[\]]/g

const toText = (value) => (value === null || value === undefined) ? '' : String(value)

/** Collapse every run of whitespace (line breaks included) to a single space. */
const flatten = (value) => toText(value).replace(/\s+/g, ' ').trim()

/** Break `[[` so the text never becomes an Obsidian wikilink. */
const defuseWikilinks = (text) => text.replaceAll('[[', '\\[\\[')

/** A double-quoted YAML scalar on a single line. */
export function yamlString (value) {
  const escaped = flatten(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  return `"${escaped}"`
}

/** Text safe inside a Markdown table cell. */
export function tableCell (value) {
  return defuseWikilinks(flatten(value)).replaceAll('|', '\\|')
}

/** Text safe in a heading or list item. */
export function inlineText (value) {
  return defuseWikilinks(flatten(value))
}

/** The download file name for an investigator. */
export function fileNameFor (name) {
  const base = flatten(toText(name).replace(FILE_NAME_FORBIDDEN, ''))
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
  return base ? `${base}.md` : FALLBACK_FILE_NAME
}
