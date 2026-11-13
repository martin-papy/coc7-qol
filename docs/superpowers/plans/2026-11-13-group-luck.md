# Group Luck Roll Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Keeper toolbar button that lists the investigators, lets the Keeper tick who is present, and sends the lowest-Luck investigator's player a whispered, clickable Luck roll request.

**Architecture:** A feature folder `scripts/group-luck/`. Three modules hold the rules and the dialog markup without touching Foundry (`candidates.js`, `request.js`, `dialog-view.js`) and are covered by `node --test`. Two thin modules touch Foundry: `dialog.js` (an `ApplicationV2` shell holding the tick state) and `index.js` (toolbar hook, reading `game`, posting the message). The roll itself is CoC7's: the message embeds a CoC7 check link.

**Tech Stack:** Vanilla ES modules loaded by FoundryVTT (no build step), `ApplicationV2`, Node 22 built-in test runner with `jsdom`.

**Spec:** [docs/superpowers/specs/2026-11-13-group-luck-design.md](../specs/2026-11-13-group-luck-design.md)

## Global Constraints

- FoundryVTT v13+ (verified on 14), CoC7 8.16+. No new dependencies, no build step.
- Branch `feature-group-luck` (already created off `develop`). No git worktree.
- Code style of the recent feature folders (`scripts/spell-cast/`): no semicolons, two-space indent, a space before function parentheses, JSDoc on every export.
- The three pure modules never read `game`, `ui`, `Hooks`, `CONFIG` or `document`; localisation functions and the DOM `document` are passed in.
- Every user-visible string is a key under `COC7QOL.GroupLuck.*` in both `lang/en.json` and `lang/fr.json`.
- An actor name never reaches `innerHTML` unescaped: `textContent` in the dialog, `escapeHtml` (from `scripts/utils.js`) in chat content.
- The link text is exactly `@coc7.check[subtype:attribute,name:lck]`, with no label and no difficulty.
- No roll logic in the module. No `console.log`; `console.error` with the `[coc7-qol]` prefix only inside a `catch`.
- Commits: `<type>: <description>`, ending with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Commits are 1Password-signed; if signing fails because 1Password is locked, stop and ask.

## Review Focus

1. **An investigator name containing HTML** (`<img onerror=…>`): shown as text in the dialog and in the chat message. Tests in Task 2 and Task 3.
2. **Luck that is not a number** (blank sheet, `null`): the investigator is left out; **Luck 0** is a number and is kept. Test in Task 1.
3. **A player's assigned character that is not a listed investigator** (an NPC, a deleted actor): that player falls back to "every investigator they own". Test in Task 1.
4. **A tie pick that goes stale** (the Keeper picks Ada in a tie, then unticks Ada): the roller falls back to the first tied row still ticked. Test in Task 1.
5. **A double click on the confirm button, or the investigator deleted while the dialog is open**: one message at most, and a notification instead of an exception. Manual check in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/group-luck/candidates.js` (create) | Rows, default ticks, ordering, roller and tie resolution. Pure. |
| `scripts/group-luck/request.js` (create) | Chat message data for the request. Pure. |
| `scripts/group-luck/dialog-view.js` (create) | Builds the dialog DOM from state. Pure (takes a `document`). |
| `scripts/group-luck/dialog.js` (create) | `ApplicationV2` shell: tick state, re-render, confirm/cancel. |
| `scripts/group-luck/index.js` (create) | Toolbar tool, reads `game.actors` / `game.users`, posts the message or starts the Keeper-side roll. |
| `styles/group-luck.css` (create) | Dialog styles. |
| `test/group-luck.test.js` (create) | Tests for the three pure modules. |
| `module.json`, `lang/en.json`, `lang/fr.json` (modify) | Registration and strings. |
| `README.md`, `CHANGELOG.md` (modify), `docs/features/group-luck.md` (create) | User documentation. |

Shared types (JSDoc typedefs, declared in `candidates.js`):

```js
/** @typedef {{ id: string, name: string, luck: number, ownerIds: string[] }} Investigator  ownerIds: non-GM users with OWNER permission */
/** @typedef {{ id: string, isActive: boolean, characterId: string|null }} Player           non-GM users only */
/** @typedef {Investigator & { isOnline: boolean, isDefault: boolean }} Candidate */
/** @typedef {{ roller: Candidate|null, tied: Candidate[], presentCount: number }} Resolution */
```

---

### Task 1: Candidate rules

**Files:**
- Create: `scripts/group-luck/candidates.js`
- Test: `test/group-luck.test.js`

**Interfaces:**
- Produces: `buildCandidates(investigators: Investigator[], players: Player[], { locale?: string }): Candidate[]` and `resolveRoller(candidates: Candidate[], tickedIds: Iterable<string>, preferredId?: string|null): Resolution`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module …/scripts/group-luck/candidates.js`.

