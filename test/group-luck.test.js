import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCandidates, resolveRoller } from '../scripts/group-luck/candidates.js'
import { LUCK_LINK, buildRequestMessage } from '../scripts/group-luck/request.js'
import { JSDOM } from 'jsdom'
import { buildGroupLuckView } from '../scripts/group-luck/dialog-view.js'

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

const i18n = {
  t: key => `T(${key})`,
  tf: (key, data) => `F(${key}|${Object.entries(data).map(([k, v]) => `${k}=${v}`).join(',')})`
}
const ROLLER = { id: 'a1', name: 'Harvey', luck: 35, ownerIds: ['u1', 'u9'], isOnline: true, isDefault: true }

test('LUCK_LINK is the CoC7 Luck check link without label or difficulty', () => {
  assert.equal(LUCK_LINK, '@coc7.check[subtype:attribute,name:lck]')
})

test('buildRequestMessage whispers to the roller\'s owners under the Keeper\'s name', () => {
  const message = buildRequestMessage(ROLLER, 4, { ...i18n, userName: 'Keeper' })
  assert.deepEqual(message.speaker, { alias: 'Keeper' })
  assert.deepEqual(message.whisper, ['u1', 'u9'])
  assert.notEqual(message.whisper, ROLLER.ownerIds)
})

test('buildRequestMessage names the roller, the Luck and the head count, then the link', () => {
  const { content } = buildRequestMessage(ROLLER, 4, { ...i18n, userName: 'Keeper' })
  assert.equal(content,
    '<p><strong>T(COC7QOL.GroupLuck.Title)</strong> — F(COC7QOL.GroupLuck.Message.Lowest|name=Harvey,luck=35,count=4)</p>' +
    `<p>${LUCK_LINK}</p>`)
})

test('buildRequestMessage drops the comparison when a single investigator is present', () => {
  const { content } = buildRequestMessage(ROLLER, 1, { ...i18n, userName: 'Keeper' })
  assert.ok(content.includes('F(COC7QOL.GroupLuck.Message.Single|name=Harvey)'))
})

test('buildRequestMessage escapes the investigator name', () => {
  const roller = { ...ROLLER, name: '<img src=x onerror=alert(1)>' }
  const { content } = buildRequestMessage(roller, 4, { ...i18n, userName: 'Keeper' })
  assert.ok(!content.includes('<img'))
  assert.ok(content.includes('&lt;img'))
})

function view (candidates, ticked, preferredId) {
  const { document } = new JSDOM('').window
  const tickedIds = new Set(ticked)
  return buildGroupLuckView(document, { candidates, tickedIds, resolution: resolveRoller(candidates, tickedIds, preferredId) }, i18n)
}
const PARTY = buildCandidates(INVESTIGATORS, PLAYERS, { locale: 'en' })
const row = (root, id) => root.querySelector(`.group-luck-row[data-candidate-id="${id}"]`)

test('view renders one row per candidate and a divider between the two groups', () => {
  const root = view(PARTY, ['a1', 'a3', 'a4'])
  assert.equal(root.querySelectorAll('.group-luck-row').length, 5)
  const items = [...root.querySelector('.group-luck-list').children]
  assert.equal(items.findIndex(li => li.classList.contains('group-luck-divider')), 3)
  assert.equal(view(PARTY.filter(c => c.isDefault), ['a1']).querySelectorAll('.group-luck-divider').length, 0)
})

test('view ticks the given rows and marks the roller', () => {
  const root = view(PARTY, ['a1', 'a3', 'a4'])
  assert.deepEqual([...root.querySelectorAll('input[name=present]:checked')].map(i => i.value), ['a1', 'a3', 'a4'])
  assert.ok(row(root, 'a1').classList.contains('is-roller'))
  assert.equal(root.querySelectorAll('.is-roller').length, 1)
  assert.ok(row(root, 'a1').querySelector('.group-luck-marker').textContent.includes('T(COC7QOL.GroupLuck.Rolls)'))
  assert.equal(root.querySelectorAll('input[name=roller]').length, 0)
})

test('view shows a radio on each tied row, checked on the roller', () => {
  const tied = [
    { id: 'x', name: 'Ada', luck: 35, isOnline: true, isDefault: true },
    { id: 'y', name: 'Harvey', luck: 35, isOnline: true, isDefault: true },
    { id: 'w', name: 'Tom', luck: 60, isOnline: true, isDefault: true }
  ]
  const root = view(tied, ['x', 'y', 'w'], 'y')
  assert.deepEqual([...root.querySelectorAll('input[name=roller]')].map(i => i.value), ['x', 'y'])
  assert.equal(root.querySelector('input[name=roller]:checked').value, 'y')
  assert.ok(row(root, 'x').classList.contains('is-tied') && row(root, 'y').classList.contains('is-tied'))
  assert.ok(row(root, 'x').querySelector('.group-luck-marker').textContent.includes('T(COC7QOL.GroupLuck.Tied)'))
  assert.equal(row(root, 'w').querySelector('.group-luck-marker'), null)
})

test('view tags only the rows whose players are all offline', () => {
  const root = view(PARTY, ['a1'])
  assert.ok(row(root, 'a5').querySelector('.group-luck-offline'))
  assert.equal(row(root, 'a1').querySelector('.group-luck-offline'), null)
})

test('view labels the confirm button for a request, a Keeper-side roll, or nothing ticked', () => {
  const confirm = root => root.querySelector('[data-action=confirm]')
  assert.equal(confirm(view(PARTY, ['a1', 'a3'])).textContent, 'F(COC7QOL.GroupLuck.Button.RequestFrom|name=Harvey)')
  assert.equal(confirm(view(PARTY, ['a1', 'a5'])).textContent, 'F(COC7QOL.GroupLuck.Button.KeeperRoll|name=Edith)')
  const empty = confirm(view(PARTY, []))
  assert.equal(empty.textContent, 'T(COC7QOL.GroupLuck.Button.Request)')
  assert.equal(empty.disabled, true)
  assert.equal(confirm(view(PARTY, ['a1'])).disabled, false)
})

test('view renders an investigator name as text', () => {
  const evil = [{ id: 'e', name: '<img src=x onerror=alert(1)>', luck: 35, isOnline: true, isDefault: true }]
  const root = view(evil, ['e'])
  assert.equal(root.querySelector('img'), null)
  assert.equal(row(root, 'e').querySelector('.group-luck-name').textContent, '<img src=x onerror=alert(1)>')
})
