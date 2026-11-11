import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VISIBILITY_CHOICES, coreModeKey, choiceForCoreMode, visibilityUpdate } from '../scripts/roll-mode-keys.js'

// CONFIG.ChatMessage.modes on Foundry v14 (which also registers in-character).
const V14_MODES = { public: {}, gm: {}, blind: {}, self: {}, ic: {} }
// CONFIG.Dice.rollModes on Foundry v13.
const V13_MODES = { publicroll: 'CHAT.RollPublic', gmroll: 'CHAT.RollPrivate', blindroll: 'CHAT.RollBlind', selfroll: 'CHAT.RollSelf' }

test('the dropdown choices stay the legacy keys already persisted in client settings', () => {
  assert.deepEqual(VISIBILITY_CHOICES, ['publicroll', 'gmroll', 'blindroll'])
})

test('coreModeKey translates every choice to the v14 key when v14 modes are registered', () => {
  assert.equal(coreModeKey('publicroll', V14_MODES), 'public')
  assert.equal(coreModeKey('gmroll', V14_MODES), 'gm')
  assert.equal(coreModeKey('blindroll', V14_MODES), 'blind')
})

test('coreModeKey keeps the legacy key when only v13 roll modes are registered', () => {
  assert.equal(coreModeKey('publicroll', V13_MODES), 'publicroll')
  assert.equal(coreModeKey('gmroll', V13_MODES), 'gmroll')
  assert.equal(coreModeKey('blindroll', V13_MODES), 'blindroll')
})

test('coreModeKey prefers the v14 key when a registry carries both spellings', () => {
  assert.equal(coreModeKey('blindroll', { ...V13_MODES, ...V14_MODES }), 'blind')
})

test('coreModeKey returns null for a choice the registry does not offer', () => {
  assert.equal(coreModeKey('blindroll', { public: {}, gm: {} }), null)
  assert.equal(coreModeKey('selfroll', V14_MODES), null)
  assert.equal(coreModeKey('blindroll', undefined), null)
  assert.equal(coreModeKey(undefined, V14_MODES), null)
})

test('coreModeKey ignores inherited object properties', () => {
  assert.equal(coreModeKey('constructor', V14_MODES), null)
})

test('choiceForCoreMode maps both spellings of a mode back to the dropdown choice', () => {
  assert.equal(choiceForCoreMode('public'), 'publicroll')
  assert.equal(choiceForCoreMode('publicroll'), 'publicroll')
  assert.equal(choiceForCoreMode('gm'), 'gmroll')
  assert.equal(choiceForCoreMode('gmroll'), 'gmroll')
  assert.equal(choiceForCoreMode('blind'), 'blindroll')
  assert.equal(choiceForCoreMode('blindroll'), 'blindroll')
})

test('choiceForCoreMode returns null for modes the dropdown does not offer', () => {
  for (const mode of ['self', 'selfroll', 'ic', 'roll', '', undefined, null]) {
    assert.equal(choiceForCoreMode(mode), null, `mode ${String(mode)}`)
  }
})

// Stand-ins for core's mode logic: whisper the GMs unless public, blind for the blind key.
const GM = ['gm-1']
const recipientsFor = mode => ({ whisper: /^public/.test(mode) ? [] : GM, blind: /^blind/.test(mode) })

test('visibilityUpdate hands core the running version\'s key', () => {
  const seen = []
  const resolveRecipients = mode => { seen.push(mode); return recipientsFor(mode) }
  visibilityUpdate({ choice: 'blindroll', modes: V14_MODES, storedMode: undefined, resolveRecipients })
  visibilityUpdate({ choice: 'blindroll', modes: V13_MODES, storedMode: undefined, resolveRecipients })
  assert.deepEqual(seen, ['blind', 'blindroll'])
})

test('visibilityUpdate rewrites a stored CoC7 mode in the v14 vocabulary on v14', () => {
  // Regression: 'blindroll' written here made CoC7 9.x re-publish the card on its next update.
  const update = visibilityUpdate({ choice: 'blindroll', modes: V14_MODES, storedMode: 'public', resolveRecipients: recipientsFor })
  assert.deepEqual(update, { whisper: GM, blind: true, 'flags.CoC7.load.rollMode': 'blind' })
})

test('visibilityUpdate rewrites a stored CoC7 mode in the legacy vocabulary on v13', () => {
  const update = visibilityUpdate({ choice: 'gmroll', modes: V13_MODES, storedMode: 'publicroll', resolveRecipients: recipientsFor })
  assert.deepEqual(update, { whisper: GM, blind: false, 'flags.CoC7.load.rollMode': 'gmroll' })
})

test('visibilityUpdate never invents the CoC7 flag on a card that stores no mode', () => {
  const update = visibilityUpdate({ choice: 'publicroll', modes: V14_MODES, storedMode: undefined, resolveRecipients: recipientsFor })
  assert.deepEqual(update, { whisper: [], blind: false })
})

test('visibilityUpdate defaults missing recipients and blind state', () => {
  const update = visibilityUpdate({ choice: 'gmroll', modes: V14_MODES, storedMode: undefined, resolveRecipients: () => ({}) })
  assert.deepEqual(update, { whisper: [], blind: false })
})

test('visibilityUpdate returns null, without consulting core, when the choice is not registered', () => {
  const resolveRecipients = () => { throw new Error('must not be called') }
  assert.equal(visibilityUpdate({ choice: 'blindroll', modes: { public: {}, gm: {} }, storedMode: 'public', resolveRecipients }), null)
})

test('a choice survives the round trip through either registry', () => {
  for (const modes of [V13_MODES, V14_MODES]) {
    for (const choice of VISIBILITY_CHOICES) {
      assert.equal(choiceForCoreMode(coreModeKey(choice, modes)), choice)
    }
  }
})
