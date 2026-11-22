/**
 * Turns the HTML Foundry stores for rich text (backstory, biography, Keeper notes) into Markdown
 * that is safe in Obsidian. Pure: the only DOM it touches is `deps.doc`, an inert document.
 *
 * Pipeline: parse, sanitize (sanitize.js: secrets first, then everything the converter would copy
 * as raw HTML), rewrite Foundry syntax in text, set inline code aside, convert, then finish the
 * Markdown (hard breaks, `[[` escaping outside code, inline code put back).
 */
import { sanitize, BREAK, MARKERS } from './sanitize.js'
import { defuseLineStart } from './format.js'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
// Broader than Foundry's own list on purpose: any `@Name[target]{label}`, CoC7's dotted and
// hyphenated enrichers (`@coc7.check`, `@coc-actor`) included.
const DOCUMENT_LINK = /@([\w.-]+)\[([^\]]*)\](?:\{([^}]*)\})?/g
const INLINE_ROLL = /\[\[(.*?)\]\](?:\{([^}]*)\})?/g
const HAS_TAG = /<[a-z!/]/i
// Code waits as a token while converting: inline code as `\uE001<n>\uE002`, a code block as a
// paragraph `\uE003<n>\uE004`. sanitize strips the private-use area from user text, so none is forged.
const CODE_TOKEN = /\uE001(\d+)\uE002/g
const BLOCK_TOKEN = /\uE003(\d+)\uE004/
const LINE_PREFIX = /^((?:\s*>)*\s*(?:(?:[-*+]|\d+\.)\s+)?)(.*)$/
const BREAK_RUN = new RegExp(`\\s*${BREAK}[\\s${BREAK}]*`)

const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain text becomes one paragraph per non-empty line. */
function wrapPlainText (text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => `<p>${escapeHtml(line)}</p>`).join('')
}

