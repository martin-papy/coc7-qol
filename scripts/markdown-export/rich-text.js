/**
 * Turns the HTML Foundry stores for rich text (backstory, biography, Keeper notes) into Markdown
 * that is safe in Obsidian. Pure: the only DOM it touches is `deps.doc`, an inert document.
 */

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const DOCUMENT_LINK = /@([\w.]+)\[([^\]]*)\](?:\{([^}]*)\})?/g
const INLINE_ROLL = /\[\[(.*?)\]\](?:\{([^}]*)\})?/g
const HAS_TAG = /<[a-z!/]/i

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
      if (type.includes('.')) return match // a system enricher such as @coc7.check, left as it is
      return (type === 'UUID' && resolveName(target)) || ''
    })
    .replace(INLINE_ROLL, (match, formula, label) => rollText(formula, label))
}

/** Rewrites Foundry syntax in text nodes only, so attribute values and markup stay untouched. */
function rewriteTextNodes (node, resolveName) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === TEXT_NODE) child.nodeValue = escapeMarkup(rewriteFoundrySyntax(child.nodeValue, resolveName))
    else if (child.nodeType === ELEMENT_NODE) rewriteTextNodes(child, resolveName)
  }
}

/**
 * The converter decodes `&lt;`, `&gt;` and `&amp;` in text once and writes the result as it is, so
 * a literal `<` or entity has to be escaped one level deeper to arrive in the note still escaped.
 */
const escapeMarkup = text => text
  .replace(/&(?=(#?\w+);)/g, (match, name) => (/^(lt|gt|amp)$/.test(name) ? '&amp;amp;' : '&amp;'))
  .replace(/</g, '&amp;lt;')

/** Elements the converter would copy into the note as raw HTML. */
const DROPPED = 'script, style, iframe, object, embed, template, noscript, video, audio, canvas, svg'
const UNWRAPPED = 'section, div, span, u, sup, sub, font, mark, small, abbr, cite, kbd, ins'

function unwrap (el) {
  el.replaceWith(...el.childNodes)
}

function sanitize (container, isGM) {
  container.querySelectorAll(DROPPED).forEach(el => el.remove())
  if (!isGM) container.querySelectorAll('section.secret:not(.revealed)').forEach(el => el.remove())
  for (const el of container.querySelectorAll('*')) {
    for (const name of el.getAttributeNames()) {
      if (name.toLowerCase().startsWith('on')) el.removeAttribute(name)
    }
  }
  container.querySelectorAll('s, strike').forEach(el => {
    const del = el.ownerDocument.createElement('del')
    del.append(...el.childNodes)
    el.replaceWith(del)
  })
  container.querySelectorAll('br').forEach(el => el.replaceWith(el.ownerDocument.createTextNode(' ')))
  container.querySelectorAll(UNWRAPPED).forEach(unwrap)
}

const hasVisibleText = container => container.textContent.replace(/\s/g, '') !== ''

function tidy (markdown) {
  return markdown
    .split('\n')
    .filter(line => !/^\s*<!--.*-->\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/\[\[/g, '\\[\\[')
}

/**
 * @param {string} html
 * @param {{isGM: boolean, doc: Document, htmlToMarkdown: (html: string) => string,
 *   resolveName: (uuid: string) => (string | undefined)}} deps
 * @returns {string} Markdown, or '' when there is no visible text
 */
export function richTextToMarkdown (html, deps) {
  if (typeof html !== 'string' || !html.trim()) return ''
  const container = deps.doc.createElement('div')
  container.innerHTML = HAS_TAG.test(html) ? html : wrapPlainText(html)
  sanitize(container, deps.isGM)
  rewriteTextNodes(container, deps.resolveName)
  if (!hasVisibleText(container)) return ''
  return tidy(deps.htmlToMarkdown(container.innerHTML))
}
