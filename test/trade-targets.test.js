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
const PLACEHOLDER = '— Choose a character —'
const DEPS = { labels: LABELS, placeholder: PLACEHOLDER }

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
          <footer class="form-footer">
            <button type="submit" data-action="cancel">Cancel</button>
            <button type="submit" data-action="ok">Validate</button>
          </footer>
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

  restructureTradeTargets(select, { typeOf, ...DEPS })

  assert.deepEqual(groupsOf(select), [
    { label: 'Investigators', options: ['Harvey Walters'] },
    { label: 'Storage', options: ['zz_Storage'] },
    { label: 'NPCs', options: ['Alistair Thorne', 'Arthur Pendelton', 'Dr. Alistair Finch'] },
    { label: 'Creatures', options: ['Byakhee'] }
  ])
  assert.deepEqual([...select.querySelectorAll(':scope > option')].map(o => o.value), [''], 'only the placeholder is loose')
})

test('omits empty groups', () => {
  const { select, typeOf } = buildDialog(ACTORS.filter(a => a.type === 'npc' || a.type === 'character'))

  restructureTradeTargets(select, { typeOf, ...DEPS })

  assert.deepEqual(groupsOf(select).map(g => g.label), ['Investigators', 'NPCs'])
})

test('keeps every option value so the system callback still receives a uuid', () => {
  const { select, typeOf } = buildDialog(ACTORS)
  const before = [...select.options].map(o => o.value).sort()

  restructureTradeTargets(select, { typeOf, ...DEPS })

  const actorValues = [...select.options].map(o => o.value).filter(Boolean).sort()
  assert.deepEqual(actorValues, before)
})

test('sorts names with the given locale', () => {
  const { select, typeOf } = buildDialog([
    { id: 'a', name: 'Örjan', type: 'npc' },
    { id: 'b', name: 'Zoe', type: 'npc' }
  ])

  restructureTradeTargets(select, { typeOf, ...DEPS, locale: 'sv' })

  assert.deepEqual(groupsOf(select)[0].options, ['Zoe', 'Örjan'])
})

test('appends options of an unknown type after the groups, untouched', () => {
  const { select, typeOf } = buildDialog([...ACTORS, { id: 'v1', name: 'Model T', type: 'vehicle' }])

  restructureTradeTargets(select, { typeOf, ...DEPS })

  const tail = select.lastElementChild
  assert.equal(tail.tagName.toLowerCase(), 'option')
  assert.equal(tail.value, 'Actor.v1')
})

test('is a no-op on a select it already restructured', () => {
  const { select, typeOf } = buildDialog(ACTORS)

  assert.equal(restructureTradeTargets(select, { typeOf, ...DEPS }), true)
  const snapshot = select.innerHTML
  assert.equal(restructureTradeTargets(select, { typeOf, ...DEPS }), false)
  assert.equal(select.innerHTML, snapshot)
})

test('a list of only unknown types yields no groups and keeps the first option selected', () => {
  const { select, typeOf } = buildDialog([
    { id: 'v1', name: 'Model T', type: 'vehicle' },
    { id: 'v2', name: 'Biplane', type: 'vehicle' }
  ])

  restructureTradeTargets(select, { typeOf, ...DEPS })

  assert.equal(select.querySelectorAll('optgroup').length, 0)
  assert.deepEqual([...select.options].map(o => o.value), ['', 'Actor.v1', 'Actor.v2'])
  assert.equal(select.value, '', 'placeholder stays selected')
})

test('a single-option list is grouped and stays selected', () => {
  const { select, typeOf } = buildDialog([{ id: 's1', name: 'Trunk', type: 'container' }])

  restructureTradeTargets(select, { typeOf, ...DEPS })

  assert.deepEqual(groupsOf(select), [{ label: 'Storage', options: ['Trunk'] }])
  assert.equal(select.value, '', 'even a single target must be chosen explicitly')
})

test('falls back to the raw type as heading when a label is missing', () => {
  const { select, typeOf } = buildDialog(ACTORS)

  restructureTradeTargets(select, { typeOf, ...DEPS, labels: { ...LABELS, container: undefined } })

  assert.deepEqual(groupsOf(select).map(g => g.label), ['Investigators', 'container', 'NPCs', 'Creatures'])
})

const validateButton = select => select.closest('form').querySelector('button[data-action="ok"]')

function choose (dom, select, value) {
  select.value = value
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
}

test('pre-selects a disabled placeholder so nothing is chosen by default', () => {
  const { select, typeOf } = buildDialog(ACTORS)

  restructureTradeTargets(select, { typeOf, ...DEPS })

  const first = select.options[0]
  assert.equal(first.textContent, PLACEHOLDER)
  assert.equal(first.value, '')
  assert.equal(first.disabled, true, 'cannot be re-selected once a real target is picked')
  assert.equal(first.selected, true)
  assert.equal(select.closest('form').elements.user.value, '', 'the system callback would receive an empty target')
})

test('disables Validate until a real target is chosen', () => {
  const { dom, select, typeOf } = buildDialog(ACTORS)

  restructureTradeTargets(select, { typeOf, ...DEPS })

  const ok = validateButton(select)
  const cancel = select.closest('form').querySelector('button[data-action="cancel"]')
  assert.equal(ok.disabled, true, 'Validate starts disabled')
  assert.equal(cancel.disabled, false, 'Cancel stays available')

  choose(dom, select, 'Actor.s1')
  assert.equal(ok.disabled, false, 'Validate enabled after choosing')
  assert.equal(select.closest('form').elements.user.value, 'Actor.s1')
})

test('still works when the form has no Validate button', () => {
  const { select, typeOf } = buildDialog(ACTORS)
  select.closest('form').querySelector('footer').remove()

  assert.doesNotThrow(() => restructureTradeTargets(select, { typeOf, ...DEPS }))
  assert.equal(select.value, '')
})
