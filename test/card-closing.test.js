import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { stripCardControls } from '../scripts/card-closing.js'

/** Parse card content the way the feature does (DOMParser → body). */
function parse (html) {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document.body
}

const actions = root => [...root.querySelectorAll('button')].map(b => b.dataset.action + (b.dataset.set ? `:${b.dataset.set}` : ''))

// Shapes below follow CoC7 9.1's templates/chat/roll-result.hbs, opposed-roll.hbs,
// parts/roll-container.hbs and roll-standby.hbs.
const OPEN_CHECK_CARD = `
  <div class="dice-roll">
    <div class="never-expand" data-action="expandRoll"></div>
    <div class="owner-and-keeper-block coc7-card-buttons flexrow" data-actor-uuid="Actor.a1">
      <button data-action="push">Push</button>
      <button data-action="luck" data-luck-spend="12">Spend 12 luck</button>
      <button data-action="bonus" data-quantity="1">Add one bonus die</button>
      <button data-action="bonus" data-quantity="-1">Add one penalty die</button>
    </div>
    <h4 class="dice-total failure">89</h4>
  </div>
  <div class="coc7-card-buttons in-third-place flexrow">
    <button data-action="revealCheck">Reveal check</button>
    <button data-action="forcePass">Force pass</button>
  </div>
  <div class="keeper-only-block flexcol">
    <div class="coc7-card-buttons"><a class="content-link" data-uuid="Item.t1">Lucky</a></div>
  </div>
  <div class="keeper-only-block coc7-card-buttons flexrow">
    <button data-action="toggleValue" data-set="cardOpen">Close card</button>
  </div>`

const OPEN_OPPOSED_CARD = `
  <div class="keeper-only-block coc7-card-buttons flexrow">
    <button class="switched-on" data-action="toggleValue" data-set="isCombat">Opposed roll</button>
  </div>
  <div class="keeper-only-block coc7-card-buttons flexrow">
    <button class="flex-single switched-on" data-action="setValue" data-set="advantage" data-value="1">Attacker has advantage</button>
    <button class="flex-single" data-action="setValue" data-set="advantage" data-value="2">Defender has advantage</button>
  </div>
  <div class="not-keeper-block coc7-tags"><span class="tag">Attacker has advantage</span></div>
  <div class="coc7-group-actor-roll flexrow won attacker">
    <div class="actor-portrait flexcol" data-actor-uuid="Actor.a1">
      <img class="portrait open-actor" src="a.webp" />
      <div class="coc7-card-buttons flexrow">
        <button class="keeper-only-control" disabled="disabled" data-action="participant">Attacker</button>
      </div>
    </div>
    <div class="roll-details">
      <div class="owner-and-keeper-block coc7-card-buttons flexrow" data-actor-uuid="Actor.a1">
        <button data-action="luck" data-luck-spend="5">Spend 5 luck</button>
      </div>
    </div>
  </div>
  <div class="coc7-card-result">Attacker wins</div>
  <div class="keeper-only-block coc7-card-buttons flexrow">
    <button data-action="toggleValue" data-set="cardOpen">Close card</button>
  </div>`

const STANDBY_CARD = `
  <div class="coc7-card-buttons flexrow">
    <button data-action="rollCheckCard">Roll</button>
  </div>`

test('stripCardControls removes every live action button of a check card, not only Close card', () => {
  const root = parse(OPEN_CHECK_CARD)
  assert.equal(stripCardControls(root), true)
  assert.deepEqual(actions(root), [])
})

test('stripCardControls removes the button rows it emptied and keeps the rest of the card', () => {
  const root = parse(OPEN_CHECK_CARD)
  stripCardControls(root)
  // Only the row holding the talent links survives; the three button-only rows are gone.
  assert.equal(root.querySelectorAll('.coc7-card-buttons').length, 1)
  assert.ok(root.querySelector('.keeper-only-block .coc7-card-buttons a.content-link'))
  assert.ok(root.querySelector('h4.dice-total'))
  // Not a button: core's roll-expansion toggle must stay.
  assert.ok(root.querySelector('[data-action="expandRoll"]'))
})

test('stripCardControls keeps the disabled markers the system itself keeps on a closed opposed card', () => {
  const root = parse(OPEN_OPPOSED_CARD)
  assert.equal(stripCardControls(root), true)
  assert.deepEqual(actions(root), ['participant'])
  assert.equal(root.querySelector('button[data-action="participant"]').disabled, true)
  assert.ok(root.querySelector('.coc7-card-result'))
})

test('stripCardControls shows everyone the tags that stood in for Keeper-only buttons', () => {
  const root = parse(OPEN_OPPOSED_CARD)
  stripCardControls(root)
  const tags = root.querySelector('.coc7-tags')
  assert.ok(tags)
  assert.equal(tags.classList.contains('not-keeper-block'), false)
  assert.equal(tags.textContent.trim(), 'Attacker has advantage')
})

test('stripCardControls leaves a card without a Close card button untouched', () => {
  const root = parse(STANDBY_CARD)
  const before = root.innerHTML
  assert.equal(stripCardControls(root), false)
  assert.equal(root.innerHTML, before)
})

test('stripCardControls is a no-op on an already closed card', () => {
  const root = parse(OPEN_CHECK_CARD)
  stripCardControls(root)
  const closed = root.innerHTML
  assert.equal(stripCardControls(root), false)
  assert.equal(root.innerHTML, closed)
})
