import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { weaponRowHtml, possessionRowHtml } from '../scripts/ai-generator/npc-preview.js'

// Mirrors game.i18n.format with the real en.json strings for the two row keys.
const STRINGS = {
  'COC7QOL.AIGenerator.NPC.Preview.WeaponRowDamage': '{damage} • {skill}',
  'COC7QOL.AIGenerator.NPC.Preview.PossessionRowQuantity': '×{quantity}'
}
before(() => {
  globalThis.game = {
    i18n: { format: (key, data) => STRINGS[key].replace(/\{(\w+)\}/g, (_m, k) => String(data[k])) }
  }
})
after(() => { delete globalThis.game })

const weapon = (damage, skill, name = 'Shotgun') => ({ name, system: { range: { normal: { damage } }, skill: { main: { name: skill } } } })

/** Parse a row the way the dialog inserts it and return the shown text of its parts. */
function shown (html) {
  const doc = new JSDOM(`<div>${html}</div>`).window.document
  return {
    name: doc.querySelector('.coc7qol-npc-equip-name').textContent,
    detail: doc.querySelector('.coc7qol-npc-equip-detail').textContent,
    elements: doc.querySelectorAll('.coc7qol-npc-equip-detail *, .coc7qol-npc-equip-name *').length,
    row: doc.querySelector('.coc7qol-npc-equip-row')
  }
}

test('a weapon row shows a slash and an apostrophe in its skill and damage as typed', () => {
  const row = shown(weaponRowHtml(weapon("2D6/1D6 o'clock", 'Firearms (Rifle/Shotgun)'), 0, false, 'Remove'))

  assert.equal(row.detail, "2D6/1D6 o'clock • Firearms (Rifle/Shotgun)")
})

test('a weapon row shows markup in its skill, damage and name as text', () => {
  const row = shown(weaponRowHtml(weapon('<b>1D6</b>', '<img src=x>', '<i>Knife</i>'), 0, false, 'Remove'))

  assert.equal(row.elements, 0)
  assert.equal(row.detail, '<b>1D6</b> • <img src=x>')
  assert.equal(row.name, '<i>Knife</i>')
})

test('a weapon row carries its index and kind, and the removed class only when removed', () => {
  const kept = shown(weaponRowHtml(weapon('1D6', 'Fighting (Brawl)'), 3, false, 'Remove')).row
  const removed = shown(weaponRowHtml(weapon('1D6', 'Fighting (Brawl)'), 3, true, 'Remove')).row

  assert.equal(kept.dataset.equipIndex, '3')
  assert.equal(kept.dataset.equipKind, 'weapon')
  assert.equal(kept.classList.contains('coc7qol-ai-removed'), false)
  assert.equal(removed.classList.contains('coc7qol-ai-removed'), true)
})

test('a possession row shows its quantity only above one, and its name as text', () => {
  const single = shown(possessionRowHtml({ name: "Pipe & 'baccy", system: { quantity: 1 } }, 0, false, 'Remove'))
  const many = shown(possessionRowHtml({ name: 'Candle', system: { quantity: 4 } }, 1, false, 'Remove'))

  assert.equal(single.name, "Pipe & 'baccy")
  assert.equal(single.detail, '')
  assert.equal(many.detail, '×4')
  assert.equal(many.row.dataset.equipKind, 'possession')
})
