import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LABEL_KEYS } from '../scripts/markdown-export/labels.js'

const LABELS_USED = ['characteristics', 'str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu', 'hp', 'mp', 'san', 'luck', 'mov', 'db', 'build', 'armor', 'skills', 'skill', 'regular', 'hard', 'extreme', 'weapons', 'weapon', 'damage', 'range', 'attacks', 'ammo', 'malfunction', 'possessions', 'items', 'books', 'spells', 'talents', 'armors', 'statuses', 'wealth', 'spendingLevel', 'cash', 'spent', 'assets', 'background', 'encounters', 'immune', 'keeperNotes']

test('LABEL_KEYS covers exactly the labels the renderer reads', () => {
  assert.deepEqual(Object.keys(LABEL_KEYS).sort(), [...LABELS_USED].sort())
})

test('every module-owned label key exists in lang/en.json', () => {
  const en = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'))
  for (const key of [...Object.values(LABEL_KEYS), 'COC7QOL.MarkdownExport.Button', 'COC7QOL.MarkdownExport.Failed']) {
    if (key.startsWith('COC7QOL.')) assert.ok(key in en, key)
  }
})
