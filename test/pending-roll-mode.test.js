import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PENDING_TTL_MS, isCoC7Card, createPendingRollMode } from '../scripts/pending-roll-mode.js'

// CoC7 CARD_TYPE values (coc7/apps/roll-normalize.js, identical in 8.16 and 9.x).
const NORMAL = 'C/NO'
const COMBINED = 'C/CO'
const OPPOSED = 'C/OP'
const SAN_CHECK = 'C/SC'

const CHECK_CARD = { flags: { CoC7: { load: { as: 'CoC7Check', rollMode: 'public' } } } }
const WHISPER = { content: 'psst', whisper: ['gm-id'] }

/** A pending store driven by a fake clock the test advances by hand. */
function storeAt (start = 1000) {
  const clock = { now: start }
  const pending = createPendingRollMode({ now: () => clock.now })
  return { clock, pending }
}

test('isCoC7Card recognises the flag CoC7 writes on every check and SAN card', () => {
  assert.equal(isCoC7Card(CHECK_CARD), true)
  assert.equal(isCoC7Card({ flags: { CoC7: { load: {} } } }), true)
})

test('isCoC7Card rejects plain messages and other modules\' flags', () => {
  assert.equal(isCoC7Card(WHISPER), false)
  assert.equal(isCoC7Card({ flags: { CoC7: {} } }), false)
  assert.equal(isCoC7Card({ flags: { CoC7: { load: 'x' } } }), false)
  assert.equal(isCoC7Card({ flags: { 'dice-so-nice': { load: {} } } }), false)
  assert.equal(isCoC7Card(undefined), false)
  assert.equal(isCoC7Card(null), false)
})

test('nothing is consumed before the dialog arms a choice', () => {
  const { pending } = storeAt()
  assert.equal(pending.consume(CHECK_CARD), null)
})

test('an armed choice is applied to the next CoC7 card, then cleared', () => {
  const { pending } = storeAt()
  pending.arm({ choice: 'blindroll', cardType: NORMAL })
  assert.equal(pending.consume(CHECK_CARD), 'blindroll')
  assert.equal(pending.consume(CHECK_CARD), null, 'a follow-up card keeps its own mode')
})

test('a dialog without a card-type field still arms the choice', () => {
  const { pending } = storeAt()
  pending.arm({ choice: 'gmroll', cardType: undefined })
  assert.equal(pending.consume(CHECK_CARD), 'gmroll')
})

test('a SAN check card type arms the choice', () => {
  const { pending } = storeAt()
  pending.arm({ choice: 'gmroll', cardType: SAN_CHECK })
  assert.equal(pending.consume(CHECK_CARD), 'gmroll')
})

test('a non-CoC7 message neither takes the choice nor disarms it', () => {
  const { pending } = storeAt()
  pending.arm({ choice: 'publicroll', cardType: NORMAL })
  assert.equal(pending.consume(WHISPER), null, 'a whisper is left untouched')
  assert.equal(pending.consume(CHECK_CARD), 'publicroll', 'the check card that follows still gets it')
})

for (const [label, cardType] of [['Combined', COMBINED], ['Opposed', OPPOSED]]) {
  test(`a ${label} card type does not arm the choice`, () => {
    const { pending } = storeAt()
    pending.arm({ choice: 'publicroll', cardType })
    assert.equal(pending.consume(WHISPER), null)
    assert.equal(pending.consume(CHECK_CARD), null)
  })

  test(`a ${label} card type clears a choice armed earlier`, () => {
    const { pending } = storeAt()
    pending.arm({ choice: 'blindroll', cardType: NORMAL })
    pending.arm({ choice: 'blindroll', cardType })
    assert.equal(pending.consume(CHECK_CARD), null)
  })
}

test('an unknown choice is not armed', () => {
  const { pending } = storeAt()
  pending.arm({ choice: 'selfroll', cardType: NORMAL })
  assert.equal(pending.consume(CHECK_CARD), null)
})

test('a choice is still applied just before it expires', () => {
  const { clock, pending } = storeAt()
  pending.arm({ choice: 'gmroll', cardType: NORMAL })
  clock.now += PENDING_TTL_MS
  assert.equal(pending.consume(CHECK_CARD), 'gmroll')
})

test('an expired choice — e.g. a roll that failed after OK — never reaches a later card', () => {
  const { clock, pending } = storeAt()
  pending.arm({ choice: 'blindroll', cardType: NORMAL })
  clock.now += PENDING_TTL_MS + 1
  assert.equal(pending.consume(CHECK_CARD), null)
  clock.now -= PENDING_TTL_MS
  assert.equal(pending.consume(CHECK_CARD), null, 'expiry clears it for good')
})

test('re-arming replaces the choice and restarts the clock', () => {
  const { clock, pending } = storeAt()
  pending.arm({ choice: 'blindroll', cardType: NORMAL })
  clock.now += PENDING_TTL_MS
  pending.arm({ choice: 'gmroll', cardType: NORMAL })
  clock.now += PENDING_TTL_MS
  assert.equal(pending.consume(CHECK_CARD), 'gmroll')
})

test('the default clock is Date.now', () => {
  const pending = createPendingRollMode()
  pending.arm({ choice: 'gmroll', cardType: NORMAL })
  assert.equal(pending.consume(CHECK_CARD), 'gmroll')
})