function rollText (formula, label) {
  if (label) return label
  return formula.replace(/^\s*\/\w+\s*/, '').replace(/\s+#.*$/, '').trim()
}

function rewriteFoundrySyntax (text, resolveName) {
  return text
    .replace(DOCUMENT_LINK, (match, type, target, label) => {
      if (label) return label
      if (/[.-]/.test(type)) return match // a system enricher such as @coc7.check, left as it is
      return (type === 'UUID' && resolveName(target)?.replace(MARKERS, '')) || ''
    })
    .replace(INLINE_ROLL, (match, formula, label) => rollText(formula, label))
}

/**
 * The converter decodes `&lt;`, `&gt;` and `&amp;` in text once and writes the result as it is, so
 * a literal `<` or entity has to be escaped one level deeper to arrive in the note still escaped.
 */
const escapeMarkup = text => text
  .replace(/&(?=(#?\w+);)/g, (match, name) => (/^(lt|gt|amp)$/.test(name) ? '&amp;amp;' : '&amp;'))
  .replace(/</g, '&amp;lt;')

/** Rewrites Foundry syntax in text nodes only, so attribute values, markup and code stay untouched. */
function rewriteTextNodes (node, resolveName) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === TEXT_NODE) child.nodeValue = escapeMarkup(rewriteFoundrySyntax(child.nodeValue, resolveName))
    else if (child.nodeType === ELEMENT_NODE && !['code', 'pre'].includes(child.localName)) rewriteTextNodes(child, resolveName)
  }
}

/**
 * The converter writes inline code from its HTML source (`&lt;` for `<`), which a code span shows
 * as typed, and always fences a code block with three backticks, which a backtick line inside
 * closes. So all code is set aside as tokens and written back afterwards from its exact text.
 */
function setCodeAside (container) {
  const codes = { inline: [], blocks: [] }
  for (const pre of container.querySelectorAll('pre')) {
    if (pre.textContent.trim() === '') {
      pre.remove()
      continue
    }
    const index = codes.blocks.push(pre.textContent.replace(/\n$/, '')) - 1
    const holder = container.ownerDocument.createElement('p')
    holder.textContent = `\uE003${index}\uE004`
    pre.replaceWith(holder)
  }
  for (const code of container.querySelectorAll('code')) {
    const text = code.textContent.replace(/\s+/g, ' ')
    if (text.trim() === '') {
      code.replaceWith(text)
      continue
    }
    const index = codes.inline.push({ text, inCell: code.closest('td, th') !== null }) - 1
    code.replaceWith(`\uE001${index}\uE002`)
  }
  return codes
}

/** A delimiter longer than the longest run of `mark` in the text, and at least `min` long. */
function delimiter (text, mark, min) {
  const longest = Math.max(0, ...(text.match(new RegExp(`${mark}+`, 'g')) ?? []).map(run => run.length))
  return mark.repeat(Math.max(min, longest + 1))
}

function codeSpan ({ text, inCell }) {
  const content = inCell ? text.replace(/\|/g, '\\|') : text
  const fence = delimiter(content, '`', 1)
  const pad = /^`|`$/.test(content) ? ' ' : ''
  return `${fence}${pad}${content}${pad}${fence}`
}

/** A fenced block, every line carrying the prefix (quote marks, list indent) of the line it replaces. */
function codeBlock (line, text) {
  const prefix = line.slice(0, line.search(BLOCK_TOKEN))
  const continuation = prefix.replace(/(?:[-*+]|\d+\.)(?=\s)/, marker => ' '.repeat(marker.length))
  const fence = delimiter(text, '`', 3)
  return [`${prefix}${fence}`, ...[...text.split('\n'), fence].map(part => `${continuation}${part}`)].join('\n')
}

/** A `<br>` becomes a hard break (a backslash at the end of the line), keeping the line's quote or list indent. */
function hardBreaks (line) {
  if (!line.includes(BREAK)) return line
  const [, prefix, rest] = line.match(LINE_PREFIX)
  const continuation = prefix.replace(/(?:[-*+]|\d+\.)(?=\s)/, marker => ' '.repeat(marker.length))
  const parts = rest.split(BREAK_RUN).filter(part => part !== '')
  return prefix + parts.map((part, i) => (i === 0 ? part : defuseLineStart(part))).join(`\\\n${continuation}`)
}

/** Hard breaks, then `[[` escaped, then inline code put back as it was typed. */
function finishLine (line, inline) {
  return hardBreaks(line)
    .replace(/\[\[/g, '\\[\\[')
    .replace(CODE_TOKEN, (match, index) => (inline[index] ? codeSpan(inline[index]) : ''))
}

/** Code blocks go back in last, after blank-line runs are collapsed, so their own lines stay exact. */
function finish (markdown, codes) {
  return markdown
    .split('\n')
    .filter(line => !/^\s*<!--.*-->\s*$/.test(line))
    .map(line => finishLine(line, codes.inline))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split('\n')
    .map(line => {
      const block = line.match(BLOCK_TOKEN)
      return block ? codeBlock(line, codes.blocks[block[1]] ?? '') : line.replace(MARKERS, '')
    })
    .join('\n')
}

const hasVisibleContent = container =>
  container.textContent.replace(MARKERS, '').replace(/\s/g, '') !== '' || container.querySelector('img') !== null

/**
 * @param {string} html
 * @param {{isGM: boolean, doc: Document, htmlToMarkdown: (html: string) => string,
 *   resolveName: (uuid: string) => (string | undefined)}} deps
 * @returns {string} Markdown, or '' when there is nothing to show
 */
export function richTextToMarkdown (html, deps) {
  if (typeof html !== 'string' || !html.trim()) return ''
  const container = deps.doc.createElement('div')
  container.innerHTML = HAS_TAG.test(html) ? html : wrapPlainText(html)
  sanitize(container, deps.isGM)
  rewriteTextNodes(container, deps.resolveName)
  if (!hasVisibleContent(container)) return ''
  const codes = setCodeAside(container)
  return finish(deps.htmlToMarkdown(container.innerHTML), codes)
}
