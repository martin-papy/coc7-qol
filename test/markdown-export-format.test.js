import { test } from 'node:test'
import assert from 'node:assert/strict'
import { yamlString, tableCell, inlineText, fileNameFor } from '../scripts/markdown-export/format.js'

test('yamlString quotes and escapes', () => {
  assert.equal(yamlString('Journalist'), '"Journalist"')
  assert.equal(yamlString('Say "hi" \\ bye'), '"Say \\"hi\\" \\\\ bye"')
  assert.equal(yamlString('a: b # c'), '"a: b # c"')
  assert.equal(yamlString('line1\nline2'), '"line1 line2"')
  assert.equal(yamlString(42), '"42"')
})

test('tableCell escapes pipes, flattens line breaks, defuses wikilinks', () => {
  assert.equal(tableCell('Art|Craft'), 'Art\\|Craft')
  assert.equal(tableCell('two\nlines'), 'two lines')
  assert.equal(tableCell('[[Trap]]'), '\\[\\[Trap]]')
  assert.equal(tableCell(null), '')
  assert.equal(tableCell(0), '0')
})

test('inlineText flattens line breaks and defuses wikilinks but keeps pipes', () => {
  assert.equal(inlineText('a|b\n[[c]]'), 'a|b \\[\\[c]]')
  assert.equal(inlineText(undefined), '')
})

test('fileNameFor strips what file systems and Obsidian links reject', () => {
  assert.equal(fileNameFor('Harvey Walters'), 'Harvey Walters.md')
  assert.equal(fileNameFor('A/B\\C:D*E?F"G<H>I|J#K^L[M]N'), 'ABCDEFGHIJKLMN.md')
  assert.equal(fileNameFor('  Dr. Armitage.  '), 'Dr. Armitage.md')
  assert.equal(fileNameFor('.hidden'), 'hidden.md')
  assert.equal(fileNameFor('///'), 'investigator.md')
  assert.equal(fileNameFor(''), 'investigator.md')
  assert.equal(fileNameFor(undefined), 'investigator.md')
})
