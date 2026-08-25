import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { restructureTradeTargets, findTradeTargetSelect } from '../scripts/trade-targets/restructure.js'

const LABELS = {
  character: 'Investigators',
  container: 'Storage',
  npc: 'NPCs',
  creature: 'Creatures'
}

const ACTORS = [
  { id: 'n1', name: 'Alistair Thorne', type: 'npc' },
  { id: 'n2', name: 'Arthur Pendelton', type: 'npc' },
  { id: 'c1', name: 'Byakhee', type: 'creature' },
  { id: 'n3', name: 'Dr. Alistair Finch', type: 'npc' },
  { id: 'p1', name: 'Harvey Walters', type: 'character' },
  { id: 's1', name: 'zz_Storage', type: 'container' }
]

/** Reproduce the markup CoC7Utilities.tradeItem() renders inside DialogV2.wait (CoC7 8.15). */
function buildDialog (actors) {
  const options = actors.map(a => `<option value="Actor.${a.id}">${a.name}</option>`).join('')
  const html = `
    <div class="application dialog">
      <section class="window-content">
        <form class="dialog-form standard-form">
          <div class="dialog-content standard-form">
            <div>Which character would you like to give this item to?</div>
            <select name="user">${options}</select>
          </div>
        </form>
      </section>
    </div>`
  const dom = new JSDOM(html)
  const root = dom.window.document.querySelector('.dialog')
  const types = Object.fromEntries(actors.map(a => [`Actor.${a.id}`, a.type]))
  return { dom, root, select: root.querySelector('select[name="user"]'), typeOf: uuid => types[uuid] }
}

const groupsOf = select => [...select.querySelectorAll(':scope > optgroup')].map(g => ({
  label: g.label,
  options: [...g.querySelectorAll('option')].map(o => o.textContent)
}))

test('findTradeTargetSelect returns the actor select and null when absent', () => {
  const { root } = buildDialog(ACTORS)
  assert.equal(findTradeTargetSelect(root).name, 'user')

  const other = new JSDOM('<form><select name="user"><option value="1">one</option></select></form>')
  assert.equal(findTradeTargetSelect(other.window.document.body), null, 'a select without Actor uuids is not ours')
})

test('groups options into optgroups ordered Investigators, Storage, NPCs, Creatures', () => {
  const { select, typeOf } = buildDialog(ACTORS)

  restructureTradeTargets(select, { typeOf, labels: LABELS })

  assert.deepEqual(groupsOf(select), [
    { label: 'Investigators', options: ['Harvey Walters'] },
    { label: 'Storage', options: ['zz_Storage'] },
    { label: 'NPCs', options: ['Alistair Thorne', 'Arthur Pendelton', 'Dr. Alistair Finch'] },
    { label: 'Creatures', options: ['Byakhee'] }
  ])
  assert.equal(select.querySelectorAll(':scope > option').length, 0, 'no loose options remain')
})

test('omits empty groups', () => {
  const { select, typeOf } = buildDialog(ACTORS.filter(a => a.type === 'npc' || a.type === 'character'))

  restructureTradeTargets(select, { typeOf, labels: LABELS })

  assert.deepEqual(groupsOf(select).map(g => g.label), ['Investigators', 'NPCs'])
})

test('keeps every option value so the system callback still receives a uuid', () => {
  const { select, typeOf } = buildDialog(ACTORS)
  const before = [...select.options].map(o => o.value).sort()

  restructureTradeTargets(select, { typeOf, labels: LABELS })

  assert.deepEqual([...select.options].map(o => o.value).sort(), before)
  assert.equal(select.value, 'Actor.p1', 'the first Investigator is pre-selected')
  assert.equal(select.closest('form').elements.user.value, 'Actor.p1')
})

test('sorts names with the given locale', () => {
  const { select, typeOf } = buildDialog([
    { id: 'a', name: 'Örjan', type: 'npc' },
    { id: 'b', name: 'Zoe', type: 'npc' }
  ])

  restructureTradeTargets(select, { typeOf, labels: LABELS, locale: 'sv' })

  assert.deepEqual(groupsOf(select)[0].options, ['Zoe', 'Örjan'])
})

test('appends options of an unknown type after the groups, untouched', () => {
  const { select, typeOf } = buildDialog([...ACTORS, { id: 'v1', name: 'Model T', type: 'vehicle' }])

  restructureTradeTargets(select, { typeOf, labels: LABELS })

  const tail = select.lastElementChild
  assert.equal(tail.tagName.toLowerCase(), 'option')
  assert.equal(tail.value, 'Actor.v1')
})

test('is a no-op on a select it already restructured', () => {
  const { select, typeOf } = buildDialog(ACTORS)

  assert.equal(restructureTradeTargets(select, { typeOf, labels: LABELS }), true)
  const snapshot = select.innerHTML
  assert.equal(restructureTradeTargets(select, { typeOf, labels: LABELS }), false)
  assert.equal(select.innerHTML, snapshot)
})

test('a list of only unknown types yields no groups and keeps the first option selected', () => {
  const { select, typeOf } = buildDialog([
    { id: 'v1', name: 'Model T', type: 'vehicle' },
    { id: 'v2', name: 'Biplane', type: 'vehicle' }
  ])

  restructureTradeTargets(select, { typeOf, labels: LABELS })

  assert.equal(select.querySelectorAll('optgroup').length, 0)
  assert.deepEqual([...select.options].map(o => o.value), ['Actor.v1', 'Actor.v2'])
  assert.equal(select.value, 'Actor.v1')
})

test('a single-option list is grouped and stays selected', () => {
  const { select, typeOf } = buildDialog([{ id: 's1', name: 'Trunk', type: 'container' }])

  restructureTradeTargets(select, { typeOf, labels: LABELS })

  assert.deepEqual(groupsOf(select), [{ label: 'Storage', options: ['Trunk'] }])
  assert.equal(select.value, 'Actor.s1')
})

test('falls back to the raw type as heading when a label is missing', () => {
  const { select, typeOf } = buildDialog(ACTORS)

  restructureTradeTargets(select, { typeOf, labels: { ...LABELS, container: undefined } })

  assert.deepEqual(groupsOf(select).map(g => g.label), ['Investigators', 'container', 'NPCs', 'Creatures'])
})
