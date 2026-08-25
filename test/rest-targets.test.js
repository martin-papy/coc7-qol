import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { restructureRestTargets, findRestTargetsSection } from '../scripts/rest-targets/restructure.js'

const LABELS = {
  character: 'Investigators',
  npc: 'NPCs',
  creature: 'Creatures',
  vehicle: 'Vehicles'
}

/** Reproduce the markup CoC7Utilities.restTargets() renders (CoC7 8.15). */
function systemRow ({ id, name }) {
  return `<div class="flexrow"><input type="checkbox" name="CoC7RestTargets${id}" id="CoC7RestTargets${id}" style="flex: 0 0 auto;"><label for="CoC7RestTargets${id}">${name}</label></div>`
}

function buildDialog (actors) {
  const html = `
    <form>
      <div>Rest Targets: <input type="checkbox" name="CoC7RestTargetsAll" id="CoC7RestTargetsAll"><label for="CoC7RestTargetsAll">All Actors</label></div>
      <section class="scrollable flexcol">${actors.map(systemRow).join('\n')}</section>
    </form>`
  const dom = new JSDOM(html)
  const section = dom.window.document.querySelector('section')
  const types = Object.fromEntries(actors.map(a => [a.id, a.type]))
  return { dom, section, typeOf: id => types[id] }
}

const ACTORS = [
  { id: 'npc1', name: 'Angry Man A', type: 'npc' },
  { id: 'pc1', name: 'Harvey Walters', type: 'character' },
  { id: 'cre1', name: 'Byakhee', type: 'creature' },
  { id: 'npc2', name: 'Cecil Braithwaite', type: 'npc' }
]

test('moves rows into details groups ordered Investigators, NPCs, Creatures', () => {
  const { section, typeOf } = buildDialog(ACTORS)

  restructureRestTargets(section, { typeOf, labels: LABELS })

  const groups = [...section.querySelectorAll(':scope > details')]
  assert.deepEqual(
    groups.map(g => g.dataset.actorType),
    ['character', 'npc', 'creature']
  )
  assert.deepEqual(
    groups.map(g => [...g.querySelectorAll('input[name^="CoC7RestTargets"]')].map(i => i.name)),
    [['CoC7RestTargetspc1'], ['CoC7RestTargetsnpc1', 'CoC7RestTargetsnpc2'], ['CoC7RestTargetscre1']]
  )
  assert.equal(section.querySelectorAll(':scope > div.flexrow').length, 0, 'no loose rows remain')
})

test('sorts rows alphabetically by actor name within a group', () => {
  const { section, typeOf } = buildDialog([
    { id: 'n3', name: 'Zeke', type: 'npc' },
    { id: 'n1', name: 'angela', type: 'npc' },
    { id: 'n2', name: 'Bacon Victim', type: 'npc' }
  ])

  restructureRestTargets(section, { typeOf, labels: LABELS })

  const names = [...section.querySelectorAll('details[data-actor-type="npc"] div.flexrow label')].map(l => l.textContent)
  assert.deepEqual(names, ['angela', 'Bacon Victim', 'Zeke'])
})

test('opens the Investigators group and collapses the others, each summary showing a count', () => {
  const { section, typeOf } = buildDialog(ACTORS)

  restructureRestTargets(section, { typeOf, labels: LABELS })

  const state = [...section.querySelectorAll(':scope > details')].map(d => ({
    type: d.dataset.actorType,
    open: d.open,
    summary: d.querySelector('summary').textContent.replace(/\s+/g, ' ').trim()
  }))
  assert.deepEqual(state, [
    { type: 'character', open: true, summary: 'Investigators (1)' },
    { type: 'npc', open: false, summary: 'NPCs (2)' },
    { type: 'creature', open: false, summary: 'Creatures (1)' }
  ])
})

test('pre-checks every Investigator and leaves the other groups unchecked', () => {
  const { section, typeOf } = buildDialog([
    ...ACTORS,
    { id: 'pc2', name: 'Nora Thompson', type: 'character' }
  ])

  restructureRestTargets(section, { typeOf, labels: LABELS })

  const checkedNames = [...section.querySelectorAll('input[name^="CoC7RestTargets"]:checked')].map(i => i.name).sort()
  assert.deepEqual(checkedNames, ['CoC7RestTargetspc1', 'CoC7RestTargetspc2'])
})

function groupToggle (section, type) {
  return section.querySelector(`details[data-actor-type="${type}"] summary input[type="checkbox"]`)
}

function groupInputs (section, type) {
  return [...section.querySelectorAll(`details[data-actor-type="${type}"] input[name^="CoC7RestTargets"]`)]
}

function click (dom, checkbox, checked) {
  checkbox.checked = checked
  checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}

