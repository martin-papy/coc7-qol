import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { addSettingsSections, SECTION_CLASS, HEADING_CLASS } from '../scripts/settings-sections/sections.js'

const SECTIONS = [
  { id: 'ai', title: 'AI Generator', settings: ['mod.ai-provider', 'mod.ai-key', 'mod.ai-model'] },
  { id: 'npc', title: 'NPC and Creature Sheets', settings: ['mod.npc-resizable'] },
  { id: 'skills', title: 'Strong Skills', settings: ['mod.skills-enabled', 'mod.skills-threshold'] }
]

/** A setting row as Foundry's settings window renders it (v13 and v14): a .form-group holding the named field. */
const row = (name, field = `<input type="text" name="${name}">`) => `
  <div class="form-group">
    <label>${name}</label>
    <div class="form-fields">${field}</div>
    <p class="hint">Hint for ${name}</p>
  </div>`

function buildSettings (rows) {
  const dom = new JSDOM(`
    <form>
      <section class="tab" data-category="other">${row('other.setting')}</section>
      <section class="tab" data-category="mod">${rows.join('')}</section>
    </form>`)
  return dom.window.document.querySelector('form')
}

const ALL_ROWS = [
  row('mod.ai-provider'),
  row('mod.ai-key'),
  row('mod.ai-model'),
  row('mod.npc-resizable', '<input type="checkbox" name="mod.npc-resizable">'),
  row('mod.skills-enabled', '<input type="checkbox" name="mod.skills-enabled">'),
  row('mod.skills-threshold', '<range-picker name="mod.skills-threshold" value="50"></range-picker>')
]

const fieldName = settingRow => settingRow.querySelector('[name]').getAttribute('name')

/**
 * The module tab read top to bottom: a section as `# title` followed by the settings it
 * holds, a setting outside any section as its field name alone.
 */
function outline (root) {
  return [...root.querySelector('[data-category="mod"]').children].flatMap(child => {
    if (!child.classList.contains(SECTION_CLASS)) return [fieldName(child)]
    const [heading, ...rows] = child.children
    assert.equal(heading.classList.contains(HEADING_CLASS), true, 'a section starts with its heading')
    return [`# ${heading.textContent}`, ...rows.map(fieldName)]
  })
}

const sectionCount = root => root.querySelectorAll(`.${SECTION_CLASS}`).length

test('puts a heading before the first setting of each section', () => {
  const root = buildSettings(ALL_ROWS)

  addSettingsSections(root, SECTIONS)

  assert.deepEqual(outline(root), [
    '# AI Generator', 'mod.ai-provider', 'mod.ai-key', 'mod.ai-model',
    '# NPC and Creature Sheets', 'mod.npc-resizable',
    '# Strong Skills', 'mod.skills-enabled', 'mod.skills-threshold'
  ])
})

test('the heading is an h4 with Foundry\'s bordered style and the module\'s own class', () => {
  const root = buildSettings(ALL_ROWS)

  addSettingsSections(root, SECTIONS)

  const heading = root.querySelector(`.${HEADING_CLASS}`)
  assert.equal(heading.tagName, 'H4')
  assert.equal(heading.classList.contains('border'), true)
})

test('a section is a group named by its heading', () => {
  const root = buildSettings(ALL_ROWS)

  addSettingsSections(root, SECTIONS)

  const section = root.querySelector(`.${SECTION_CLASS}`)
  const heading = section.querySelector(`.${HEADING_CLASS}`)
  assert.equal(section.getAttribute('role'), 'group')
  assert.notEqual(heading.id, '')
  assert.equal(section.getAttribute('aria-labelledby'), heading.id)
})

test('a setting row stays a descendant of its tab, where Foundry\'s search and counters look for it', () => {
  const root = buildSettings(ALL_ROWS)

  addSettingsSections(root, SECTIONS)

  const tab = root.querySelector('[data-category="mod"]')
  assert.equal(tab.querySelectorAll('.form-group').length, ALL_ROWS.length)
  for (const settingRow of tab.querySelectorAll('.form-group')) assert.equal(settingRow.closest('[data-category]'), tab)
})