- [ ] **Step 3: Implement `candidates.js`**

Declare the four typedefs from *File Structure*, then:

- `buildCandidates(investigators, players, { locale } = {})`:
  - keep an investigator only when `Number.isFinite(luck)` and at least one of its `ownerIds` is a player id;
  - `isOnline`: one of its owners has `isActive`;
  - `isDefault`: for each player with `isActive`, the default set gains the player's `characterId` when that id is a kept investigator, otherwise every kept investigator whose `ownerIds` include the player;
  - return new objects (`{ ...investigator, isOnline, isDefault }`), defaults first, then the others; inside each group by `luck` ascending, then by name with `new Intl.Collator(locale, { sensitivity: 'base' })`.
- `resolveRoller(candidates, tickedIds, preferredId = null)`: `tied` is every ticked candidate at the lowest ticked Luck, in list order; `roller` is the tied candidate whose id is `preferredId`, else `tied[0]`, else `null`; `presentCount` is the number of ticked candidates.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 10 new tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/group-luck/candidates.js test/group-luck.test.js
git commit -m "feat: add the Group Luck candidate rules"
```

---

### Task 2: Request message

**Files:**
- Create: `scripts/group-luck/request.js`
- Test: `test/group-luck.test.js` (append; new `import` lines go with the others at the top of the file, here and in Task 3)

**Interfaces:**
- Consumes: `Candidate` (Task 1), `escapeHtml(str): string` from `scripts/utils.js`.
- Produces: `LUCK_LINK: string` and `buildRequestMessage(roller: Candidate, presentCount: number, { t: (key) => string, tf: (key, data) => string, userName: string }): { speaker: { alias: string }, whisper: string[], content: string }`.

- [ ] **Step 1: Write the failing tests**

```js
import { LUCK_LINK, buildRequestMessage } from '../scripts/group-luck/request.js'

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module …/scripts/group-luck/request.js`.

- [ ] **Step 3: Implement `request.js`**

Export `LUCK_LINK` and `buildRequestMessage` with the signature above. The sentence uses `COC7QOL.GroupLuck.Message.Lowest` with `{ name, luck, count }` when `presentCount > 1`, otherwise `COC7QOL.GroupLuck.Message.Single` with `{ name }`; `name` is passed through `escapeHtml` first. The content layout is fixed by the third test.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/group-luck/request.js test/group-luck.test.js
git commit -m "feat: build the Group Luck request message"
```

---

### Task 3: Dialog view

**Files:**
- Create: `scripts/group-luck/dialog-view.js`
- Test: `test/group-luck.test.js` (append)

**Interfaces:**
- Consumes: `Candidate`, `Resolution` (Task 1).
- Produces: `buildGroupLuckView(doc: Document, { candidates: Candidate[], tickedIds: Set<string>, resolution: Resolution }, { t, tf }): HTMLElement`.

Markup contract (the tests and `dialog.js` rely on these selectors):

