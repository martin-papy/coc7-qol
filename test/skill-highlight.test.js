import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  STRONG_SKILL_CLASS,
  DEFAULT_THRESHOLD,
  MIN_THRESHOLD,
  MAX_THRESHOLD,
  normalizeThreshold,
  isStrongSkill,
  markStrongSkills
} from '../scripts/skill-highlight/highlight.js'

const VALUES = { 'A.s1': 80, 'A.s2': 50, 'A.s3': 49, 'A.s4': 120 }

function buildSheet () {
  const dom = new JSDOM(`
    <div class="sheet">
      <section class="tab skills"><ul class="item-list">
        <li class="item skill" data-item-uuid="A.s1"><div class="item-name skill-name">Dodge</div></li>
        <li class="item skill" data-item-uuid="A.s2"><div class="item-name skill-name">Climb</div></li>
        <li class="item skill" data-item-uuid="A.s3"><div class="item-name skill-name">Jump</div></li>
        <li class="item skill" data-item-uuid="A.gone"><div class="item-name skill-name">Stale</div></li>
      </ul></section>
      <section class="tab development"><ul class="skills-list">
        <li class="item" data-item-uuid="A.s1"><div class="skill-name">Dodge</div></li>
      </ul></section>
      <div class="skill-list"><div class="item skill flexrow" data-item-uuid="A.s4"><div class="skill-name">Bite</div></div></div>
      <div class="skills-block"><div class="item flexrow" data-item-uuid="A.s1"></div></div>
      <div class="skills-block icons-only"><div class="item" data-item-uuid="A.s1"></div></div>
    </div>`)
  return dom.window.document.querySelector('.sheet')
}
const marked = root => [...root.querySelectorAll(`.${STRONG_SKILL_CLASS}`)]
const valueFor = uuid => VALUES[uuid]

test('isStrongSkill is true at or above the threshold, including above 99', () => {
  assert.equal(isStrongSkill(50, 50), true)
  assert.equal(isStrongSkill(49, 50), false)
  assert.equal(isStrongSkill(120, 50), true)
  assert.equal(isStrongSkill('60', 50), true)
})

test('isStrongSkill is false for a value that is not a number', () => {
  for (const value of [undefined, null, '', NaN, 'abc', {}]) assert.equal(isStrongSkill(value, 1), false)
})

test('normalizeThreshold returns a whole number from 1 to 99, 50 when unreadable', () => {
  assert.equal(normalizeThreshold(50), 50)
  assert.equal(normalizeThreshold('65'), 65)
  assert.equal(normalizeThreshold(49.6), 50)
  assert.equal(normalizeThreshold(0), MIN_THRESHOLD)
  assert.equal(normalizeThreshold(-5), MIN_THRESHOLD)
  assert.equal(normalizeThreshold(150), MAX_THRESHOLD)
  for (const raw of [undefined, null, '', 'abc', NaN]) assert.equal(normalizeThreshold(raw), DEFAULT_THRESHOLD)
})

test('marks skill rows at or above the threshold on investigator, NPC and summarized markup', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  assert.deepEqual(marked(root).map(row => row.dataset.itemUuid), ['A.s1', 'A.s2', 'A.s4', 'A.s1'])
})

test('leaves the development tab and the icons-only strip unmarked', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  assert.equal(root.querySelector('.tab.development .item').classList.contains(STRONG_SKILL_CLASS), false)
  assert.equal(root.querySelector('.icons-only .item').classList.contains(STRONG_SKILL_CLASS), false)
})

test('removes the mark from a row that dropped below the threshold or no longer resolves', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  markStrongSkills(root, { threshold: 50, valueFor: uuid => (uuid === 'A.s4' ? 120 : undefined) })
  assert.deepEqual(marked(root).map(row => row.dataset.itemUuid), ['A.s4'])
})

test('running it twice gives the same result', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  markStrongSkills(root, { threshold: 50, valueFor })
  assert.equal(marked(root).length, 4)
})

test('a null threshold clears every mark', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  markStrongSkills(root, { threshold: null, valueFor })
  assert.equal(marked(root).length, 0)
})

test('a root without skill rows is left alone', () => {
  const root = new JSDOM('<div class="sheet"><p>Vehicle</p></div>').window.document.querySelector('.sheet')
  assert.doesNotThrow(() => markStrongSkills(root, { threshold: 50, valueFor }))
})
