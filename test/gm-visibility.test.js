import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { gmOnlyTabKeys } from '../scripts/gm-visibility/tab-rules.js'
import { gmOnlyChatRegions } from '../scripts/gm-visibility/chat-rules.js'
import { applyChatHighlights } from '../scripts/gm-visibility/chat-cards.js'
import { ROOT_CLASS, MARKER_CLASS, READONLY_CLASS } from '../scripts/gm-visibility/settings.js'

const BADGE = '.coc7qol-gm-badge'

// ---------------------------------------------------------------------------
// gmOnlyTabKeys
// ---------------------------------------------------------------------------

/** A book item; `getBook` stands in for the CoC7 actor model's actor.system.getBook(item). */
function book ({ mythos = false, occult = false, getBook } = {}) {
  const doc = { type: 'book', system: { type: { mythos, occult, other: false } } }
  if (getBook) doc.actor = { system: { getBook } }
  return doc
}

test('a world book (no owning actor) is unread: details and content are GM-only', () => {
  assert.deepEqual(gmOnlyTabKeys(book()), ['details', 'content'])
})

test('an unread mythos book also flags its spells tab', () => {
  assert.deepEqual(gmOnlyTabKeys(book({ mythos: true })), ['details', 'content', 'spells'])
})

test('an unread occult book also flags its spells tab', () => {
  assert.deepEqual(gmOnlyTabKeys(book({ occult: true })), ['details', 'content', 'spells'])
})

test('an unread book that is neither mythos nor occult has no spells tab to flag', () => {
  assert.ok(!gmOnlyTabKeys(book()).includes('spells'))
})

test('a book the owning actor has read keeps only details GM-only', () => {
  const doc = book({ mythos: true, getBook: () => ({ initialReading: true }) })
  assert.deepEqual(gmOnlyTabKeys(doc), ['details'])
})

test('getBook is called with the book document itself', () => {
  let received
  const doc = book({ getBook: d => { received = d; return { initialReading: true } } })
  gmOnlyTabKeys(doc)
  assert.equal(received, doc)
})

test('a book the actor knows but has not initially read is still unread', () => {
  const doc = book({ occult: true, getBook: () => ({ initialReading: false }) })
  assert.deepEqual(gmOnlyTabKeys(doc), ['details', 'content', 'spells'])
})

test('a book the actor does not know (getBook → undefined) is unread', () => {
  const doc = book({ getBook: () => undefined })
  assert.deepEqual(gmOnlyTabKeys(doc), ['details', 'content'])
})

test('a throwing getBook is treated as unread rather than propagating', () => {
  const doc = book({ mythos: true, getBook: () => { throw new Error('boom') } })
  assert.deepEqual(gmOnlyTabKeys(doc), ['details', 'content', 'spells'])
})

test('an actor model without getBook degrades to unread', () => {
  const doc = { type: 'book', system: { type: {} }, actor: { system: {} } }
  assert.deepEqual(gmOnlyTabKeys(doc), ['details', 'content'])
})

test('a spell flags only its details tab', () => {
  assert.deepEqual(gmOnlyTabKeys({ type: 'spell', system: {} }), ['details'])
})

test('other item types, and a missing document, have no GM-only tabs', () => {
  for (const type of ['weapon', 'skill', 'item', 'talent', 'setup']) {
    assert.deepEqual(gmOnlyTabKeys({ type, system: {} }), [], type)
  }
  assert.deepEqual(gmOnlyTabKeys(undefined), [])
  assert.deepEqual(gmOnlyTabKeys(null), [])
})

// ---------------------------------------------------------------------------
// Chat-card fixtures, hand-rendered from CoC7 9.x handlebars templates
// (../CoC7-FoundryVTT-9.x/static/templates/chat/). Identical in 8.16 where noted.
// ---------------------------------------------------------------------------

/**
 * A plain roll message after CoC7ChatMessage._onRenderMessage (coc7/apps/chat-message.js) has
 * appended parts/damage-buttons.hbs, wrapped in a <div>, to .message-content — GM only.
 * damage-buttons.hbs rendered with isDamage=true (unchanged since 8.16).
 */