test('the group shortcut checkbox checks and unchecks every row of its group', () => {
  const { dom, section, typeOf } = buildDialog(ACTORS)
  restructureRestTargets(section, { typeOf, labels: LABELS })
  const toggle = groupToggle(section, 'npc')
  assert.ok(toggle, 'summary carries a checkbox')
  assert.ok(toggle.name.startsWith('coc7qol-'), 'toggle must not be mistaken for an actor input by the system callback')

  click(dom, toggle, true)
  assert.deepEqual(groupInputs(section, 'npc').map(i => i.checked), [true, true])

  click(dom, toggle, false)
  assert.deepEqual(groupInputs(section, 'npc').map(i => i.checked), [false, false])
})

test('the group shortcut mirrors its rows: checked, indeterminate, or unchecked', () => {
  const { dom, section, typeOf } = buildDialog(ACTORS)
  restructureRestTargets(section, { typeOf, labels: LABELS })

  const state = toggle => ({ checked: toggle.checked, indeterminate: toggle.indeterminate })
  assert.deepEqual(state(groupToggle(section, 'character')), { checked: true, indeterminate: false }, 'Investigators start fully selected')
  assert.deepEqual(state(groupToggle(section, 'npc')), { checked: false, indeterminate: false }, 'NPCs start empty')

  const [npcA, npcB] = groupInputs(section, 'npc')
  click(dom, npcA, true)
  assert.deepEqual(state(groupToggle(section, 'npc')), { checked: false, indeterminate: true }, 'one of two checked')

  click(dom, npcB, true)
  assert.deepEqual(state(groupToggle(section, 'npc')), { checked: true, indeterminate: false }, 'both checked')

  click(dom, npcA, false)
  click(dom, npcB, false)
  assert.deepEqual(state(groupToggle(section, 'npc')), { checked: false, indeterminate: false }, 'none checked')
})

test('is a no-op on a section it already restructured (DialogV2 re-render guard)', () => {
  const { section, typeOf } = buildDialog(ACTORS)

  const first = restructureRestTargets(section, { typeOf, labels: LABELS })
  const snapshot = section.innerHTML
  const second = restructureRestTargets(section, { typeOf, labels: LABELS })

  assert.equal(first, true)
  assert.equal(second, false)
  assert.equal(section.innerHTML, snapshot)
  assert.equal(section.querySelectorAll('details').length, 3)
})

test('leaves rows of an unknown actor type untouched after the groups', () => {
  const { section, typeOf } = buildDialog([
    ...ACTORS,
    { id: 'x1', name: 'Mystery', type: 'container' }
  ])

  restructureRestTargets(section, { typeOf, labels: LABELS })

  const children = [...section.children].map(el => el.tagName.toLowerCase())
  assert.deepEqual(children, ['details', 'details', 'details', 'div'])
  const stray = section.querySelector(':scope > div.flexrow input')
  assert.equal(stray.name, 'CoC7RestTargetsx1')
  assert.equal(stray.checked, false)
})

test('findRestTargetsSection picks the system row list, not the ApplicationV2 window-content frame', () => {
  const html = `
    <div class="application dialog" id="CoC7RestTargets">
      <section class="window-content">
        <form>
          <div>Rest Targets: <input type="checkbox" name="CoC7RestTargetsAll" id="CoC7RestTargetsAll"><label for="CoC7RestTargetsAll">All Actors</label></div>
          <section class="scrollable flexcol">${systemRow({ id: 'pc1', name: 'Harvey Walters' })}</section>
        </form>
      </section>
    </div>`
  const dom = new JSDOM(html)
  const root = dom.window.document.getElementById('CoC7RestTargets')

  const section = findRestTargetsSection(root)

  assert.ok(section)
  assert.equal(section.className, 'scrollable flexcol')
})

test('findRestTargetsSection returns null when the dialog has no actor rows', () => {
  const dom = new JSDOM('<div id="CoC7RestTargets"><section class="window-content"><form><section class="scrollable flexcol"></section></form></section></div>')

  assert.equal(findRestTargetsSection(dom.window.document.getElementById('CoC7RestTargets')), null)
})

test('clicking the group name does not change the selection (it is left free to expand the group)', () => {
  const { section, typeOf } = buildDialog(ACTORS)
  restructureRestTargets(section, { typeOf, labels: LABELS })
  const toggle = groupToggle(section, 'npc')
  const name = section.querySelector('details[data-actor-type="npc"] summary span')

  name.click()

  assert.equal(toggle.checked, false)
  assert.deepEqual(groupInputs(section, 'npc').map(i => i.checked), [false, false])
  assert.ok(toggle.getAttribute('aria-label'), 'checkbox keeps an accessible name without a <label>')
})
