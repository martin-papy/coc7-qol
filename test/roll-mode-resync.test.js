import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DECISION_TTL_MS,
  DEFERRED_TICK_TTL_MS,
  createDevelopmentGuard,
  findRefreshEntry,
  isAppliedDevelopmentFlag,
  isDevelopmentTick,
  resyncFor
} from '../scripts/roll-mode-resync.js'

const SKILL = 'Actor.a1.Item.s1'
const check = (overrides = {}) => ({ as: 'CoC7Check', isStandby: false, rollMode: 'public', type: 'skill', key: SKILL, ...overrides })

// What CoC7 hands to the preUpdate hooks (traced on Foundry v14 with CoC7 9.1).
const TICK = { system: { flags: { developement: true } }, _id: 's1' }
const APPLIED = { flags: { CoC7: { load: { appliedDevelopment: true } } }, _id: 'm1' }

// --- resyncFor -----------------------------------------------------------------

test('resyncFor asks for a resync when a public check is sent blind, and guards its skill', () => {
  assert.deepEqual(resyncFor({ load: check(), mode: 'blind', blindMode: 'blind' }), { toBlind: true, skillUuid: SKILL })
})

test('resyncFor uses the running version\'s key for blind', () => {
  assert.deepEqual(resyncFor({ load: check({ rollMode: 'publicroll' }), mode: 'blindroll', blindMode: 'blindroll' }), { toBlind: true, skillUuid: SKILL })
})

test('resyncFor asks for a resync without a guard when a blind check is sent public or private', () => {
  assert.deepEqual(resyncFor({ load: check({ rollMode: 'blind' }), mode: 'public', blindMode: 'blind' }), { toBlind: false, skillUuid: null })
  assert.deepEqual(resyncFor({ load: check({ rollMode: 'blind' }), mode: 'gm', blindMode: 'blind' }), { toBlind: false, skillUuid: null })
})

test('resyncFor leaves a check alone when its blindness does not change', () => {
  assert.equal(resyncFor({ load: check(), mode: 'gm', blindMode: 'blind' }), null)
  assert.equal(resyncFor({ load: check({ rollMode: 'self' }), mode: 'public', blindMode: 'blind' }), null)
  assert.equal(resyncFor({ load: check({ rollMode: 'blind' }), mode: 'blind', blindMode: 'blind' }), null)
})

test('resyncFor leaves a standby card alone: CoC7 rebuilds it from its flags when it is rolled', () => {
  assert.equal(resyncFor({ load: check({ isStandby: true }), mode: 'blind', blindMode: 'blind' }), null)
})

test('resyncFor only handles checks', () => {
  assert.equal(resyncFor({ load: check({ as: 'CoC7SanCheckCard' }), mode: 'blind', blindMode: 'blind' }), null)
  assert.equal(resyncFor({ load: undefined, mode: 'blind', blindMode: 'blind' }), null)
  assert.equal(resyncFor({ load: 'nope', mode: 'blind', blindMode: 'blind' }), null)
})

test('resyncFor needs a stored mode, a new mode and a blind key', () => {
  assert.equal(resyncFor({ load: check({ rollMode: undefined }), mode: 'blind', blindMode: 'blind' }), null)
  assert.equal(resyncFor({ load: check(), mode: undefined, blindMode: 'blind' }), null)
  assert.equal(resyncFor({ load: check(), mode: 'blind', blindMode: null }), null)
})

test('resyncFor guards no skill for a roll CoC7 never ticks', () => {
  assert.deepEqual(resyncFor({ load: check({ type: 'item', key: 'Actor.a1.Item.w1' }), mode: 'blind', blindMode: 'blind' }), { toBlind: true, skillUuid: null })
  assert.deepEqual(resyncFor({ load: check({ type: 'characteristic', key: 'str' }), mode: 'blind', blindMode: 'blind' }), { toBlind: true, skillUuid: null })
  assert.deepEqual(resyncFor({ load: check({ key: undefined }), mode: 'blind', blindMode: 'blind' }), { toBlind: true, skillUuid: null })
})