const PLAIN_ROLL_WITH_DAMAGE_BUTTONS = `
  <li class="chat-message message">
    <div class="message-content">
      <div class="dice-roll"><div class="dice-result"><h4 class="dice-total">7</h4></div></div>
      <div>
        <div class="keeper-only-block coc7-card-buttons flexrow">
          <button data-action="setRollAsModifier">Set as damage/heal</button>
        </div>
        <div class="coc7-card-buttons flexrow">
          <button data-action="applyValue">Apply damage: Bob</button>
        </div>
      </div>
    </div>
  </li>`

/** Same, damage-buttons.hbs with neither isDamage nor isHeal: only the setRollAsModifier row. */
const PLAIN_ROLL_SET_ONLY = `
  <li class="chat-message message">
    <div class="message-content">
      <div class="dice-roll"><div class="dice-result"><h4 class="dice-total">7</h4></div></div>
      <div>
        <div class="keeper-only-block coc7-card-buttons flexrow">
          <button data-action="setRollAsModifier">Set as damage/heal</button>
        </div>
      </div>
    </div>
  </li>`

/**
 * templates/chat/damage.hbs, branch rollDamage + isDamageOnlyNumbers + no targetUuid: the
 * "Inflict pain" applyValue row players can see. No setRollAsModifier anywhere.
 */
const DAMAGE_CARD_NO_TARGET = `
  <div class="chat-card">
    <div class="coc7-chat-header flexcol"><div class="card-title">Damage</div></div>
    <div class="flexrow"><div class="coc7-tags"></div></div>
    <div class="coc7-faux-button coc7-chat-gap">Total damage: 5</div>
    <div class="coc7-card-buttons flexrow">
      <button data-action="applyValue">Inflict pain</button>
    </div>
  </div>`

/**
 * templates/chat/damage.hbs, branch rollDamage + targetUuid + !rollHtml + !ignoreArmor +
 * isArmorFormula + !isDamageOnlyNumbers, isCritical=true. Keeper-only blocks wrap
 * keeper-only-control buttons; the armour readout and roll button are owner-and-keeper.
 */
const DAMAGE_CARD_WITH_TARGET = `
  <div class="chat-card">
    <div class="coc7-chat-header flexcol"><div class="card-title">.38 Revolver</div></div>
    <div class="coc7-chat-content">Ghoul takes 1D10 from .38 Revolver</div>
    <div class="not-keeper-block flexrow">
      <div class="coc7-tags"><span class="tag" data-tooltip="CoC7.CriticalTitle">Critical</span></div>
      <div class="owner-and-keeper-block flexrow flex-auto" data-actor-uuid="Actor.t1">
        <label class="flex-auto">Armor:</label>
        <span class="flex-auto">1D3</span>
      </div>
    </div>
    <div class="keeper-only-block coc7-card-buttons coc7-half-buttons flexrow">
      <button class="keeper-only-control switched-on" data-action="toggleValue" data-set="isCritical" data-tooltip="CoC7.CriticalTitle">Critical</button>
      <button class="keeper-only-control" data-action="toggleValue" data-set="isImpale" data-tooltip="CoC7.ImpaleTitle">Impale</button>
    </div>
    <div class="keeper-only-block coc7-card-buttons flexrow">
      <div></div>
      <button class="keeper-only-control coc7-short-button"data-action="toggleValue" data-set="ignoreArmor"><i class="game-icon game-icon-armor-upgrade"></i></button>
      <label class="flex-auto">Armor:</label>
      <input type="text" value="1D3">
      <button class="keeper-only-control coc7-short-button" data-action="rollArmor"><i class="fa-solid fa-dice"></i></button>
    </div>
    <div class="owner-and-keeper-block coc7-card-buttons flexrow" data-actor-uuid="Actor.a1">
      <button data-action="rollDamage">Roll damage: 1D10</button>
    </div>
  </div>`

