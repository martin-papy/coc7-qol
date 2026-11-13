import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { addCastControls, castLabelKeys, CAST_CONTROL_CLASS, CAST_ACTION } from '../scripts/spell-cast/cast-control.js'

const SPELLS = {
  'Actor.a1.Item.s1': { name: 'Shrivelling' },
  'Actor.a1.Item.s2': { name: 'Elder Sign' }
}

/** An item row as CoC7 renders it in the investigator Possessions tab and the NPC inventory panels (CoC7 8.16 and 9.1). */
const row = (uuid, name) => `
  <li class="item" data-item-uuid="${uuid}">
    <div class="item-image"></div>
    <div class="item-name show-detail">${name}</div>
    <div class="item-controls">
      <a class="item-control" data-action="item-trade"></a>
      <a class="item-control" data-action="item-edit"></a>
      <a class="item-control" data-action="item-delete"></a>
    </div>
  </li>`

function buildSheet (extraRows = '') {
  const dom = new JSDOM(`
    <form class="sheet">
      <ul class="item-list">${row('Actor.a1.Item.b1', 'Necronomicon')}</ul>
      <ul class="item-list">
        ${row('Actor.a1.Item.s1', 'Shrivelling')}
        ${row('Actor.a1.Item.s2', 'Elder Sign')}
        ${extraRows}
      </ul>
    </form>`)
  return { dom, root: dom.window.document.querySelector('.sheet') }
}

function buildDeps (overrides = {}) {
  const casts = []
  return {
    casts,
    deps: {
      findSpell: uuid => SPELLS[uuid],
      tooltipFor: spell => `Cast ${spell.name}`,
      canCastHidden: false,
      cast: (spell, hidden) => casts.push({ spell, hidden }),
      ...overrides
    }
  }
}

const controlsIn = root => [...root.querySelectorAll(`.${CAST_CONTROL_CLASS}`)]
const controlOf = (root, uuid) => root.querySelector(`[data-item-uuid="${uuid}"] .${CAST_CONTROL_CLASS}`)
const fire = (dom, target, type) => {
  const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

test('addCastControls adds a cast control to every spell row and to no other row', () => {
  const { root } = buildSheet()
  const { deps } = buildDeps()

  addCastControls(root, deps)

  assert.equal(controlsIn(root).length, 2)
  assert.ok(controlOf(root, 'Actor.a1.Item.s1'))
  assert.ok(controlOf(root, 'Actor.a1.Item.s2'))
  assert.equal(controlOf(root, 'Actor.a1.Item.b1'), null)
})

test('the cast control is the first control of its row and is styled like the system controls', () => {
  const { root } = buildSheet()
  const { deps } = buildDeps()

  addCastControls(root, deps)

  const control = controlOf(root, 'Actor.a1.Item.s1')
  assert.equal(control.parentElement.firstElementChild, control)
  assert.equal(control.classList.contains('item-control'), true)
})

test('the cast control carries its own data-action, because CoC7 9.x collapses item controls that have none', () => {
  const { root } = buildSheet()
  const { deps } = buildDeps()

  addCastControls(root, deps)

  const action = controlOf(root, 'Actor.a1.Item.s1').dataset.action
  assert.equal(action, CAST_ACTION)
  assert.equal(['item-trade', 'item-edit', 'item-delete', 'castSpell'].includes(action), false, 'must not be an action the system handles')
})

test('the cast control is labelled by tooltipFor, for the tooltip and for screen readers', () => {
  const { root } = buildSheet()
  const { deps } = buildDeps()

  addCastControls(root, deps)

  const control = controlOf(root, 'Actor.a1.Item.s2')
  assert.equal(control.dataset.tooltip, 'Cast Elder Sign')
  assert.equal(control.getAttribute('aria-label'), 'Cast Elder Sign')
})

test('the cast control is a native button that cannot submit the sheet form', () => {
  const { root } = buildSheet()
  const { deps } = buildDeps()

  addCastControls(root, deps)

  const control = controlOf(root, 'Actor.a1.Item.s1')
  assert.equal(control.tagName, 'BUTTON')
  assert.equal(control.type, 'button')
  assert.equal(control.hasAttribute('role'), false, 'a native button needs no role')
})

test('clicking the cast control casts that spell in the open and does not reach the row', () => {
  const { dom, root } = buildSheet()
  const { deps, casts } = buildDeps()
  let rowClicks = 0
  root.addEventListener('click', () => rowClicks++)
  addCastControls(root, deps)

  const event = fire(dom, controlOf(root, 'Actor.a1.Item.s2'), 'click')

  assert.deepEqual(casts, [{ spell: SPELLS['Actor.a1.Item.s2'], hidden: false }])
  assert.equal(event.defaultPrevented, true)
  assert.equal(rowClicks, 0)
})

test('right-clicking the cast control casts hidden when hidden casts are allowed', () => {
  const { dom, root } = buildSheet()
  const { deps, casts } = buildDeps({ canCastHidden: true })
  addCastControls(root, deps)

  const event = fire(dom, controlOf(root, 'Actor.a1.Item.s1'), 'contextmenu')

  assert.deepEqual(casts, [{ spell: SPELLS['Actor.a1.Item.s1'], hidden: true }])
  assert.equal(event.defaultPrevented, true)
})

test('right-clicking the cast control does nothing when hidden casts are not allowed', () => {
  const { dom, root } = buildSheet()
  const { deps, casts } = buildDeps({ canCastHidden: false })
  addCastControls(root, deps)

  const event = fire(dom, controlOf(root, 'Actor.a1.Item.s1'), 'contextmenu')

  assert.deepEqual(casts, [])
  assert.equal(event.defaultPrevented, false)
})

test('addCastControls does not add a second control when the same rows are rendered again', () => {
  const { root } = buildSheet()
  const { deps } = buildDeps()

  addCastControls(root, deps)
  addCastControls(root, deps)

  assert.equal(controlsIn(root).length, 2)
})

test('addCastControls skips a spell row that has no controls container', () => {
  const bare = '<li class="item" data-item-uuid="Actor.a1.Item.s2"><div class="item-name">Elder Sign</div></li>'
  const dom = new JSDOM(`<form class="sheet"><ul>${bare}</ul></form>`)
  const root = dom.window.document.querySelector('.sheet')
  const { deps } = buildDeps()

  assert.doesNotThrow(() => addCastControls(root, deps))
  assert.equal(controlsIn(root).length, 0)
})

test('castLabelKeys names the action "Cast" for a spell with automated costs', () => {
  assert.deepEqual(castLabelKeys(true), { cast: 'CoC7.Cast', hidden: 'CoC7.CastHidden' })
})

test('castLabelKeys names the action "To Chat" for a spell without automated costs', () => {
  assert.deepEqual(castLabelKeys(false), { cast: 'CoC7.MessageCast', hidden: 'CoC7.MessageCastHidden' })
})