```
div.coc7-qol-group-luck
├─ p.group-luck-hint                                   t('COC7QOL.GroupLuck.Hint')
├─ ul.group-luck-list
│  ├─ li.group-luck-row[data-candidate-id]             + .is-roller on the roller, + .is-tied on every tied row when tied.length > 1
│  │  ├─ label.group-luck-present
│  │  │  ├─ input[type=checkbox][name=present][value=<id>]
│  │  │  └─ span.group-luck-name                       textContent = name
│  │  ├─ input[type=radio][name=roller][value=<id>]    only on tied rows when tied.length > 1; aria-label = t('…RollerChoice') + ': ' + name
│  │  ├─ span.group-luck-offline                       only when !isOnline; t('…Offline')
│  │  ├─ span.group-luck-value                         textContent = luck
│  │  └─ span.group-luck-marker                        roller: <i class="fa-solid fa-dice-d20" aria-hidden="true"></i> + t('…Rolls'); other tied rows: t('…Tied'); otherwise absent
│  └─ li.group-luck-divider                            t('…Others'); only between the two groups, when both are non-empty
└─ footer.group-luck-footer
   ├─ button[type=button][data-action=confirm].bright
   └─ button[type=button][data-action=cancel]          t('…Button.Cancel')
```

Confirm button: no roller → `t('COC7QOL.GroupLuck.Button.Request')` and `disabled`; roller online → `tf('…Button.RequestFrom', { name })`; roller offline → `tf('…Button.KeeperRoll', { name })`.

- [ ] **Step 1: Write the failing tests**

```js
import { JSDOM } from 'jsdom'
import { buildGroupLuckView } from '../scripts/group-luck/dialog-view.js'

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module …/scripts/group-luck/dialog-view.js`.

- [ ] **Step 3: Implement `dialog-view.js`**

Build the tree of the markup contract with `doc.createElement` and `textContent` only (no `innerHTML`). Split into small functions (row, footer) so none exceeds 50 lines.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/group-luck/dialog-view.js test/group-luck.test.js
git commit -m "feat: render the Group Luck dialog content"
```

---

### Task 4: Dialog, toolbar button and wiring

**Files:**
- Create: `scripts/group-luck/dialog.js`, `scripts/group-luck/index.js`, `styles/group-luck.css`
- Modify: `module.json` (`esmodules`: add `scripts/group-luck/index.js` after `scripts/close-all-cards.js`; `styles`: add `styles/group-luck.css`), `lang/en.json`, `lang/fr.json`

**Interfaces:**
- Consumes: `buildCandidates`, `resolveRoller` (Task 1); `buildRequestMessage` (Task 2); `buildGroupLuckView` (Task 3); `t`, `tf` from `scripts/utils.js`.
- Produces: `export default class GroupLuckDialog` with `constructor ({ candidates: Candidate[], onConfirm: ({ roller: Candidate, presentCount: number }) => Promise<void> }, options = {})`.

- [ ] **Step 1: Add the strings to `lang/en.json` and `lang/fr.json`** (new block after `COC7QOL.SpellCast.*`)

| Key (`COC7QOL.GroupLuck.` +) | en | fr |
|---|---|---|
| `Title` | Group Luck | Chance de groupe |
| `Hint` | Tick the investigators present in the scene. | Cochez les investigateurs présents dans la scène. |
| `Others` | Others | Autres |
| `Offline` | offline | hors ligne |
| `Rolls` | rolls | lance |
| `Tied` | tied | égalité |
| `RollerChoice` | Rolls for the group | Lance pour le groupe |
| `Button.Request` | Request Luck roll | Demander un jet de Chance |
| `Button.RequestFrom` | Request Luck roll from {name} | Demander un jet de Chance à {name} |
| `Button.KeeperRoll` | Roll Luck for {name} | Lancer la Chance pour {name} |
| `Button.Cancel` | Cancel | Annuler |
| `Message.Lowest` | {name} has the lowest Luck ({luck}) of the {count} investigators present and rolls for the group. | {name} a la Chance la plus basse ({luck}) des {count} investigateurs présents et lance pour le groupe. |
| `Message.Single` | {name} rolls Luck for the group. | {name} fait le jet de Chance pour le groupe. |
| `Notification.NoInvestigators` | No investigator owned by a player was found. | Aucun investigateur appartenant à un joueur n'a été trouvé. |
| `Notification.Missing` | {name} no longer exists. | {name} n'existe plus. |
| `Notification.Failed` | Group Luck failed for {name}: {error} | La Chance de groupe a échoué pour {name} : {error} |

- [ ] **Step 2: Implement `dialog.js`**

`GroupLuckDialog extends foundry.applications.api.ApplicationV2`, modelled on `CloseAllCardsDialog` in `scripts/close-all-cards.js` (`_renderHTML` / `_replaceHTML`, static action handlers):

- `DEFAULT_OPTIONS`: `id: 'coc7-group-luck'`, `tag: 'div'`, `position: { width: 420, height: 'auto' }`, actions `confirm` and `cancel`; `get title ()` returns `t('COC7QOL.GroupLuck.Title')`.
- Private state: `#candidates`, `#tickedIds` (a `Set` seeded with the `isDefault` ids), `#preferredId` (`null`), `#onConfirm`.
- `_renderHTML` returns `buildGroupLuckView(document, { candidates, tickedIds, resolution }, { t, tf })`.
- `_replaceHTML` remembers the focused input's `name` and `value`, calls `content.replaceChildren(result)`, then refocuses the input with the same `name` and `value` (keyboard users keep their place across re-renders).
- One delegated `change` listener on the rendered root: a `present` checkbox adds or removes its `value` in a new `Set`; a `roller` radio sets `#preferredId`; both then call `this.render()`.
- `confirm`: resolve the roller; return if there is none; `await this.close()` **before** calling `#onConfirm({ roller, presentCount })`, so a second click finds no dialog.
- `cancel`: `this.close()`.