/**
 * templates/chat/melee-initiator.hbs, branch !rolled, no talents and no pool bonus/penalty
 * buttons: the auto-success keeper-only block, and the loose keeper-only-control slider.
 */
const MELEE_INITIATOR = `
  <div class="chat-card">
    <div class="coc7-chat-content"><label>Target: Ghoul</label></div>
    <div class="keeper-only-block coc7-card-buttons flexrow">
      <button class="" data-action="toggleValue" data-set="isAutoSuccess" data-tooltip="CoC7.TitleAutoSuccess">Automatic success</button>
    </div>
    <div class="coc7-chat-content flexcol" data-actor-uuid="Actor.a1">
      <label>Additional pool modifier</label>
      <div class="bonus-penalty-selector">
        <div class="bonus-penalty-header flexrow"><span>Penalty dice</span><span>Bonus dice</span></div>
        <input type="range" name="poolModifier" min="-2" max="2" value="0" class="slider keeper-only-control">
      </div>
    </div>
  </div>`

/**
 * templates/chat/range-initiator.hbs, the weapon-options row: the aiming toggle is a loose
 * keeper-only-control button (players see it disabled), next to plain player buttons.
 */
const RANGE_INITIATOR_OPTIONS = `
  <div class="chat-card">
    <div class="coc7-card-buttons coc7-half-buttons flexrow" data-actor-uuid="Actor.a1">
      <button class="switched-on"data-action="toggleValue" data-set="singleShot">Single shot</button>
      <button class="keeper-only-control" data-action="toggleValue" data-set="aiming" data-tooltip="CoC7.rangeCombatCard.AimingTitle">Aiming</button>
    </div>
  </div>`

/** templates/chat/roll-result.hbs-style card with nothing GM-only (no keeper markers at all). */
const PLAIN_CARD = `
  <div class="chat-card">
    <div class="coc7-chat-header flexcol"><div class="card-title">Spot Hidden</div></div>
    <div class="coc7-card-buttons flexrow"><button data-action="push">Push</button></div>
  </div>`

let dom

/** Parse a fixture and return its root element. */
function card (markup) {
  const host = dom.window.document.createElement('div')
  host.innerHTML = markup.trim()
  return host.firstElementChild
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><body></body>')
  globalThis.document = dom.window.document
  // badge.js resolves tooltips through utils.t → game.i18n.localize.
  globalThis.game = { i18n: { localize: key => `i18n:${key}` } }
})

afterEach(() => {
  delete globalThis.document
  delete globalThis.game
})

// ---------------------------------------------------------------------------
// gmOnlyChatRegions
// ---------------------------------------------------------------------------

test('regions: both rows of the injected damage-buttons fragment are GM-only', () => {
  const html = card(PLAIN_ROLL_WITH_DAMAGE_BUTTONS)
  const regions = gmOnlyChatRegions(html)
  assert.equal(regions.length, 2)
  assert.ok(regions[0].querySelector('[data-action="setRollAsModifier"]'))
  assert.ok(regions[1].querySelector('[data-action="applyValue"]'), 'the unmarked apply row is included')
})

test('regions: a damage-buttons fragment with only the set-as-modifier row yields that row', () => {
  const regions = gmOnlyChatRegions(card(PLAIN_ROLL_SET_ONLY))
  assert.equal(regions.length, 1)
  assert.ok(regions[0].querySelector('[data-action="setRollAsModifier"]'))
})

test('regions: the applyValue row of damage.hbs that players see is not matched', () => {
  assert.deepEqual(gmOnlyChatRegions(card(DAMAGE_CARD_NO_TARGET)), [])
})

test('regions: cards without the damage-buttons anchor yield nothing', () => {
  for (const markup of [DAMAGE_CARD_WITH_TARGET, MELEE_INITIATOR, PLAIN_CARD]) {
    assert.deepEqual(gmOnlyChatRegions(card(markup)), [])
  }
})

