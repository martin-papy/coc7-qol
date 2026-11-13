# Highlight Strong Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skill rows at or above a world-wide threshold (default 50) stand out on CoC7 actor sheets, with a world on/off switch.

**Architecture:** A pure module (`highlight.js`) holds the rule and toggles a class on skill rows; it takes the threshold and a value lookup as arguments. `settings.js` registers two world settings and `index.js` wires the `renderActorSheetV2` hook and the live refresh. A stylesheet styles the class. Same shape as `scripts/spell-cast/`.

**Tech Stack:** Vanilla ES modules loaded by FoundryVTT (no build step), `node --test` + `jsdom` for unit tests, Playwright MCP against `http://localhost:30000` for the Foundry side.

**Spec:** [docs/superpowers/specs/2026-11-13-skill-highlight-design.md](../specs/2026-11-13-skill-highlight-design.md)

## Global Constraints

- FoundryVTT v13 and v14, CoC7 8.16 and later, no build step.
- Display only: never write to an actor or an item.
- `highlight.js` imports nothing from Foundry and touches no Foundry global; `game`, `Hooks`, `foundry` stay in `index.js` and `settings.js`.
- A row or item that cannot be resolved gets no highlight and raises no error.
- Marking is idempotent: it runs on every render, and a row that drops below the threshold loses its class.
- Settings are world-scoped. Threshold is a whole number from 1 to 99, default 50. The feature is on by default.
- Every setting hint ends with "Applies to everyone in this world." (French: "S'applique à tous les utilisateurs de ce monde.").
- Work on branch `feature-skill-highlight`. Commits follow `<type>: <description>`, end with the `Co-Authored-By` trailer, and are 1Password-signed: if signing fails, stop and ask Martin to unlock it.
- New `module.json` entries only load after a world relaunch, which needs the admin password. For Playwright checks, use the route-splice workaround: `page.route` an already-listed script (`scripts/spell-cast/index.js`) to append `import '../skill-highlight/index.js'`, and an already-listed stylesheet (`styles/spell-cast.css`) to append the new CSS; `page.unrouteAll()` afterwards. Screenshots go under `.playwright-mcp/`.

## Review Focus

Conditions the spec implies that are most likely to bite, each pinned by a test or check in the task named:

1. **A skill value that is not a number** (`undefined`, `NaN`, empty string, `null`) is not highlighted and does not throw. → Task 1, `isStrongSkill` tests.
2. **A threshold setting holding a bad value** (0, 150, 49.6, `'abc'`, set from the console or an imported world) still gives a whole number from 1 to 99, falling back to 50. → Task 1, `normalizeThreshold` tests.
3. **A row whose UUID is not one of the actor's skills** (a stale row, another item type) is left unmarked, and loses a mark it had. → Task 1, `markStrongSkills` tests.
4. **Skill values above 99** (Pulp heroes, creatures at 120) are highlighted. → Task 1, `isStrongSkill` tests.
5. **A setting changed while sheets are open, minimized, or belong to actors with no skills** (container, vehicle) updates the open ones at once and throws nothing. → Task 2, step 5.

---

### Task 1: The rule and the row marking

**Files:**
- Create: `scripts/skill-highlight/highlight.js`
- Test: `test/skill-highlight.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces, all exported from `scripts/skill-highlight/highlight.js`:
  - `STRONG_SKILL_CLASS = 'coc7qol-strong-skill'`
  - `DEFAULT_THRESHOLD = 50`, `MIN_THRESHOLD = 1`, `MAX_THRESHOLD = 99`
  - `normalizeThreshold(raw: unknown): number` — a whole number in `[1, 99]`.
  - `isStrongSkill(value: unknown, threshold: number): boolean`
  - `markStrongSkills(root: Element, opts: { threshold: number | null, valueFor: (uuid: string) => unknown }): void` — `threshold: null` means the feature is off.

- [ ] **Step 1: Write the failing tests** in `test/skill-highlight.test.js`, in the style of `test/spell-cast.test.js` (`node:test`, `node:assert/strict`, `JSDOM`).

Fixture, with the markup CoC7 9.1 renders (the development-tab row has no `skill` class and must stay untouched):

```js
const VALUES = { 'A.s1': 80, 'A.s2': 50, 'A.s3': 49, 'A.s4': 120 }

