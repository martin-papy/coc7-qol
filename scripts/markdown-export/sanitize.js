/**
 * The sanitizing pass of the rich-text pipeline (see rich-text.js). It rewrites a parsed fragment
 * so that every element left in it is one the converter turns into Markdown: anything else is
 * removed or unwrapped to its text, so "no raw HTML in the note" holds by construction.
 * Pure: it only touches the nodes it is given, and creates nodes through their own document.
 */

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const COMMENT_NODE = 8

/** Stands for a `<br>` until the Markdown is written (see rich-text.js). */
export const BREAK = '\uE000'
/**
 * The pipeline's markers are private-use characters. User text, attribute values and resolved
 * names lose the whole private-use area up front, so no marker can be forged.
 */
export const MARKERS = /[\uE000-\uF8FF]/g

/** Removed with their content: executable, embedded, or raw-text elements. */
const DROPPED = 'script, style, iframe, object, embed, template, noscript, video, audio, canvas, svg, math, ' +
  'xmp, plaintext, textarea, noembed, noframes, title, meta, link, base, frame, frameset, applet, param, source, track, area'

/** Elements the converter writes as Markdown. Every other element is unwrapped. */
const FLOW_KEPT = new Set(['blockquote', 'li', 'ul', 'ol'])
const BLOCK_KEPT = new Set([...FLOW_KEPT, 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'])
const INLINE_KEPT = new Set(['a', 'img', 'strong', 'b', 'em', 'i', 'del', 'code', 'br'])
/** Unwrapped in place, with nothing around their text. Any other unwrapped element is a block. */
const INLINE_UNWRAPPED = new Set([
  'span', 'u', 's', 'strike', 'sup', 'sub', 'font', 'mark', 'small', 'big', 'tt', 'abbr', 'acronym', 'cite', 'kbd', 'ins',
  'q', 'time', 'var', 'samp', 'dfn', 'label', 'bdi', 'bdo', 'data', 'ruby', 'rb', 'rt', 'rp', 'wbr', 'nobr', 'picture',
  'input', 'button', 'select', 'option', 'optgroup', 'output', 'meter', 'progress', 'slot'
])
const KEPT_ATTRIBUTES = { a: ['href'], img: ['src', 'alt'], ol: ['start'] }
const LINK_SCHEMES = new Set(['http', 'https', 'mailto'])
const IMAGE_SCHEMES = new Set(['http', 'https'])
const HEADING_SHIFT = 3
const MAX_HEADING = 6
const MAX_COLSPAN = 20

const tagOf = node => node.localName
const isElement = node => node.nodeType === ELEMENT_NODE
const isKept = el => (tagOf(el) === 'li' ? ['ul', 'ol'].includes(el.parentElement?.localName) : BLOCK_KEPT.has(tagOf(el)) || INLINE_KEPT.has(tagOf(el)))
const isInlineNode = node => node.nodeType === TEXT_NODE || (isElement(node) && (INLINE_KEPT.has(tagOf(node)) || INLINE_UNWRAPPED.has(tagOf(node))))
const hasContent = node => node.textContent.replace(MARKERS, '').trim() !== '' || tagOf(node) === 'img' || !!node.querySelector?.('img')
const reversed = (root, selector) => [...root.querySelectorAll(selector)].reverse()

/** Every descendant node of one type, collected first so the caller may change the tree. */
function nodesOfType (root, type, found = []) {
  for (const child of root.childNodes) {
    if (child.nodeType === type) found.push(child)
    if (isElement(child)) nodesOfType(child, type, found)
  }
  return found
}

function unwrap (el) {
  el.replaceWith(...el.childNodes)
}

/** Unwrap with a space on each side, so two blocks' words do not run together. */
function unwrapSpaced (el) {
  const doc = el.ownerDocument
  el.replaceWith(doc.createTextNode(' '), ...el.childNodes, doc.createTextNode(' '))
}

function rename (el, tag) {
  const renamed = el.ownerDocument.createElement(tag)
  renamed.append(...el.childNodes)
  el.replaceWith(renamed)
  return renamed
}

/** The scheme of a URL as a browser reads it (leading controls and spaces ignored), or ''. */
function schemeOf (url) {
  // eslint-disable-next-line no-control-regex
  const cleaned = url.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+/, '')
  return cleaned.match(/^([a-z][a-z\d+.-]*):/i)?.[1].toLowerCase() ?? ''
}

/** A URL that fits between the `<` and `>` of a Markdown link destination. */
const destination = url => url.trim().replace(/[\s<>]/g, encodeURIComponent)

function sanitizeLinks (container) {
  for (const a of reversed(container, 'a')) {
    const href = a.getAttribute('href')
    if (href !== null && LINK_SCHEMES.has(schemeOf(href))) a.setAttribute('href', destination(href))
    else unwrap(a)
  }
}

function sanitizeImages (container) {
  for (const img of container.querySelectorAll('img')) {
    const src = img.getAttribute('src')
    const alt = (img.getAttribute('alt') ?? '').replace(/\s+/g, ' ').trim()
    if (src !== null && IMAGE_SCHEMES.has(schemeOf(src))) {
      img.setAttribute('src', destination(src))
      img.setAttribute('alt', alt.replace(/[\\[\]]/g, '\\$&').replace(/</g, '&lt;'))
    } else {
      img.replaceWith(img.ownerDocument.createTextNode(alt))
    }
  }
}

/** The note's own headings go down to `###`, so rich-text headings start below them. */
function demoteHeadings (container) {
  for (const heading of container.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const level = Math.min(Number(tagOf(heading)[1]) + HEADING_SHIFT, MAX_HEADING)
    rename(heading, `h${level}`)
  }
}

/** A code block holds plain text only, in one `<code>`, as the converter expects. */
function normalizeCodeBlocks (container) {
  for (const pre of reversed(container, 'pre')) {
    pre.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
    const code = pre.ownerDocument.createElement('code')
    code.textContent = pre.textContent.replace(/\u00a0/g, ' ')
    // A block cannot sit in a heading, a cell or bold text, even through a quote or a list: there it is inline code.
    if (onlyFlowAbove(pre, container)) pre.replaceChildren(code)
    else pre.replaceWith(code)
  }
}

/** A table cell can only hold inline content: blocks are unwrapped, line breaks become spaces. */
function flattenCells (container) {
  for (const cell of reversed(container, 'td, th')) {
    for (const el of reversed(cell, '*')) {
      if (tagOf(el) === 'br') el.replaceWith(' ')
      else if (INLINE_UNWRAPPED.has(tagOf(el))) unwrap(el)
      else if (!INLINE_KEPT.has(tagOf(el))) unwrapSpaced(el)
    }
  }
}

/** The cells of a row, a `colspan` cell followed by empty ones so the columns line up. */
function rowCells (row) {
  return [...row.children].filter(cell => ['td', 'th'].includes(tagOf(cell))).flatMap(cell => {
    const span = Math.min(Math.max(Number.parseInt(cell.getAttribute('colspan'), 10) || 1, 1), MAX_COLSPAN)
    return [cell, ...Array.from({ length: span - 1 }, () => null)]
  })
}

function buildRow (doc, cells, width, tag) {
  const tr = doc.createElement('tr')
  for (let i = 0; i < width; i++) {
    const cell = doc.createElement(tag)
    if (cells[i]) cell.append(...cells[i].childNodes)
    tr.append(cell)
  }
  return tr
}

/** Rebuild a table as the converter reads one: one header row of `th`, then body rows of `td`. */
function restructureTable (table) {
  const doc = table.ownerDocument
  table.querySelectorAll(':scope > caption').forEach(caption => table.before(rename(caption, 'div')))
  const rows = [...table.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr')].map(rowCells)
  const width = Math.max(0, ...rows.map(cells => cells.length))
  if (width === 0) return table.remove()
  const thead = doc.createElement('thead')
  thead.append(buildRow(doc, rows[0], width, 'th'))
  const tbody = doc.createElement('tbody')
  tbody.append(...rows.slice(1).map(cells => buildRow(doc, cells, width, 'td')))
  table.replaceChildren(thead, tbody)
}

function replaceBreaks (container) {
  container.querySelectorAll('h1 br, h2 br, h3 br, h4 br, h5 br, h6 br').forEach(br => br.replaceWith(' '))
  container.querySelectorAll('br').forEach(br => br.replaceWith(BREAK))
}

/** Wrap each run of matching nodes in a new element; drop runs with nothing to show. */
function wrapRuns (parent, inRun, wrapperTag) {
  let run = []
  const flush = () => {
    if (run.some(hasContent)) {
      const wrapper = parent.ownerDocument.createElement(wrapperTag)
      run[0].before(wrapper)
      wrapper.append(...run)
    } else {
      run.forEach(node => node.remove())
    }
    run = []
  }
  for (const node of [...parent.childNodes]) {
    if (inRun(node)) run.push(node)
    else flush()
  }
  flush()
}

const wrapInlineRuns = parent => wrapRuns(parent, isInlineNode, 'p')

/** True when the nearest kept ancestor holds blocks (paragraphs, list items) rather than text. */
function inFlow (el, container) {
  for (let node = el.parentElement; node && node !== container; node = node.parentElement) {
    if (isKept(node)) return FLOW_KEPT.has(tagOf(node))
  }
  return true
}

/**
 * True when every kept ancestor holds blocks (quotes, lists). Unlike inFlow it looks past the
 * nearest one: a quote inside a heading still writes the heading's marks on the quote's lines.
 */
function onlyFlowAbove (el, container) {
  for (let node = el.parentElement; node && node !== container; node = node.parentElement) {
    if (isKept(node) && !FLOW_KEPT.has(tagOf(node))) return false
  }
  return true
}

/** Unwrap every element the converter would copy as raw HTML, deepest first. */
function unwrapUnconverted (container) {
  for (const el of reversed(container, '*')) {
    if (isKept(el)) continue
    if (INLINE_UNWRAPPED.has(tagOf(el))) {
      unwrap(el)
    } else if (inFlow(el, container)) {
      wrapInlineRuns(el)
      unwrap(el)
    } else {
      unwrapSpaced(el)
    }
  }
}

/** Loose inline content next to blocks would run into them: give it a paragraph of its own. */
function wrapLooseContent (container) {
  wrapInlineRuns(container)
  container.querySelectorAll('blockquote').forEach(quote => wrapInlineRuns(quote))
  container.querySelectorAll('ul, ol').forEach(list => wrapRuns(list, node => !(isElement(node) && tagOf(node) === 'li'), 'li'))
  for (const li of container.querySelectorAll('li')) {
    if ([...li.children].some(child => !isInlineNode(child))) wrapInlineRuns(li)
  }
}

function stripAttributes (container) {
  for (const el of container.querySelectorAll('*')) {
    const kept = KEPT_ATTRIBUTES[tagOf(el)] ?? []
    for (const name of el.getAttributeNames()) {
      if (!kept.includes(name)) el.removeAttribute(name)
    }
  }
}

function removeNoise (container) {
  container.querySelectorAll(DROPPED).forEach(el => el.remove())
  nodesOfType(container, COMMENT_NODE).forEach(comment => comment.remove())
  for (const text of nodesOfType(container, TEXT_NODE)) text.nodeValue = text.nodeValue.replace(MARKERS, '')
  for (const el of container.querySelectorAll('*')) {
    for (const attribute of [...el.attributes]) attribute.value = attribute.value.replace(MARKERS, '')
  }
}

/**
 * @param {HTMLElement} container parsed rich text, in an inert document
 * @param {boolean} isGM false removes every unrevealed secret block, before anything else runs
 */
export function sanitize (container, isGM) {
  if (!isGM) container.querySelectorAll('section.secret:not(.revealed)').forEach(el => el.remove())
  removeNoise(container)
  container.querySelectorAll('s, strike').forEach(el => rename(el, 'del'))
  sanitizeLinks(container)
  sanitizeImages(container)
  demoteHeadings(container)
  normalizeCodeBlocks(container)
  flattenCells(container)
  container.querySelectorAll('table').forEach(restructureTable)
  replaceBreaks(container)
  unwrapUnconverted(container)
  wrapLooseContent(container)
  stripAttributes(container)
}