test('regions: the dice-roll sibling of the fragment wrapper is not included', () => {
  const html = card(PLAIN_ROLL_WITH_DAMAGE_BUTTONS)
  assert.ok(gmOnlyChatRegions(html).every(el => el.classList.contains('coc7-card-buttons')))
})

// ---------------------------------------------------------------------------
// applyChatHighlights
// ---------------------------------------------------------------------------

/** Badges directly owned by an element (not by a nested marked descendant). */
const badgesOf = el => [...el.children].filter(c => c.matches(BADGE))

test('highlight: a card with nothing GM-only is left untouched and returns false', () => {
  const html = card(PLAIN_CARD)
  const before = html.outerHTML
  assert.equal(applyChatHighlights(html), false)
  assert.equal(html.outerHTML, before)
  assert.ok(!html.classList.contains(ROOT_CLASS))
})

test('highlight: the damage.hbs applyValue row players see gets no marker or badge', () => {
  const html = card(DAMAGE_CARD_NO_TARGET)
  assert.equal(applyChatHighlights(html), false)
  assert.equal(html.querySelectorAll(`.${MARKER_CLASS}`).length, 0)
  assert.equal(html.querySelectorAll(BADGE).length, 0)
})

test('highlight: both damage-buttons rows are marked with a prepended eye-slash badge', () => {
  const html = card(PLAIN_ROLL_WITH_DAMAGE_BUTTONS)
  assert.equal(applyChatHighlights(html), true)
  const rows = html.querySelectorAll('.coc7-card-buttons')
  assert.equal(rows.length, 2)
  for (const row of rows) {
    assert.ok(row.classList.contains(MARKER_CLASS))
    const badges = badgesOf(row)
    assert.equal(badges.length, 1, 'exactly one badge, even on the row that is also a keeper-only-block')
    assert.equal(row.firstElementChild, badges[0], 'badge is prepended')
    assert.ok(badges[0].classList.contains('fa-eye-slash'))
    assert.equal(badges[0].getAttribute('data-tooltip'), 'i18n:COC7QOL.GmVisibility.BadgeTooltip')
    assert.equal(badges[0].getAttribute('aria-label'), 'i18n:COC7QOL.GmVisibility.BadgeTooltip')
    assert.equal(badges[0].getAttribute('role'), 'img')
  }
  assert.ok(html.classList.contains(ROOT_CLASS))
})

test('highlight: keeper-only blocks get the marker and badge; their inner controls are skipped', () => {
  const html = card(DAMAGE_CARD_WITH_TARGET)
  assert.equal(applyChatHighlights(html), true)
  const blocks = html.querySelectorAll('.keeper-only-block')
  assert.equal(blocks.length, 2)
  for (const block of blocks) {
    assert.ok(block.classList.contains(MARKER_CLASS))
    assert.equal(badgesOf(block).length, 1)
    assert.ok(badgesOf(block)[0].classList.contains('fa-eye-slash'))
  }
  for (const control of html.querySelectorAll('.keeper-only-control')) {
    assert.ok(!control.classList.contains(READONLY_CLASS), 'hidden with its block, not read-only')
    assert.equal(control.querySelectorAll(BADGE).length, 0)
  }
})

test('highlight: owner-and-keeper blocks are ignored', () => {
  const html = card(DAMAGE_CARD_WITH_TARGET)
  applyChatHighlights(html)
  for (const el of html.querySelectorAll('.owner-and-keeper-block')) {
    assert.ok(!el.classList.contains(MARKER_CLASS))
    assert.ok(!el.classList.contains(READONLY_CLASS))
    assert.equal(el.querySelectorAll(BADGE).length, 0)
  }
})

