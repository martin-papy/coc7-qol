/**
 * Turns the HTML Foundry stores for rich text (backstory, biography, Keeper notes) into Markdown
 * that is safe in Obsidian. Pure: the only DOM it touches is `deps.doc`, an inert document.
 *
 * Pipeline: parse, sanitize (sanitize.js: secrets first, then everything the converter would copy
 * as raw HTML; code loses its formatting and becomes ordinary text), rewrite Foundry syntax and
 * escape every text node, convert, then finish the Markdown (hard breaks, `[[` escaping, converter
 * comment lines dropped).
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
const LINE_PREFIX = /^((?:\s*>)*\s*(?:(?:[-*+]|\d+\.)\s+)?)(.*)$/
const BREAK_RUN = new RegExp(`\\s*${BREAK}[\\s${BREAK}]*`)
// A converter comment (`<!-- -->`, written after every list), alone on its line or behind quote marks.
const COMMENT_LINE = /^[\s>]*<!--.*-->\s*$/
const QUOTE_ONLY_LINE = /^\s*>[\s>]*$/
// What would be structure at the start of a line, behind any leading whitespace (U+00A0, U+3000
// and the other Unicode spaces included): a heading, quote, list or setext/thematic-break line.
const LINE_START_MARKER = /^(\s*)(#{1,6}(?=\s|$)|[>+\-=])/
const LINE_START_ORDINAL = /^(\s*\d{1,9})([.)])/

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
 * Text as the converter needs it to come out as text. Whitespace runs become one space, as HTML
 * shows them, so no line starts inside a text node. A typed backslash is doubled, so it cannot
 * cancel the converter's own escapes (``\` `` would leave a live backtick). The converter decodes
 * `&lt;`, `&gt;` and `&amp;` once and writes the result as it is, so a literal `<` or entity is
 * escaped one level deeper.
 *
 * Last, every text node is treated as one that may start a line: the text after a `<br>` or an
 * empty element, or the first text of a block. The converter escapes line starts only behind
 * plain spaces, then trims other leading whitespace (a non-breaking space) away, which would
 * leave the marker live; and it writes `\` before the spaces of ` > x`. So the marker is escaped
 * here, behind whatever whitespace precedes it. `*`, `_`, `~` and backticks are left to the
 * converter, which escapes them everywhere.
 */
const escapeMarkup = text => text
  .replace(/[ \t\n\r\f]+/g, ' ')
  .replace(/\\/g, '\\\\')
  .replace(/&(?=(#?\w+);)/g, (match, name) => (/^(lt|gt|amp)$/.test(name) ? '&amp;amp;' : '&amp;'))
  .replace(/</g, '&amp;lt;')
  .replace(LINE_START_MARKER, '$1\\$2')
  .replace(LINE_START_ORDINAL, '$1\\$2')

/** Rewrites Foundry syntax and escapes in text nodes only, so attribute values and markup stay untouched. */
function rewriteTextNodes (node, resolveName) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === TEXT_NODE) child.nodeValue = escapeMarkup(rewriteFoundrySyntax(child.nodeValue, resolveName))
    else if (child.nodeType === ELEMENT_NODE) rewriteTextNodes(child, resolveName)
  }
}

/**
 * A `<br>` becomes a hard break (a backslash at the end of the line), keeping the line's quote or
 * list indent. Every line that follows a break is defused, the first one included when the block
 * starts with a break (the break itself, like one at the end, writes nothing).
 */
function hardBreaks (line) {
  if (!line.includes(BREAK)) return line
  const [, prefix, rest] = line.match(LINE_PREFIX)
  const continuation = prefix.replace(/(?:[-*+]|\d+\.)(?=\s)/, marker => ' '.repeat(marker.length))
  const parts = rest.split(BREAK_RUN).map((part, i) => (i === 0 ? part : defuseLineStart(part)))
  return prefix + parts.filter(part => part !== '').join(`\\\n${continuation}`)
}

/**
 * A line with nothing but quote marks separates two paragraphs of a quote. Once comment lines are
 * gone, one not followed by quoted text would leave an empty quote line (at the end of a quote,
 * or twice in a row): dropped.
 */
function dropDanglingQuoteLines (lines) {
  return lines.filter((line, i) => {
    const next = lines[i + 1]
    return !QUOTE_ONLY_LINE.test(line) || (next !== undefined && /^\s*>/.test(next) && !QUOTE_ONLY_LINE.test(next))
  })
}

/** Converter comments dropped, hard breaks written, `[[` escaped, blank-line runs collapsed. */
function finish (markdown) {
  const lines = markdown.split('\n').filter(line => !COMMENT_LINE.test(line))
  return dropDanglingQuoteLines(lines)
    .map(line => hardBreaks(line).replace(/\[\[/g, '\\[\\[').replace(MARKERS, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
  return finish(deps.htmlToMarkdown(container.innerHTML))
}