// --- update shapes ---------------------------------------------------------------

test('isDevelopmentTick matches the tick and nothing else', () => {
  assert.equal(isDevelopmentTick(TICK), true)
  assert.equal(isDevelopmentTick({ system: { flags: { developement: true } } }), true)
  assert.equal(isDevelopmentTick({ system: { flags: { developement: false } } }), false)
  assert.equal(isDevelopmentTick({ system: { flags: { developement: true }, value: 55 } }), false)
  assert.equal(isDevelopmentTick({ name: 'Renamed', system: { flags: { developement: true } } }), false)
  assert.equal(isDevelopmentTick({}), false)
  assert.equal(isDevelopmentTick(undefined), false)
})

test('isAppliedDevelopmentFlag matches the card flag and nothing else', () => {
  assert.equal(isAppliedDevelopmentFlag(APPLIED), true)
  assert.equal(isAppliedDevelopmentFlag({ flags: { CoC7: { load: { appliedDevelopment: false } } } }), false)
  // CoC7's Refresh writes the flag together with the card: that update must go through.
  assert.equal(isAppliedDevelopmentFlag({ content: '<p>card</p>', flags: { CoC7: { load: { appliedDevelopment: true } } } }), false)
  assert.equal(isAppliedDevelopmentFlag(null), false)
})

// --- createDevelopmentGuard ------------------------------------------------------

function guardAt (start = 1000) {
  const clock = { now: start }
  const guard = createDevelopmentGuard({ now: () => clock.now })
  return { guard, clock }
}

test('the guard refuses the tick, then the card flag (order without Dice So Nice)', () => {
  const { guard } = guardAt()
  guard.arm(SKILL)
  guard.attach('m1')

  assert.equal(guard.refusesItemUpdate(SKILL, TICK), true)
  assert.equal(guard.refusesMessageUpdate('m1', APPLIED), true)
})

test('the guard refuses the card flag, then the delayed tick (order with Dice So Nice)', () => {
  const { guard, clock } = guardAt()
  guard.arm(SKILL)
  guard.attach('m1')

  assert.equal(guard.refusesMessageUpdate('m1', APPLIED), true)
  clock.now += DECISION_TTL_MS + 10_000 // the dice animation
  assert.equal(guard.refusesItemUpdate(SKILL, TICK), true)
})

test('the guard refuses each write once: a tick made on purpose afterwards goes through', () => {
  const { guard } = guardAt()
  guard.arm(SKILL)
  guard.attach('m1')
  guard.refusesItemUpdate(SKILL, TICK)
  guard.refusesMessageUpdate('m1', APPLIED)

  assert.equal(guard.refusesItemUpdate(SKILL, TICK), false)
  assert.equal(guard.refusesMessageUpdate('m1', APPLIED), false)
})

test('the guard only matches its own skill and its own message', () => {
  const { guard } = guardAt()
  guard.arm(SKILL)
  guard.attach('m1')

  assert.equal(guard.refusesItemUpdate('Actor.a1.Item.other', TICK), false)
  assert.equal(guard.refusesMessageUpdate('m2', APPLIED), false)
  assert.equal(guard.refusesItemUpdate(SKILL, { system: { value: 60 } }), false)
  assert.equal(guard.refusesMessageUpdate('m1', { content: '<p>card</p>' }), false)
  // Still armed for the real thing.
  assert.equal(guard.refusesItemUpdate(SKILL, TICK), true)
})

test('the guard does not refuse the card flag before it knows the message', () => {
  const { guard } = guardAt()
  guard.arm(SKILL)

  assert.equal(guard.refusesMessageUpdate('m1', APPLIED), false)
})