- [ ] **Step 3: Implement `index.js`**

- `collectCandidates ()`: `players` = non-GM `game.users` mapped to `{ id, isActive: user.active, characterId: user.character?.id ?? null }`; `investigators` = `game.actors` of type `character` mapped to `{ id, name, luck: Number.parseInt(actor.system.attribs?.lck?.value, 10), ownerIds }` where `ownerIds` are the players for which `actor.testUserPermission(user, 'OWNER')` is true; return `buildCandidates(investigators, players, { locale: game.i18n.lang })`.
- `requestRoll ({ roller, presentCount })`: look the actor up again with `game.actors.get(roller.id)`; if it is gone, `ui.notifications.warn('COC7QOL.GroupLuck.Notification.Missing', { format: { name: roller.name } })` and return. If `roller.isOnline`, `await ChatMessage.create(buildRequestMessage(roller, presentCount, { t, tf, userName: game.user.name }))`; otherwise `await actor.attributeCheck('lck')`. Wrap both in `try/catch`: `console.error('[coc7-qol] Group Luck failed:', err)` and `ui.notifications.error('COC7QOL.GroupLuck.Notification.Failed', { format: { name: roller.name, error: err.message } })`.
- `Hooks.on('getSceneControlButtons', controls => …)`: return when `controls.coc7menu` is missing; set `controls.coc7menu.tools['coc7-group-luck']` to `{ button: true, icon: 'fa-solid fa-clover', name: 'coc7-group-luck', title: t('COC7QOL.GroupLuck.Title'), onChange }`. `onChange` collects the candidates; with none, `ui.notifications.info(t('COC7QOL.GroupLuck.Notification.NoInvestigators'))`; otherwise `new GroupLuckDialog({ candidates, onConfirm: requestRoll }).render(true)`.

- [ ] **Step 4: Write `styles/group-luck.css`**

Follow `styles/close-all-cards.css` (flex column container, Foundry colour variables with fallbacks). Requirements: `.group-luck-list` has no bullets, `max-height: 300px` and `overflow-y: auto`; `.group-luck-name` takes the free width; `.group-luck-value` is right-aligned with `font-variant-numeric: tabular-nums`; `.is-roller` is visibly highlighted (bold name plus a tinted background); `.group-luck-offline` and `.group-luck-divider` use the secondary text colour at 0.85em; rows show a hover and a `:focus-within` state; `.group-luck-footer` is a row with a 0.5rem gap.

- [ ] **Step 5: Register the script and the stylesheet in `module.json`, then run the unit tests**

Run: `npm test`
Expected: PASS, 0 failures (nothing regressed).

- [ ] **Step 6: Verify in Foundry with Playwright** (instance at `http://localhost:30000`; see CLAUDE.md "Browser automation with Playwright")

New `module.json` entries only load after a world relaunch. If the button is absent after a reload, use `page.route` to append `import '../group-luck/index.js'` to `scripts/close-all-cards.js` and the new CSS to `styles/close-all-cards.css`, and `page.unrouteAll()` afterwards. Screenshots go under `.playwright-mcp/`.

