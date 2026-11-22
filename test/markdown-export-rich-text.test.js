import { test } from 'node:test'
import assert from 'node:assert/strict'
import showdown from 'showdown'
import { JSDOM } from 'jsdom'
import { richTextToMarkdown } from '../scripts/markdown-export/rich-text.js'

const doc = new JSDOM('').window.document
const converter = new showdown.Converter()
const deps = (overrides = {}) => ({
  isGM: false,
  doc,
  htmlToMarkdown: html => converter.makeMarkdown(html, doc),
  resolveName: () => undefined,
  ...overrides
})

test('converts basic formatting', () => {
  const md = richTextToMarkdown('<p>Born in <strong>Boston</strong>.</p><ul><li>One</li><li>Two</li></ul>', deps())
  assert.match(md, /Born in \*\*Boston\*\*\./)
  assert.match(md, /^- One$/m)
  assert.match(md, /^- Two$/m)
})

test('tidies converter noise', () => {
  const md = richTextToMarkdown('<p>A</p><ul><li>x</li></ul><ol><li>y</li></ol><p>B</p>', deps())
  assert.doesNotMatch(md, /<!--/)
  assert.doesNotMatch(md, /\n{3,}/)
  assert.equal(md, md.trim())
})

test('removes unrevealed secrets for a player, keeps revealed ones', () => {
  const html = '<p>Public</p><section class="secret" id="s1"><p>Hidden</p></section><section class="secret revealed"><p>Shown</p></section>'
  const md = richTextToMarkdown(html, deps())
  assert.match(md, /Public/)
  assert.match(md, /Shown/)
  assert.doesNotMatch(md, /Hidden/)
})

test('keeps every secret for a GM', () => {
  const md = richTextToMarkdown('<section class="secret"><p>Hidden</p></section>', deps({ isGM: true }))
  assert.match(md, /Hidden/)
})

test('document links become their label', () => {
  const md = richTextToMarkdown('<p>Met @UUID[Actor.abc123]{Dr. Armitage} and @Compendium[CoC7.items.xyz]{a tome}.</p>', deps())
  assert.match(md, /Met Dr\. Armitage and a tome\./)
})

test('an unlabelled link uses the resolved name, or nothing', () => {
  const resolveName = uuid => (uuid === 'Actor.abc123' ? 'Dr. Armitage' : undefined)
  assert.match(richTextToMarkdown('<p>Met @UUID[Actor.abc123].</p>', deps({ resolveName })), /Met Dr\. Armitage\./)
  assert.match(richTextToMarkdown('<p>Met @UUID[Actor.gone].</p>', deps({ resolveName })), /Met \./)
})

test('inline rolls become label or formula, never a wikilink', () => {
  const md = richTextToMarkdown('<p>Lose [[/roll 1d6]] or [[1d4+1]]{some} SAN, then [[/r 2d6 # fire]].</p>', deps())
  assert.match(md, /Lose 1d6 or some SAN, then 2d6\./)
  assert.doesNotMatch(md, /\[\[/)
})

test('no unescaped [[ survives', () => {
  const md = richTextToMarkdown('<p>See [[Arkham]] notes and a stray [[ here.</p>', deps())
  assert.match(md, /See Arkham notes/)
  assert.doesNotMatch(md, /(^|[^\\])\[\[/)
})

test('plain text with raw line breaks keeps its paragraphs', () => {
  const md = richTextToMarkdown('First line\nSecond line\n\nThird', deps())
  assert.equal(md, 'First line\n\nSecond line\n\nThird')
})

test('content with no visible text gives an empty string', () => {
  for (const html of ['', '   ', '<p></p>', '<p>&nbsp;</p>', '<section class="secret"><p>x</p></section>']) {
    assert.equal(richTextToMarkdown(html, deps()), '')
  }
  assert.equal(richTextToMarkdown(null, deps()), '')
})

test('scripts, styles and event handlers do not reach the note', () => {
  const md = richTextToMarkdown('<p>Safe</p><script>alert(1)</script><style>p{color:red}</style><img src="x" onerror="alert(2)">', deps())
  assert.match(md, /Safe/)
  assert.doesNotMatch(md, /alert|onerror|color:red/)
})
