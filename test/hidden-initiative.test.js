import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideInitiativeVisibility, findCombatant, gmModeKey } from '../scripts/hidden-initiative/visibility.js'

const GM = ['gm-1']
const V14_MODES = { public: {}, gm: {}, blind: {}, self: {} }
const V13_MODES = { publicroll: {}, gmroll: {}, blindroll: {}, selfroll: {} }

function combatant ({ tokenId = 't1', actorId = 'a1', hidden = false, tokenHidden = false } = {}) {
  return { tokenId, actorId, hidden, token: { hidden: tokenHidden } }
}

/** A CoC7 initiative card as it reaches preCreateChatMessage (CoC7 8.15, Foundry v14). coc7Mode: null = no CoC7 flag. */
function initiativeMessage ({ token = 't1', actor = 'a1', whisper = [], blind = false, coc7Mode = 'public', initiative = true } = {}) {
  const flags = {}
  if (initiative) flags.core = { initiativeRoll: true }
  if (coc7Mode !== null) flags.CoC7 = { load: { rollMode: coc7Mode } }
  return { speaker: { token, actor, alias: 'Byakhee' }, whisper, blind, flags }
}

function decide (overrides = {}) {
  return decideInitiativeVisibility({
    message: initiativeMessage(),
    combats: [{ combatants: [combatant({ hidden: true })] }],
    gmIds: GM,
    modes: V14_MODES,
    rollMode: 'public',
    ...overrides
  })
}

test('whispers a hidden combatant\'s initiative roll to the GMs and rewrites the CoC7 roll-mode flag', () => {
  const decision = decide()

  assert.equal(decision.kind, 'whisper')
  assert.deepEqual(decision.update, { whisper: GM, blind: false, 'flags.CoC7.load.rollMode': 'gm' })
})

test('includes every GM user in the whisper', () => {
  const decision = decide({ gmIds: ['gm-1', 'gm-2'] })

  assert.deepEqual(decision.update.whisper, ['gm-1', 'gm-2'])
})

test('uses the v13 "gmroll" key when only the legacy roll modes are registered', () => {
  const decision = decide({ modes: V13_MODES })

  assert.equal(decision.update['flags.CoC7.load.rollMode'], 'gmroll')
})

test('does not add a CoC7 flag the message does not already carry', () => {
  const decision = decide({ message: initiativeMessage({ coc7Mode: null }) })

  assert.equal(decision.kind, 'whisper')
  assert.deepEqual(decision.update, { whisper: GM, blind: false })
})

test('leaves a visible combatant\'s roll public', () => {
  const decision = decide({ combats: [{ combatants: [combatant({ hidden: false })] }] })

  assert.equal(decision.kind, 'ignore')
})

test('a token hidden on the canvas counts as hidden even if the tracker shows it', () => {
  const decision = decide({ combats: [{ combatants: [combatant({ hidden: false, tokenHidden: true })] }] })

  assert.equal(decision.kind, 'whisper')
})

test('a combatant hidden in the tracker counts as hidden even if the token is visible', () => {
  const decision = decide({ combats: [{ combatants: [combatant({ hidden: true, tokenHidden: false })] }] })

  assert.equal(decision.kind, 'whisper')
})

test('ignores chat messages that are not initiative rolls', () => {
  const decision = decide({ message: initiativeMessage({ initiative: false }) })

  assert.equal(decision.kind, 'ignore')
})

test('ignores an initiative roll whose speaker is not in any combat', () => {
  const decision = decide({ message: initiativeMessage({ token: 'other', actor: 'other' }) })

  assert.equal(decision.kind, 'ignore')
})

test('reports "no-gm" instead of silently leaving the roll public when there is no GM', () => {
  const decision = decide({ gmIds: [] })

  assert.equal(decision.kind, 'no-gm')
})

test('never loosens: an already-whispered roll is left alone and flagged redundant under a public roll mode', () => {
  const decision = decide({ message: initiativeMessage({ whisper: ['gm-1'], coc7Mode: 'gm' }) })

  assert.equal(decision.kind, 'redundant')
})

test('never loosens: a blind roll is left alone', () => {
  const decision = decide({ message: initiativeMessage({ whisper: ['gm-1'], blind: true, coc7Mode: 'blind' }) })

  assert.equal(decision.kind, 'redundant')
})

test('an already-private roll that this module itself retargeted is not redundancy', () => {
  const decision = decide({ message: initiativeMessage({ whisper: ['gm-1'], coc7Mode: 'gm' }), handledByModule: true })

  assert.equal(decision.kind, 'ignore')
})

test('an already-private roll under a private roll mode is simply the user\'s choice, not redundancy', () => {
  const decision = decide({ message: initiativeMessage({ whisper: ['gm-1'], coc7Mode: 'gm' }), rollMode: 'gm' })

  assert.equal(decision.kind, 'ignore')
})

test('accepts whisper recipients as a Set', () => {
  const decision = decide({ message: initiativeMessage({ whisper: new Set(['gm-1']), coc7Mode: 'gm' }) })

  assert.equal(decision.kind, 'redundant')
})

test('findCombatant matches by token first, then falls back to the actor for linked actors', () => {
  const byToken = combatant({ tokenId: 't1', actorId: 'other' })
  const byActor = combatant({ tokenId: 'elsewhere', actorId: 'a1' })

  assert.equal(findCombatant({ token: 't1', actor: 'a1' }, [{ combatants: [byActor, byToken] }]), byToken)
  assert.equal(findCombatant({ token: null, actor: 'a1' }, [{ combatants: [byToken, byActor] }]), byActor)
  assert.equal(findCombatant({ token: 'nope', actor: 'nope' }, [{ combatants: [byToken, byActor] }]), null)
  assert.equal(findCombatant(null, [{ combatants: [byToken] }]), null)
})

test('findCombatant honours combat order so the active combat wins', () => {
  const inActive = combatant({ hidden: true })
  const inOther = combatant({ hidden: false })

  assert.equal(findCombatant({ token: 't1', actor: 'a1' }, [{ combatants: [inActive] }, { combatants: [inOther] }]), inActive)
  assert.equal(findCombatant({ token: 't1', actor: 'a1' }, [{ combatants: [inOther] }, { combatants: [inActive] }]), inOther)
})

test('gmModeKey resolves the GM mode on v14 and v13, and null when neither is registered', () => {
  assert.equal(gmModeKey(V14_MODES), 'gm')
  assert.equal(gmModeKey(V13_MODES), 'gmroll')
  assert.equal(gmModeKey({}), null)
  assert.equal(gmModeKey(undefined), null)
})