As `Gamemaster`:

1. Keeper's tools show a **Group Luck** button after Close All Cards. Expected: `button[data-tool="coc7-group-luck"]` exists.
2. Click it. Expected: dialog `#coc7-group-luck` lists every player-owned investigator with its Luck; an investigator with an empty Luck is absent; no console error.
3. Tick and untick rows. Expected: exactly one `.is-roller`, on the lowest ticked Luck; the button label follows; focus stays on the toggled checkbox; with nothing ticked the button is disabled.
4. Tie (set two investigators to the same Luck, or instantiate the dialog with mock candidates by dynamic import). Expected: radios on the tied rows only; choosing one moves `.is-roller`.
5. Long list: instantiate with 30 mock candidates at a 1024×600 viewport. Expected: `.group-luck-list` scrolls (`scrollHeight > clientHeight`) and the footer is inside the window.
6. Confirm with an online roller (mock `isOnline: true` on a real investigator owned by `Player2` if no second session is connected). Expected: one whispered message whose `whisper` is that investigator's player ids, with the sentence and an `a.coc7-link`; double-clicking the button still yields one message.
7. Confirm with a roller whose players are offline. Expected: button reads "Roll Luck for …", CoC7's roll dialog opens for that actor, no request message is created.
8. Delete-while-open: open the dialog on mock candidates whose id matches no actor and confirm. Expected: the "no longer exists" notification, no exception.

As `Player2` (navigate to `/join`, `select[name="userId"]` on v14):

9. The whisper from step 6 is visible, the link reads "Luck check", and clicking it opens CoC7's roll dialog for Player2's investigator. As `Player3`, the message is not visible.

Clean up: delete the test messages, restore any Luck value changed for the tie, close dialogs, `page.unrouteAll()`.

- [ ] **Step 7: Commit**

```bash
git add scripts/group-luck/dialog.js scripts/group-luck/index.js styles/group-luck.css module.json lang/en.json lang/fr.json
git commit -m "feat: request a Group Luck roll from the Keeper toolbar"
```

---

### Task 5: User documentation

**Files:**
- Create: `docs/features/group-luck.md`, `images/Group-Luck-1.png`
- Modify: `README.md`, `CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1: Capture the dialog** with Playwright as `Gamemaster` (a party of three or four, one offline row) to `.playwright-mcp/`, then copy it to `images/Group-Luck-1.png`.

- [ ] **Step 2: Write `docs/features/group-luck.md`** in the format of `docs/features/close-all-cards.md`: title `# 🍀 Group Luck`, a one-line summary ending with **GM only.**, the problem in two or three sentences, a numbered "How to use it" (open the Keeper's tools, click Group Luck, tick who is present, press the button, the player clicks the link), then short notes on ties, offline players (the Keeper rolls) and the whisper. End with the back-to-README link.

- [ ] **Step 3: Update `README.md`**: add a row to the feature table after Close All Cards — `| [🍀 Group Luck](#-group-luck) | Find who rolls Group Luck and send them the request in two clicks | GM |` — and a `## 🍀 Group Luck` section after the Close All Cards section, with one paragraph, the screenshot and the "Read more →" link, like its neighbours.

- [ ] **Step 4: Add to `CHANGELOG.md`** under `## [Unreleased]` → `### Added`, in the style of the existing entries: a **Group Luck roll request** bullet that states the problem, cites CoC7 issue [#1984](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/1984), and describes the button, the dialog, the whispered request, ties and offline players.

- [ ] **Step 5: Mention the feature in `CLAUDE.md`**: in the Architecture "Key pattern" paragraph, the `getSceneControlButtons` example now applies to two features; name `scripts/group-luck/` next to it in one clause. No new section.

- [ ] **Step 6: Check the links** — every relative link and image path added in Steps 2–4 points at an existing file.

Run: `ls images/Group-Luck-1.png docs/features/group-luck.md`
Expected: both paths listed.

- [ ] **Step 7: Commit**

```bash
git add docs/features/group-luck.md images/Group-Luck-1.png README.md CHANGELOG.md CLAUDE.md
git commit -m "docs: describe the Group Luck roll request"
```
