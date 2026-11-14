import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { CARD_STATE, cardActorName, cardState, closeCards, closeUpdate, listOpenCards, stripCardControls } from '../scripts/close-all-cards/card-closing.js'

/** Parse card content the way the feature does (DOMParser → body). */
function parse (html) {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document.body
}

const actions = root => [...root.querySelectorAll('button')].map(b => b.dataset.action + (b.dataset.set ? `:${b.dataset.set}` : ''))

// Shapes below follow CoC7 9.1's templates/chat/roll-result.hbs, opposed-roll.hbs,
// combined-roll.hbs, parts/roll-container.hbs and roll-standby.hbs.
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

// A rolled check whose difficulty the Keeper has not set yet: the first row is how they set it.
const UNKNOWN_DIFFICULTY_CARD = `
  <div class="keeper-only-block coc7-card-buttons coc7-half-buttons flexrow">
    <button class="" data-action="setValue" data-set="difficulty" data-value="1">Regular 45%</button>
    <button class="" data-action="setValue" data-set="difficulty" data-value="2">Hard 22%</button>
    <button class="" data-action="setValue" data-set="difficulty" data-value="3">Extreme 9%</button>
    <button class="" data-action="setValue" data-set="difficulty" data-value="4">Critical 1%</button>
  </div>
  <div class="dice-roll">
    <div class="owner-and-keeper-block coc7-card-buttons flexrow" data-actor-uuid="Actor.a1">
      <button data-action="bonus" data-quantity="1">Add one bonus die</button>
    </div>
    <h4 class="dice-total">31</h4>
  </div>
  <div class="keeper-only-block coc7-card-buttons flexrow">
    <button data-action="toggleValue" data-set="cardOpen">Close card</button>
  </div>`

// A combined roll with every die rolled: the outcome is known and the card can be closed.
const RESOLVED_COMBINED_CARD = `
  <div class="keeper-only-block coc7-card-buttons flexrow">
    <button class=" switched-on" data-action="setValue" data-set="combinedType" data-value="any">Any</button>
    <button class="" data-action="setValue" data-set="combinedType" data-value="all">All</button>
  </div>
  <div class="coc7-group-actor-roll flexrow">
    <div class="roll-details">
      <div class="owner-and-keeper-block coc7-card-buttons flexrow" data-actor-uuid="Actor.a1">
        <button data-action="push">Push</button>
      </div>
    </div>
  </div>
  <div class="dice-roll"><h4 class="dice-total success-regular">Success</h4></div>
  <div class="keeper-only-block coc7-card-buttons flexrow">
    <button data-action="toggleValue" data-set="cardOpen">Close card</button>
  </div>`