test('the guard gives up when CoC7 decided not to tick', () => {
  const { guard, clock } = guardAt()
  guard.arm(SKILL)
  guard.attach('m1')
  clock.now += DECISION_TTL_MS + 1

  // A failed roll: nothing came. The player ticking the box by hand must not be swallowed.
  assert.equal(guard.refusesItemUpdate(SKILL, TICK), false)
  assert.equal(guard.refusesMessageUpdate('m1', APPLIED), false)
})

test('the guard does not count the wait for the server against CoC7\'s decision', () => {
  const { guard, clock } = guardAt()
  guard.arm(SKILL)
  clock.now += DECISION_TTL_MS - 1 // a slow round trip
  guard.attach('m1')
  clock.now += DECISION_TTL_MS - 1

  assert.equal(guard.refusesItemUpdate(SKILL, TICK), true)
})

test('the guard gives up on a message that is never created', () => {
  const { guard, clock } = guardAt()
  guard.arm(SKILL)
  clock.now += DECISION_TTL_MS + 1
  guard.attach('m1')

  assert.equal(guard.refusesItemUpdate(SKILL, TICK), false)
  assert.equal(guard.refusesMessageUpdate('m1', APPLIED), false)
})

test('the guard waits for the delayed tick from the moment the card flag was refused', () => {
  const { guard, clock } = guardAt()
  guard.arm(SKILL)
  guard.attach('m1')
  clock.now += DECISION_TTL_MS - 1
  guard.refusesMessageUpdate('m1', APPLIED)
  clock.now += DEFERRED_TICK_TTL_MS - 1

  assert.equal(guard.refusesItemUpdate(SKILL, TICK), true)
})

test('the guard stops waiting for a delayed tick that never comes', () => {
  const { guard, clock } = guardAt()
  guard.arm(SKILL)
  guard.attach('m1')
  guard.refusesMessageUpdate('m1', APPLIED)
  clock.now += DEFERRED_TICK_TTL_MS + 1

  assert.equal(guard.refusesItemUpdate(SKILL, TICK), false)
})

test('clear drops the guard, and arm replaces it', () => {
  const { guard } = guardAt()
  guard.arm(SKILL)
  guard.attach('m1')
  guard.clear()
  assert.equal(guard.refusesItemUpdate(SKILL, TICK), false)

  guard.arm(SKILL)
  guard.arm('Actor.a1.Item.s2')
  assert.equal(guard.refusesItemUpdate(SKILL, TICK), false)
  assert.equal(guard.refusesItemUpdate('Actor.a1.Item.s2', TICK), true)
})

test('an unarmed guard refuses nothing', () => {
  const { guard } = guardAt()
  guard.attach('m1')

  assert.equal(guard.refusesItemUpdate(SKILL, TICK), false)
  assert.equal(guard.refusesMessageUpdate('m1', APPLIED), false)
})

// --- findRefreshEntry ------------------------------------------------------------

const ICON = '<i class="fa-solid fa-arrow-rotate-left"></i>'

test('findRefreshEntry finds CoC7\'s entry on Foundry v13 (name) and v14 (label)', () => {
  const v13 = { name: 'Refresh', icon: ICON, condition: () => true, callback: () => true }
  const v14 = { label: 'Refresh', icon: ICON, visible: () => true, callback: () => true, onClick: () => true }

  assert.equal(findRefreshEntry([{ name: 'Delete', icon: '<i class="fa-solid fa-trash"></i>', callback: () => {} }, v13]), v13)
  assert.equal(findRefreshEntry([v14]), v14)
})

test('findRefreshEntry returns null when the entry is missing or not callable', () => {
  assert.equal(findRefreshEntry([]), null)
  assert.equal(findRefreshEntry(undefined), null)
  assert.equal(findRefreshEntry([null, { name: 'Refresh', icon: ICON }]), null)
  assert.equal(findRefreshEntry([{ name: 'Refresh', icon: '<i class="fa-solid fa-rotate"></i>', callback: () => {} }]), null)
})
