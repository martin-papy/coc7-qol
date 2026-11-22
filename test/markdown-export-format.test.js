import { test } from 'node:test'
import assert from 'node:assert/strict'
import { yamlString, tableCell, inlineText, plainLine, defuseLineStart, fileNameFor } from '../scripts/markdown-export/format.js'

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

test('yamlString drops control characters, which would make the YAML invalid', () => {
  assert.equal(yamlString('42\u0007 x'), '"42 x"')
  assert.equal(yamlString('a\u0000b\u001bc\u007fd\u0085e\u009f'), '"abcde"')
  assert.equal(yamlString('tab\tand\rreturn'), '"tab and return"')
})

test('fileNameFor drops control characters', () => {
  assert.equal(fileNameFor('Harvey\u0000Walters'), 'HarveyWalters.md')
  assert.equal(fileNameFor('\u0007'), 'investigator.md')
})

test('inlineText and tableCell cannot open a tag, and leave a plain ampersand alone', () => {
  for (const escape of [inlineText, tableCell]) {
    assert.equal(escape('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)>')
    assert.equal(escape('Smith & Wesson'), 'Smith & Wesson')
    assert.equal(escape('a &amp; b &#60; c &lt;'), 'a &amp;amp; b &amp;#60; c &amp;lt;')
    assert.equal(escape('<!-- x -->'), '&lt;!-- x -->')
  }
})

test('plainLine defuses a leading block marker, and nothing else in the line', () => {
  assert.equal(plainLine('# big'), '\\# big')
  assert.equal(plainLine('> quote'), '\\> quote')
  assert.equal(plainLine('- item'), '\\- item')
  assert.equal(plainLine('* item'), '\\* item')
  assert.equal(plainLine('+ item'), '\\+ item')
  assert.equal(plainLine('1. item'), '1\\. item')
  assert.equal(plainLine('12) item'), '12\\) item')
  assert.equal(plainLine('```js'), '\\```js')
  assert.equal(plainLine('~~~'), '\\~~~')
  assert.equal(plainLine('---'), '\\---')
  assert.equal(plainLine('==='), '\\===')
  assert.equal(plainLine('___'), '\\___')
  assert.equal(plainLine('  # indented'), '\\# indented')
  assert.equal(plainLine('A town house # 2 - by the river > 1. ok'), 'A town house # 2 - by the river > 1. ok')
  assert.equal(plainLine('<b>x</b>'), '&lt;b>x&lt;/b>')
  assert.equal(plainLine(''), '')
})

test('defuseLineStart only touches the start of the line', () => {
  assert.equal(defuseLineStart('# a # b'), '\\# a # b')
  assert.equal(defuseLineStart('plain'), 'plain')
})