test('a title is inserted as text, never as markup', () => {
  const root = buildSettings(ALL_ROWS)

  addSettingsSections(root, [{ id: 'ai', title: '<img src=x>', settings: ['mod.ai-provider'] }])

  assert.equal(root.querySelector('img'), null)
  assert.equal(root.querySelector(`.${HEADING_CLASS}`).textContent, '<img src=x>')
})

test('skips a section when none of its settings is shown', () => {
  // A player does not see world settings: only the client-scoped ones are rendered.
  const root = buildSettings([row('mod.ai-key')])

  addSettingsSections(root, SECTIONS)

  assert.deepEqual(outline(root), ['# AI Generator', 'mod.ai-key'])
})

test('starts a section at its first shown setting when earlier ones are missing', () => {
  const root = buildSettings(ALL_ROWS.slice(1))

  addSettingsSections(root, SECTIONS)

  assert.deepEqual(outline(root).slice(0, 3), ['# AI Generator', 'mod.ai-key', 'mod.ai-model'])
})

test('unlisted settings go above whichever section comes first on the page, not first in the list', () => {
  const [provider, key, model, npc, enabled, threshold] = ALL_ROWS
  const root = buildSettings([enabled, threshold, npc, provider, key, model, row('mod.unlisted')])

  addSettingsSections(root, SECTIONS)

  assert.deepEqual(outline(root), [
    'mod.unlisted',
    '# Strong Skills', 'mod.skills-enabled', 'mod.skills-threshold',
    '# NPC and Creature Sheets', 'mod.npc-resizable',
    '# AI Generator', 'mod.ai-provider', 'mod.ai-key', 'mod.ai-model'
  ])
})

test('gathers the settings of a section that were not rendered next to each other', () => {
  const [provider, key, model, npc, enabled, threshold] = ALL_ROWS
  const root = buildSettings([provider, npc, key, enabled, model, threshold])

  addSettingsSections(root, SECTIONS)

  assert.deepEqual(outline(root), [
    '# AI Generator', 'mod.ai-provider', 'mod.ai-key', 'mod.ai-model',
    '# NPC and Creature Sheets', 'mod.npc-resizable',
    '# Strong Skills', 'mod.skills-enabled', 'mod.skills-threshold'
  ])
})

test('gathers the settings that belong to no section above the first heading', () => {
  // Left where they were registered, they would read as part of the section above them.
  const [provider, key, ...rest] = ALL_ROWS
  const root = buildSettings([provider, row('mod.unlisted-between'), key, ...rest, row('mod.unlisted-last')])

  addSettingsSections(root, SECTIONS)

  assert.deepEqual(outline(root), [
    'mod.unlisted-between', 'mod.unlisted-last',
    '# AI Generator', 'mod.ai-provider', 'mod.ai-key', 'mod.ai-model',
    '# NPC and Creature Sheets', 'mod.npc-resizable',
    '# Strong Skills', 'mod.skills-enabled', 'mod.skills-threshold'
  ])
})

test('does not touch other packages\' settings', () => {
  const root = buildSettings(ALL_ROWS)
  const other = root.querySelector('[data-category="other"]')
  const before = other.innerHTML

  addSettingsSections(root, SECTIONS)

  assert.equal(other.innerHTML, before)
})

test('running it again on the same window adds no second heading', () => {
  const root = buildSettings(ALL_ROWS)

  addSettingsSections(root, SECTIONS)
  const first = outline(root)
  addSettingsSections(root, SECTIONS)

  assert.deepEqual(outline(root), first)
  assert.equal(sectionCount(root), SECTIONS.length)
})

test('running it again drops a section whose settings were all removed meanwhile', () => {
  const root = buildSettings(ALL_ROWS)
  addSettingsSections(root, SECTIONS)

  root.querySelector('[name="mod.npc-resizable"]').closest('.form-group').remove()
  addSettingsSections(root, SECTIONS)

  assert.deepEqual(outline(root), [
    '# AI Generator', 'mod.ai-provider', 'mod.ai-key', 'mod.ai-model',
    '# Strong Skills', 'mod.skills-enabled', 'mod.skills-threshold'
  ])
})

test('a window without any of the settings is left alone', () => {
  const root = new JSDOM('<form><section class="tab"></section></form>').window.document.querySelector('form')

  assert.doesNotThrow(() => addSettingsSections(root, SECTIONS))
  assert.equal(sectionCount(root), 0)
})