test('highlight: a loose keeper-only-control button is read-only with an appended lock badge', () => {
  const html = card(RANGE_INITIATOR_OPTIONS)
  assert.equal(applyChatHighlights(html), true)
  const aiming = html.querySelector('[data-set="aiming"]')
  assert.ok(aiming.classList.contains(READONLY_CLASS))
  assert.ok(!aiming.classList.contains(MARKER_CLASS))
  const badges = badgesOf(aiming)
  assert.equal(badges.length, 1)
  assert.equal(aiming.lastElementChild, badges[0], 'badge is appended')
  assert.ok(badges[0].classList.contains('fa-lock'))
  assert.equal(badges[0].getAttribute('data-tooltip'), 'i18n:COC7QOL.GmVisibility.ReadOnlyTooltip')
  const singleShot = html.querySelector('[data-set="singleShot"]')
  assert.ok(!singleShot.classList.contains(READONLY_CLASS))
  assert.equal(singleShot.querySelectorAll(BADGE).length, 0)
  assert.ok(html.classList.contains(ROOT_CLASS))
})

test('highlight: a loose keeper-only-control slider is read-only but gets no badge', () => {
  const html = card(MELEE_INITIATOR)
  assert.equal(applyChatHighlights(html), true)
  const slider = html.querySelector('input.slider')
  assert.ok(slider.classList.contains(READONLY_CLASS))
  assert.equal(slider.children.length, 0)
  assert.equal(slider.parentElement.querySelectorAll(BADGE).length, 0)
  const block = html.querySelector('.keeper-only-block')
  assert.ok(block.classList.contains(MARKER_CLASS))
  assert.equal(badgesOf(block).length, 1)
})

test('highlight: a keeper-only block nested inside a rule region is not marked again', () => {
  // Hypothetical nesting (no shipped template does this today) pinning the insideMarkedRegion
  // guard: a keeper-only block placed inside the unmarked damage-buttons apply row.
  const html = card(PLAIN_ROLL_WITH_DAMAGE_BUTTONS)
  const applyRow = html.querySelector('[data-action="applyValue"]').parentElement
  applyRow.insertAdjacentHTML('beforeend',
    '<div class="keeper-only-block"><button class="keeper-only-control" data-action="x">X</button></div>')
  applyChatHighlights(html)
  const nested = applyRow.querySelector('.keeper-only-block')
  assert.ok(applyRow.classList.contains(MARKER_CLASS))
  assert.ok(!nested.classList.contains(MARKER_CLASS))
  assert.equal(nested.querySelectorAll(BADGE).length, 0)
  assert.ok(!nested.querySelector('.keeper-only-control').classList.contains(READONLY_CLASS))
})

test('highlight: a loose control inside a rule region is hidden with it, not read-only', () => {
  const html = card(PLAIN_ROLL_WITH_DAMAGE_BUTTONS)
  const applyBtn = html.querySelector('[data-action="applyValue"]')
  applyBtn.classList.add('keeper-only-control')
  applyChatHighlights(html)
  assert.ok(!applyBtn.classList.contains(READONLY_CLASS))
  assert.equal(applyBtn.querySelectorAll(BADGE).length, 0)
})

test('highlight: a second pass is a no-op and returns false', () => {
  for (const markup of [PLAIN_ROLL_WITH_DAMAGE_BUTTONS, DAMAGE_CARD_WITH_TARGET, MELEE_INITIATOR, RANGE_INITIATOR_OPTIONS]) {
    const html = card(markup)
    assert.equal(applyChatHighlights(html), true)
    const afterFirst = html.outerHTML
    assert.equal(applyChatHighlights(html), false)
    assert.equal(html.outerHTML, afterFirst)
  }
})

test('highlight: late-appended damage buttons are marked on a later pass', () => {
  // Mirrors the async render: the dice roll exists first, the fragment arrives after.
  const html = card(PLAIN_ROLL_WITH_DAMAGE_BUTTONS)
  const fragment = html.querySelector('.message-content > div:last-child')
  fragment.remove()
  assert.equal(applyChatHighlights(html), false)
  assert.ok(!html.classList.contains(ROOT_CLASS))
  html.querySelector('.message-content').append(fragment)
  assert.equal(applyChatHighlights(html), true)
  assert.ok(html.classList.contains(ROOT_CLASS))
  assert.equal(html.querySelectorAll(`.${MARKER_CLASS}`).length, 2)
})
