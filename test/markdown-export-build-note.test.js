import { test } from 'node:test'
import assert from 'node:assert/strict'
import showdown from 'showdown'
import { JSDOM } from 'jsdom'
import { buildNote } from '../scripts/markdown-export/build-note.js'
import { LABEL_KEYS } from '../scripts/markdown-export/labels.js'

const doc = new JSDOM('<!DOCTYPE html>').window.document
const converter = new showdown.Converter()

const KEEPER_TEXT = 'Harvey is a cultist in disguise'
const SECRET_TEXT = 'He saw the Yellow Sign'
const REVEALED_TEXT = 'He fears the sea'

const actor = (oneBlockBackstory) => {
  const story = `<p>Grew up in Boston.</p><section class="secret" id="secret-1"><p>${SECRET_TEXT}</p></section>` +
    `<section class="secret revealed" id="secret-2"><p>${REVEALED_TEXT}</p></section>`
  return {
    name: 'Harvey Walters',
    type: 'character',
    items: [],
    system: {
      infos: { occupation: 'Journalist' },
      attribs: { hp: { value: 11, max: 11 } },
      backstory: oneBlockBackstory ? story : '',
      biography: oneBlockBackstory ? [] : [{ title: 'Personal Description', value: story }],
      description: { keeper: `<p>${KEEPER_TEXT}<br>Watch him.</p>` }
    }
  }
}

// Every label as its own key, except the Keeper one, so the Keeper label is easy to spot.
const labels = { ...Object.fromEntries(Object.keys(LABEL_KEYS).map(key => [key, key])), keeperNotes: "Keeper's notes" }

const deps = (isGM, overrides = {}) => ({
  isGM,
  oneBlockBackstory: false,
  displayPlayerName: false,
  locale: 'en',
  doc,
  htmlToMarkdown: html => converter.makeMarkdown(html, doc),
  resolveName: () => undefined,
  labels,
  today: '2026-11-22',
  ...overrides
})

for (const oneBlockBackstory of [false, true]) {
  const shape = oneBlockBackstory ? 'backstory' : 'biography'

  test(`a player's note (${shape}) holds no Keeper notes, no Keeper label and no unrevealed secret`, () => {
    const note = buildNote(actor(oneBlockBackstory), deps(false, { oneBlockBackstory }))
    assert.doesNotMatch(note, new RegExp(KEEPER_TEXT))
    assert.doesNotMatch(note, new RegExp(SECRET_TEXT))
    assert.doesNotMatch(note, /Keeper/)
    assert.doesNotMatch(note, /danger/)
    assert.match(note, new RegExp(REVEALED_TEXT))
    assert.match(note, /Grew up in Boston\./)
  })

  test(`a GM's note (${shape}) holds the Keeper notes callout, the secret and the revealed text`, () => {
    const note = buildNote(actor(oneBlockBackstory), deps(true, { oneBlockBackstory }))
    assert.match(note, new RegExp(SECRET_TEXT))
    assert.match(note, new RegExp(REVEALED_TEXT))
    assert.match(note, new RegExp(`^> \\[!danger\\]- Keeper's notes\\n> ${KEEPER_TEXT}\\\\\\n> Watch him\\.$`, 'm'))
  })
}

test('one isGM value drives both gates: the sheet data and the rich text', () => {
  const gm = buildNote(actor(false), deps(true))
  const player = buildNote(actor(false), deps(false))
  assert.deepEqual([gm.includes(KEEPER_TEXT), gm.includes(SECRET_TEXT)], [true, true])
  assert.deepEqual([player.includes(KEEPER_TEXT), player.includes(SECRET_TEXT)], [false, false])
})

test('the note is the rendered sheet: properties, title and date', () => {
  const note = buildNote(actor(false), deps(false))
  assert.match(note, /^---\ntype: "investigator"\noccupation: "Journalist"\nhp: 11\nhp_max: 11\n/)
  assert.match(note, /^# Harvey Walters$/m)
  assert.match(note, /^exported: 2026-11-22$/m)
  assert.match(note, /^### Personal Description$/m)
})
