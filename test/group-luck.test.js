import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCandidates, resolveRoller } from '../scripts/group-luck/candidates.js'

const PLAYERS = [
  { id: 'u1', isActive: true, characterId: 'a1' },   // connected, assigned character
  { id: 'u2', isActive: true, characterId: null },    // connected, none assigned
  { id: 'u3', isActive: false, characterId: 'a5' }    // offline
]
const INVESTIGATORS = [
  { id: 'a1', name: 'Harvey', luck: 35, ownerIds: ['u1'] },
  { id: 'a2', name: 'Old Pete', luck: 20, ownerIds: ['u1'] },   // u1's spare
  { id: 'a3', name: 'Ada', luck: 50, ownerIds: ['u2'] },
  { id: 'a4', name: 'Thomas', luck: 65, ownerIds: ['u2'] },
  { id: 'a5', name: 'Edith', luck: 30, ownerIds: ['u3'] },
  { id: 'a6', name: 'Draft', luck: NaN, ownerIds: ['u1'] },      // no Luck yet
  { id: 'a7', name: 'Keeper PC', luck: 40, ownerIds: [] }        // no player owner
]
const ids = list => list.map(c => c.id)
const byId = (list, id) => list.find(c => c.id === id)

test('buildCandidates lists defaults first, then the others, each by Luck ascending', () => {
  const candidates = buildCandidates(INVESTIGATORS, PLAYERS, { locale: 'en' })
  assert.deepEqual(ids(candidates), ['a1', 'a3', 'a4', 'a2', 'a5'])
})

test('buildCandidates ticks the assigned character, or every owned investigator when none is assigned', () => {
  const candidates = buildCandidates(INVESTIGATORS, PLAYERS, { locale: 'en' })
  assert.deepEqual(ids(candidates.filter(c => c.isDefault)), ['a1', 'a3', 'a4'])
  assert.equal(byId(candidates, 'a2').isDefault, false)   // spare of a player with an assigned character
  assert.equal(byId(candidates, 'a5').isDefault, false)   // offline player's assigned character
})

test('buildCandidates flags a row online when at least one owner is connected', () => {
  const candidates = buildCandidates(INVESTIGATORS, PLAYERS, { locale: 'en' })
  assert.equal(byId(candidates, 'a2').isOnline, true)
  assert.equal(byId(candidates, 'a5').isOnline, false)
})

test('buildCandidates falls back to owned investigators when the assigned character is not listed', () => {
  const players = [{ id: 'u1', isActive: true, characterId: 'npc9' }]
  const candidates = buildCandidates(INVESTIGATORS, players, { locale: 'en' })
  assert.deepEqual(ids(candidates.filter(c => c.isDefault)), ['a2', 'a1'])
})

test('buildCandidates keeps Luck 0 and drops a Luck that is not a number', () => {
  const investigators = [
    { id: 'z', name: 'Zero', luck: 0, ownerIds: ['u2'] },
    { id: 'n', name: 'Null', luck: null, ownerIds: ['u2'] }
  ]
  assert.deepEqual(ids(buildCandidates(investigators, PLAYERS, { locale: 'en' })), ['z'])
})

test('buildCandidates orders equal Luck by name, ignoring case, without mutating its input', () => {
  const investigators = [
    { id: 'b', name: 'bob', luck: 35, ownerIds: ['u2'] },
    { id: 'a', name: 'Alice', luck: 35, ownerIds: ['u2'] }
  ]
  const snapshot = structuredClone(investigators)
  assert.deepEqual(ids(buildCandidates(investigators, PLAYERS, { locale: 'en' })), ['a', 'b'])
  assert.deepEqual(investigators, snapshot)
})

test('resolveRoller picks the lowest Luck among the ticked rows', () => {
  const candidates = buildCandidates(INVESTIGATORS, PLAYERS, { locale: 'en' })
  const defaults = resolveRoller(candidates, ['a1', 'a3', 'a4'])
  assert.equal(defaults.roller.id, 'a1')
  assert.deepEqual(ids(defaults.tied), ['a1'])
  assert.equal(defaults.presentCount, 3)
  assert.equal(resolveRoller(candidates, new Set(['a1', 'a3', 'a2'])).roller.id, 'a2')
})

test('resolveRoller returns every row tied at the lowest Luck and honours the preferred one', () => {
  const candidates = [
    { id: 'x', name: 'Ada', luck: 35 }, { id: 'y', name: 'Harvey', luck: 35 }, { id: 'w', name: 'Tom', luck: 60 }
  ]
  assert.deepEqual(ids(resolveRoller(candidates, ['x', 'y', 'w']).tied), ['x', 'y'])
  assert.equal(resolveRoller(candidates, ['x', 'y', 'w']).roller.id, 'x')
  assert.equal(resolveRoller(candidates, ['x', 'y', 'w'], 'y').roller.id, 'y')
})

test('resolveRoller ignores a preferred row that is no longer tied or ticked', () => {
  const candidates = [{ id: 'x', name: 'Ada', luck: 35 }, { id: 'y', name: 'Harvey', luck: 35 }]
  assert.equal(resolveRoller(candidates, ['y'], 'x').roller.id, 'y')
  assert.equal(resolveRoller(candidates, ['x', 'y'], 'gone').roller.id, 'x')
})

test('resolveRoller returns no roller when nothing is ticked', () => {
  assert.deepEqual(resolveRoller([{ id: 'x', name: 'Ada', luck: 35 }], []), { roller: null, tied: [], presentCount: 0 })
})