function buildSheet () {
  const dom = new JSDOM(`
    <div class="sheet">
      <section class="tab skills"><ul class="item-list">
        <li class="item skill" data-item-uuid="A.s1"><div class="item-name skill-name">Dodge</div></li>
        <li class="item skill" data-item-uuid="A.s2"><div class="item-name skill-name">Climb</div></li>
        <li class="item skill" data-item-uuid="A.s3"><div class="item-name skill-name">Jump</div></li>
        <li class="item skill" data-item-uuid="A.gone"><div class="item-name skill-name">Stale</div></li>
      </ul></section>
      <section class="tab development"><ul class="skills-list">
        <li class="item" data-item-uuid="A.s1"><div class="skill-name">Dodge</div></li>
      </ul></section>
      <div class="skill-list"><div class="item skill flexrow" data-item-uuid="A.s4"><div class="skill-name">Bite</div></div></div>
      <div class="skills-block"><div class="item flexrow" data-item-uuid="A.s1"></div></div>
      <div class="skills-block icons-only"><div class="item" data-item-uuid="A.s1"></div></div>
    </div>`)
  return dom.window.document.querySelector('.sheet')
}
const marked = root => [...root.querySelectorAll(`.${STRONG_SKILL_CLASS}`)]
const valueFor = uuid => VALUES[uuid]
```

Tests and their assertions:

```js
test('isStrongSkill is true at or above the threshold, including above 99', () => {
  assert.equal(isStrongSkill(50, 50), true)
  assert.equal(isStrongSkill(49, 50), false)
  assert.equal(isStrongSkill(120, 50), true)
  assert.equal(isStrongSkill('60', 50), true)
})

test('isStrongSkill is false for a value that is not a number', () => {
  for (const value of [undefined, null, '', NaN, 'abc', {}]) assert.equal(isStrongSkill(value, 1), false)
})

test('normalizeThreshold returns a whole number from 1 to 99, 50 when unreadable', () => {
  assert.equal(normalizeThreshold(50), 50)
  assert.equal(normalizeThreshold('65'), 65)
  assert.equal(normalizeThreshold(49.6), 50)
  assert.equal(normalizeThreshold(0), MIN_THRESHOLD)
  assert.equal(normalizeThreshold(-5), MIN_THRESHOLD)
  assert.equal(normalizeThreshold(150), MAX_THRESHOLD)
  for (const raw of [undefined, null, '', 'abc', NaN]) assert.equal(normalizeThreshold(raw), DEFAULT_THRESHOLD)
})

test('marks skill rows at or above the threshold on investigator, NPC and summarized markup', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  assert.deepEqual(marked(root).map(row => row.dataset.itemUuid), ['A.s1', 'A.s2', 'A.s4', 'A.s1'])
})

test('leaves the development tab and the icons-only strip unmarked', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  assert.equal(root.querySelector('.tab.development .item').classList.contains(STRONG_SKILL_CLASS), false)
  assert.equal(root.querySelector('.icons-only .item').classList.contains(STRONG_SKILL_CLASS), false)
})

test('removes the mark from a row that dropped below the threshold or no longer resolves', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  markStrongSkills(root, { threshold: 50, valueFor: uuid => (uuid === 'A.s4' ? 120 : undefined) })
  assert.deepEqual(marked(root).map(row => row.dataset.itemUuid), ['A.s4'])
})

test('running it twice gives the same result', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  markStrongSkills(root, { threshold: 50, valueFor })
  assert.equal(marked(root).length, 4)
})