// An opposed roll both sides have joined but nobody has rolled: no Close card button yet.
const UNFINISHED_OPPOSED_CARD = `
  <div class="keeper-only-block coc7-card-buttons flexrow">
    <button class="" data-action="toggleValue" data-set="isCombat">Opposed roll</button>
  </div>
  <div class="coc7-group-actor-roll flexrow attacker">
    <div class="actor-portrait flexcol" data-actor-uuid="Actor.a1">
      <div class="coc7-card-buttons flexrow">
        <button class="keeper-only-control" data-action="participant">Attacker</button>
      </div>
    </div>
  </div>
  <div class="keeper-only-block coc7-card-buttons flexrow">
    <button data-action="rollNoPlayers">Start rolls</button>
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

test('stripCardControls keeps the difficulty buttons of an unknown-difficulty check', () => {
  const root = parse(UNKNOWN_DIFFICULTY_CARD)
  assert.equal(stripCardControls(root), true)
  // The Keeper still has to say how hard the roll was; the system keeps this row on a closed card.
  assert.deepEqual(actions(root), ['setValue:difficulty', 'setValue:difficulty', 'setValue:difficulty', 'setValue:difficulty'])
  assert.equal(root.querySelectorAll('.coc7-card-buttons').length, 1)
})

test('stripCardControls closes a resolved combined card', () => {
  const root = parse(RESOLVED_COMBINED_CARD)
  assert.equal(stripCardControls(root), true)
  assert.deepEqual(actions(root), [])
  assert.ok(root.querySelector('h4.dice-total.success-regular'))
})

test('stripCardControls leaves an opposed card without a Close card button untouched', () => {
  const root = parse(UNFINISHED_OPPOSED_CARD)
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

const NAMES = { 'Actor.a1': 'Sir Duncan', 'Scene.s1.Token.t1.Actor.a2': 'Byakhee' }
const resolveName = uuid => NAMES[uuid]

test('cardActorName prefers the speaker alias', () => {
  assert.equal(cardActorName({ speakerAlias: 'Token Name', actorUuids: ['Actor.a1'], resolveName }), 'Token Name')
})

test('cardActorName falls back to the card\'s actor when CoC7 stripped the speaker', () => {
  assert.equal(cardActorName({ speakerAlias: undefined, actorUuids: ['Actor.a1'], resolveName }), 'Sir Duncan')
  assert.equal(cardActorName({ speakerAlias: '', actorUuids: ['Scene.s1.Token.t1.Actor.a2'], resolveName }), 'Byakhee')
})

test('cardActorName lists every actor of a multi-actor card once', () => {
  const actorUuids = ['Actor.a1', 'Scene.s1.Token.t1.Actor.a2', 'Actor.a1']
  assert.equal(cardActorName({ actorUuids, resolveName }), 'Sir Duncan, Byakhee')
})

test('cardActorName skips actors that no longer resolve and returns null when none is left', () => {
  assert.equal(cardActorName({ actorUuids: ['Actor.gone', 'Actor.a1'], resolveName }), 'Sir Duncan')
  assert.equal(cardActorName({ actorUuids: ['Actor.gone'], resolveName }), null)
  assert.equal(cardActorName({ actorUuids: [], resolveName }), null)
  assert.equal(cardActorName({ actorUuids: [undefined, null, 42], resolveName }), null)
  assert.equal(cardActorName({ resolveName }), null)
})

test('cardActorName survives a resolver that throws', () => {
  const throwing = () => { throw new Error('bad uuid') }
  assert.equal(cardActorName({ actorUuids: ['Actor.a1'], resolveName: throwing }), null)
})

// --- cardState -----------------------------------------------------------------

test('cardState is resolved when the card shows the Close card button', () => {
  assert.equal(cardState({ as: 'CoC7Check', isStandby: false }, parse(OPEN_CHECK_CARD)), CARD_STATE.RESOLVED)
  assert.equal(cardState({ as: 'CoC7Check', isStandby: false }, parse(UNKNOWN_DIFFICULTY_CARD)), CARD_STATE.RESOLVED)
  assert.equal(cardState({ as: 'CoC7ChatCombinedMessage' }, parse(RESOLVED_COMBINED_CARD)), CARD_STATE.RESOLVED)
  assert.equal(cardState({ as: 'CoC7ChatOpposedMessage' }, parse(OPEN_OPPOSED_CARD)), CARD_STATE.RESOLVED)
})

test('cardState is pending for a standby check waiting on its Roll click', () => {
  assert.equal(cardState({ as: 'CoC7Check', isStandby: true }, parse(STANDBY_CARD)), CARD_STATE.PENDING)
})

test('cardState is in progress for an unfinished card that is not a standby check', () => {
  assert.equal(cardState({ as: 'CoC7ChatOpposedMessage' }, parse(UNFINISHED_OPPOSED_CARD)), CARD_STATE.IN_PROGRESS)
  assert.equal(cardState({ as: 'CoC7SanCheckCard' }, parse('<button data-action="rollSanCheck">Sanity check</button>')), CARD_STATE.IN_PROGRESS)
})

// --- listOpenCards -------------------------------------------------------------

const KEYS = key => `[${key}]`
const message = (id, load, { speaker = {}, content = OPEN_CHECK_CARD } = {}) => ({ id, timestamp: 0, speaker, content, flags: { CoC7: { load } } })
const listDeps = { resolveName: uuid => ({ 'Actor.a': 'Harvey', 'Actor.b': 'Ruth' })[uuid], localize: KEYS, formatTime: () => '10:00', parseHtml: parse }

test('listOpenCards lists only the cards whose load flag says they are open', () => {
  const messages = [
    message('m1', { as: 'CoC7Check', cardOpen: true, actorUuid: 'Actor.a' }),
    message('m2', { as: 'CoC7Check', cardOpen: false, actorUuid: 'Actor.a' }),
    message('m3', undefined),
    { id: 'm4', flags: {} }
  ]

  assert.deepEqual(listOpenCards(messages, listDeps).map(c => c.messageId), ['m1'])
})

test('listOpenCards skips the card types whose open flag CoC7 never clears', () => {
  // On an existing world these would otherwise list every combat and chase card ever posted.
  const alwaysOpen = ['CoC7ChatChaseObstacle', 'CoC7ChatCombatMelee', 'CoC7ChatCombatRanged', 'CoC7ChatDamage', 'CoC7ConCheck', 'SomethingNew']
  const messages = alwaysOpen.map((as, index) => message(`m${index}`, { as, cardOpen: true, actorUuid: 'Actor.a' }))

  assert.deepEqual(listOpenCards(messages, listDeps), [])
})

test('listOpenCards names the card type, the actor, the time and the state', () => {
  const [card] = listOpenCards([message('m1', { as: 'CoC7SanCheckCard', cardOpen: true, actorUuid: 'Actor.a' }, { content: '<button data-action="rollSanCheck">Sanity check</button>' })], listDeps)

  assert.deepEqual(card, {
    messageId: 'm1',
    type: '[COC7QOL.CloseAllCards.CardType.SanityCheck]',
    actor: 'Harvey',
    timestamp: '10:00',
    state: CARD_STATE.IN_PROGRESS,
    stateLabel: '[COC7QOL.CloseAllCards.State.InProgress]'
  })
})

test('listOpenCards tells a finished check from a standby one', () => {
  const cards = listOpenCards([
    message('m1', { as: 'CoC7Check', cardOpen: true, isStandby: false, actorUuid: 'Actor.a' }),
    message('m2', { as: 'CoC7Check', cardOpen: true, isStandby: true, actorUuid: 'Actor.a' }, { content: STANDBY_CARD })
  ], listDeps)

  assert.deepEqual(cards.map(c => c.state), [CARD_STATE.RESOLVED, CARD_STATE.PENDING])
})

test('listOpenCards survives a card without content', () => {
  const [card] = listOpenCards([{ id: 'm1', timestamp: 0, flags: { CoC7: { load: { as: 'CoC7Check', cardOpen: true } } } }], listDeps)

  assert.equal(card.state, CARD_STATE.IN_PROGRESS)
})

test('listOpenCards uses the actorUuids of a multi-actor card', () => {
  const [card] = listOpenCards([message('m1', { as: 'CoC7ChatOpposedMessage', cardOpen: true, actorUuids: ['Actor.a', 'Actor.b'] })], listDeps)

  assert.equal(card.actor, 'Harvey, Ruth')
})

test('listOpenCards prefers the speaker alias over the card flags', () => {
  const [card] = listOpenCards([message('m1', { as: 'CoC7Check', cardOpen: true, actorUuid: 'Actor.a' }, { speaker: { alias: 'The Keeper' } })], listDeps)

  assert.equal(card.actor, 'The Keeper')
})

test('listOpenCards falls back to the unknown actor label', () => {
  const [card] = listOpenCards([message('m1', { as: 'CoC7Check', cardOpen: true })], listDeps)

  assert.equal(card.actor, '[COC7QOL.CloseAllCards.UnknownActor]')
})

// --- closeUpdate ---------------------------------------------------------------

test('closeUpdate closes a finished card by flag and stripped content', () => {
  const update = closeUpdate({ id: 'm1', content: OPEN_CHECK_CARD }, parse)

  assert.equal(update._id, 'm1')
  assert.equal(update['flags.CoC7.load.cardOpen'], false)
  assert.equal(parse(update.content).querySelectorAll('button').length, 0)
})

test('closeUpdate only flips the flag of an unfinished card', () => {
  assert.deepEqual(closeUpdate({ id: 'm1', content: UNFINISHED_OPPOSED_CARD }, parse), { _id: 'm1', 'flags.CoC7.load.cardOpen': false })
  assert.deepEqual(closeUpdate({ id: 'm2' }, parse), { _id: 'm2', 'flags.CoC7.load.cardOpen': false })
})

// --- closeCards ----------------------------------------------------------------

const card = (messageId, state) => ({ messageId, state })

test('closeCards lets the system close finished cards and bulk-closes the rest', async () => {
  const calls = { system: [], bulk: [] }
  const result = await closeCards([card('m1', CARD_STATE.RESOLVED), card('m2', CARD_STATE.IN_PROGRESS), card('m3', CARD_STATE.PENDING)], {
    systemClose: async id => { calls.system.push(id); return true },
    bulkClose: async ids => { calls.bulk.push(ids); return ids }
  })

  assert.deepEqual(calls, { system: ['m1'], bulk: [['m2', 'm3']] })
  assert.deepEqual(result, { closed: ['m1', 'm2', 'm3'], failed: [] })
})

test('closeCards makes no bulk update when the system closed everything', async () => {
  let bulkCalls = 0
  const result = await closeCards([card('m1', CARD_STATE.RESOLVED)], {
    systemClose: async () => true,
    bulkClose: async ids => { bulkCalls++; return ids }
  })

  assert.equal(bulkCalls, 0)
  assert.deepEqual(result, { closed: ['m1'], failed: [] })
})

test('closeCards falls back to the bulk update for a card the system did not close', async () => {
  const bulk = []
  const result = await closeCards([card('m1', CARD_STATE.RESOLVED), card('m2', CARD_STATE.RESOLVED), card('m3', CARD_STATE.RESOLVED)], {
    systemClose: async id => {
      if (id === 'm2') return false
      if (id === 'm3') throw new Error('render failed')
      return true
    },
    bulkClose: async ids => { bulk.push(ids); return ids }
  })

  assert.deepEqual(bulk, [['m2', 'm3']])
  assert.deepEqual(result, { closed: ['m1', 'm2', 'm3'], failed: [] })
})

test('closeCards reports a rejected bulk update instead of throwing', async () => {
  const boom = new Error('permission denied')
  const result = await closeCards([card('m1', CARD_STATE.RESOLVED), card('m2', CARD_STATE.IN_PROGRESS)], {
    systemClose: async () => true,
    bulkClose: async () => { throw boom }
  })

  assert.deepEqual(result, { closed: ['m1'], failed: ['m2'], error: boom })
})

test('closeCards reports the cards a bulk update left open', async () => {
  const result = await closeCards([card('m1', CARD_STATE.IN_PROGRESS), card('m2', CARD_STATE.IN_PROGRESS)], {
    systemClose: async () => true,
    bulkClose: async () => ['m1']
  })

  assert.deepEqual(result, { closed: ['m1'], failed: ['m2'] })
})