test('a null threshold clears every mark', () => {
  const root = buildSheet()
  markStrongSkills(root, { threshold: 50, valueFor })
  markStrongSkills(root, { threshold: null, valueFor })
  assert.equal(marked(root).length, 0)
})

test('a root without skill rows is left alone', () => {
  const root = new JSDOM('<div class="sheet"><p>Vehicle</p></div>').window.document.querySelector('.sheet')
  assert.doesNotThrow(() => markStrongSkills(root, { threshold: 50, valueFor }))
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: `test/skill-highlight.test.js` fails with a module-not-found error for `../scripts/skill-highlight/highlight.js`; every other test file passes.

- [ ] **Step 3: Implement `scripts/skill-highlight/highlight.js`** with the exports listed under Interfaces.

Rows are selected with one module-private constant:

```js
/** Skill rows on investigator (skills and combat tabs) and NPC / Creature sheets, and the summarized sheet's top skills (CoC7 9.1). */
const SKILL_ROW_SELECTOR = '.item.skill[data-item-uuid], .skills-block:not(.icons-only) .item[data-item-uuid]'
```

`normalizeThreshold` rounds to the nearest whole number, then clamps. Empty string and `null` count as unreadable, not as 0. `isStrongSkill` accepts numeric strings (`'60'`) but not `null` or `''`. `markStrongSkills` uses `classList.toggle(STRONG_SKILL_CLASS, …)` on every matching row so that a mark can also be removed. Open the file with a header comment like `cast-control.js`'s (pure DOM, no Foundry globals, tested by `test/skill-highlight.test.js`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/skill-highlight/highlight.js test/skill-highlight.test.js
git commit -m "feat: mark skill rows at or above a threshold"
```

---

### Task 2: World settings and sheet wiring

**Files:**
- Create: `scripts/skill-highlight/settings.js`
- Create: `scripts/skill-highlight/index.js`
- Modify: `module.json` (`esmodules`: append `"scripts/skill-highlight/index.js"`)
- Modify: `lang/en.json`, `lang/fr.json` (new block after the `COC7QOL.SpellCast.*` keys)

**Interfaces:**
- Consumes from Task 1: `markStrongSkills`, `normalizeThreshold`, `DEFAULT_THRESHOLD`, `MIN_THRESHOLD`, `MAX_THRESHOLD`.
- Produces, exported from `scripts/skill-highlight/settings.js`:
  - `ENABLED_SETTING = 'skill-highlight-enabled'`, `THRESHOLD_SETTING = 'skill-highlight-threshold'`
  - `registerSkillHighlightSettings(onChange: () => void): void` — call once in the `init` hook; `onChange` runs on every connected client when a GM changes either setting.
  - `activeThreshold(): number | null` — the normalized threshold, or `null` when the feature is off or the settings cannot be read.

- [ ] **Step 1: Add the strings**

`lang/en.json`:

```json
"COC7QOL.SkillHighlight.EnabledName": "Highlight strong skills",
"COC7QOL.SkillHighlight.EnabledHint": "Mark the skills at or above the threshold below on investigator, NPC and Creature sheets, so a character's strengths stand out when skills are sorted by name. Applies to everyone in this world.",
"COC7QOL.SkillHighlight.ThresholdName": "Strong skill threshold",
"COC7QOL.SkillHighlight.ThresholdHint": "A skill whose value is at or above this number is highlighted. Applies to everyone in this world.",
```

`lang/fr.json`:

```json
"COC7QOL.SkillHighlight.EnabledName": "Mettre en évidence les compétences fortes",
"COC7QOL.SkillHighlight.EnabledHint": "Signale, sur les fiches d'investigateur, de PNJ et de Créature, les compétences égales ou supérieures au seuil ci-dessous, pour repérer les points forts d'un personnage quand les compétences sont triées par nom. S'applique à tous les utilisateurs de ce monde.",
"COC7QOL.SkillHighlight.ThresholdName": "Seuil des compétences fortes",
"COC7QOL.SkillHighlight.ThresholdHint": "Une compétence dont la valeur est égale ou supérieure à ce nombre est mise en évidence. S'applique à tous les utilisateurs de ce monde.",
```

- [ ] **Step 2: Implement `scripts/skill-highlight/settings.js`**, modelled on `scripts/npc-sheets/settings.js` (same `MODULE = 'coc7-qol'`, same try/catch guard around `game.settings.get`).

Both settings: `scope: 'world'`, `config: true`, `onChange`. Enabled: `type: Boolean`, `default: true`. Threshold: `type: Number`, `default: DEFAULT_THRESHOLD`, `range: { min: MIN_THRESHOLD, max: MAX_THRESHOLD, step: 1 }` (Foundry renders this as a slider with its value). Register enabled first so it is listed above the threshold. `activeThreshold()` passes the stored threshold through `normalizeThreshold`.

- [ ] **Step 3: Implement `scripts/skill-highlight/index.js`**

- `Hooks.once('init', …)` registers the settings, passing a function that re-marks every open actor sheet: each `app` of `foundry.applications.instances.values()` with `app.document?.documentName === 'Actor'` and a truthy `app.element`.
- `Hooks.on('renderActorSheetV2', (app, element) => …)` marks `element`.
- Both go through one local function that builds the lookup from `app.document.items` (a `Map` of `item.uuid → item.system.value` for items of `type === 'skill'`) and calls `markStrongSkills(element, { threshold: activeThreshold(), valueFor })`.
- No sheet-class filter: the row selector does the scoping, so the hook is a no-op on container and vehicle sheets.

- [ ] **Step 4: Append `"scripts/skill-highlight/index.js"` to `esmodules` in `module.json`**, then run `npm test`. Expected: all pass (nothing imports the Foundry-side files).

- [ ] **Step 5: Verify in Foundry with Playwright** (route-splice the new script, see Global Constraints; join as `Gamemaster`; the investigator *Sir Duncan Blackthorn* has exactly one skill at 50 or more, *Language (English)* at 80, and several between 25 and 35).

Record the two settings' current values first and restore them at the end. Check, with `browser_evaluate`:

1. Both settings appear under *Settings → Module Settings → CoC7 QoL Improvements* with the English labels, the threshold as a 1–99 slider showing 50.
2. Open the investigator sheet: exactly the rows of *Language (English)* carry `coc7qol-strong-skill`.
3. With the sheet open, `await game.settings.set('coc7-qol', 'skill-highlight-threshold', 25)`: the marked rows now match the skills whose `system.value >= 25`, without re-opening the sheet.
4. `await game.settings.set('coc7-qol', 'skill-highlight-enabled', false)`: no row is marked. Set it back to `true`: the marks return.
5. Review Focus 5: repeat check 3 with one investigator sheet minimized, one NPC sheet open, and one container or vehicle sheet open (create nothing; skip a type the world lacks). No console error; the minimized sheet's rows are correct once restored.
6. Unlock the investigator sheet (padlock): rows at or above the threshold are still marked. Lock it again.
7. Join as `Player2` in a second check: a sheet that player can open shows the same marks.
8. Restore both settings, `page.unrouteAll()`, close the sheets.

- [ ] **Step 6: Commit**

```bash
git add scripts/skill-highlight/settings.js scripts/skill-highlight/index.js module.json lang/en.json lang/fr.json
git commit -m "feat: world settings and sheet hook for strong-skill highlighting"
```

---

### Task 3: The look, and the docs

**Files:**
- Create: `styles/skill-highlight.css`
- Modify: `module.json` (`styles`: append `"styles/skill-highlight.css"`)
- Modify: `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes from Task 1: the class name `coc7qol-strong-skill` on a skill row, whose name is a descendant `.skill-name` (a `<div>` when the sheet is locked, an `<input>` when unlocked).
- Produces: nothing other tasks use.

- [ ] **Step 1: Write `styles/skill-highlight.css`** and append it to `styles` in `module.json`.

Two rules, scoped under `.application` like the module's other sheet styles. On the row: a background of `color-mix(in oklab, <accent> <tint>, transparent)` and `box-shadow: inset 3px 0 0 <accent>`. On its `.skill-name`: `font-weight: 700`. Accent, tint strength and bar width are custom properties declared once on the row: `--coc7qol-strong-skill-accent: var(--color-text-accent)`, `--coc7qol-strong-skill-tint: 16%`, `--coc7qol-strong-skill-bar: 3px`. Do not set `color` anywhere. Open with a comment naming issue #29, as the other stylesheets do.

- [ ] **Step 2: Verify the look in Foundry with Playwright** (route-splice the script and the CSS; set the world threshold to 20 for the check so that a dozen rows are marked, and restore it to its recorded value afterwards).

For each of: investigator v3 (skills tab and combat tab), classic v2 (`CoC7.CoC7ModelsActorCharacterSheetV2`, skills and combat tabs), summarized (`CoC7.CoC7ModelsActorCharacterSheetSummarizedV3`), one NPC sheet with the module's skill columns on — instantiate with `new cls({ document: actor })` where the sheet is not the actor's default. In the dark theme, then in the light one (swap `theme-dark` for `theme-light` on `document.body`, swap back after):

1. On a marked row, `getComputedStyle(row).boxShadow` contains `inset` and `backgroundColor` is not `rgba(0, 0, 0, 0)`.
2. Its `.skill-name` has `fontWeight` `700`, and the same `color` as the `.skill-name` of an unmarked row in the same list.
3. The row's `getBoundingClientRect()` height and width equal those of an unmarked row in the same list (the highlight must not shift the layout), and no marked `.skill-name` is newly cut (`scrollWidth > clientWidth`) where the unmarked version of it was not.
4. Take one screenshot per sheet per theme into `.playwright-mcp/` and look at each: the tint and bar are visible, text is legible, and on the NPC sheet the bar is not clipped by the column layout.

If a sheet fails 3 or 4, tune the three custom properties or add a rule for that sheet, and re-run the checks. Unlock the v3 sheet once and confirm the name inputs are bold and still editable.

- [ ] **Step 3: Update `README.md`**

Add a last row to the *What's inside* table:

```markdown
| [💪 Strong Skills at a Glance](#-strong-skills-at-a-glance) | See what a character is good at without re-sorting — skills at 50% or more are highlighted | Everyone |
```

Add a section after *🪄 Cast Spells from the Sheet*, before *Internationalization*, followed by a `---` rule like its neighbours:

```markdown
## 💪 Strong Skills at a Glance

Keep your skills sorted by name and still see what a character is good at: every skill at **50% or more** gets a soft tint, a bar on its left edge and a bold name. It works on investigator, NPC and Creature sheets, in the light and the dark theme.

It is on by default. The Keeper can change the threshold or switch it off for the whole table under **Settings → Module Settings → CoC7 QoL Improvements**.
```

- [ ] **Step 4: Update `CHANGELOG.md`**, as the last entry of *Unreleased → Added*:

```markdown
- **Strong skills highlighted** — With skills sorted by name, nothing on a sheet showed what a character is good at (CoC7 issue [#1884](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/1884)). Skills at 50% or more now stand out on investigator, NPC and Creature sheets, with a soft tint on the row, a bar on its left edge and the name in bold, in both themes. A Keeper can change the threshold or switch the highlight off for the whole table with *Highlight strong skills* and *Strong skill threshold* in the module settings.
```

- [ ] **Step 5: Run `npm test`**. Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add styles/skill-highlight.css module.json README.md CHANGELOG.md
git commit -m "feat: style strong skills and document the feature"
```

---

## After the last task

- Tell Martin that the real `module.json` path (new script and stylesheet loaded without the route-splice) still needs one check after a world relaunch, which needs the admin password.
- The pull request to `develop` closes #29 and says that the combat skill relabel was dropped, with the reason from the spec's *Scope change* section.
