# Export an Investigator to Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Export to Markdown" entry in an investigator sheet's header menu downloads the sheet as an Obsidian-ready `.md` note.

**Architecture:** `collect.js` reads the actor into a plain object, `render.js` turns that object into the note, `rich-text.js` cleans Foundry HTML and converts it with the `showdown` converter Foundry ships. None of the three touches a Foundry global; `index.js` owns the hook, the settings reads, the converter and the download.

**Tech Stack:** Vanilla ES modules (no build step), FoundryVTT v13/v14 ApplicationV2 hooks, `showdown` 2.1 (shipped by Foundry as `window.showdown`), Node built-in test runner with `jsdom`.

**Spec:** `docs/superpowers/specs/2026-11-22-markdown-export-design.md`. Read it first; this plan does not repeat its note layout.

## Global Constraints

- Branch `feature-markdown-export` (already created off `develop`). Conventional commit messages.
- Foundry v13 and v14. CoC7 8.16 to 9.2. Use only CoC7 members the spec names or this plan names; each was checked at tags `8.16` and `9.2`.
- No build step. `scripts/markdown-export/index.js` is the only new file listed in `module.json` `esmodules`.
- `collect.js`, `render.js`, `rich-text.js`, `format.js` and `labels.js` must not read `game`, `ui`, `Hooks`, `CONFIG`, `foundry`, `window` or `document`. Everything they need is an argument.
- Standard style (`npm run lint`): no semicolons, space before function parentheses. Functions under 50 lines.
- Keeper content rule: `keeperNotesHtml` is `null` in the collected data unless the exporter is a GM, so the renderer cannot leak it. For a non-GM the note contains neither the Keeper text nor the Keeper heading.
- Property keys in the note are fixed English identifiers. Headings come from the `labels` argument.
- Strings in properties are always double-quoted, with `\` and `"` escaped.
- HTML is only ever parsed in an inert document (one with no browsing context), never by assigning `innerHTML` on an element of the live page.
- User-visible strings go in `lang/en.json` and `lang/fr.json` under `COC7QOL.MarkdownExport.*` (flat keys, same key set in both files).
- No CSS, no setting, no success notification.
- `npm run lint` and `npm test` pass at the end of every task.

## Review Focus

1. **Rich text that looks empty** (`<p></p>`, `&nbsp;`, whitespace): the section is left out; no bare heading. Pinned in Task 2 (`richTextToMarkdown` returns `''`) and Task 4.
2. **Keeper notes of several paragraphs:** every line, blank ones included, stays inside the callout. Pinned in Task 4.
3. **Names containing `|`, `[[` or line breaks** (skills, weapons, items): tables keep their columns and no accidental Obsidian link appears. Pinned in Task 1 and Task 4.
4. **Incomplete actor data** (weapon whose linked skill was deleted, null attributes, missing `biography` or `sanityLossEvents`): the export still produces a note. Pinned in Task 3.
5. **Hostile HTML in rich text** (`<script>`, `<style>`, `onerror` attributes): never executed while exporting, and absent from the note. Pinned in Task 2; the inert-document rule is checked in Task 5.

---

### Task 1: Formatting helpers

**Files:**
- Create: `scripts/markdown-export/format.js`
- Test: `test/markdown-export-format.test.js`

**Interfaces:**
- Produces:
  - `yamlString(value: unknown): string` — a double-quoted YAML scalar.
  - `tableCell(value: unknown): string` — text safe inside a Markdown table cell.
  - `inlineText(value: unknown): string` — text safe in a heading or list item.
  - `fileNameFor(name: unknown): string` — the download file name.
  - `FALLBACK_FILE_NAME = 'investigator.md'`

- [ ] **Step 1: Commit the spec and this plan**

```bash
git add docs/superpowers/specs/2026-11-22-markdown-export-design.md docs/superpowers/plans/2026-11-22-markdown-export.md
git commit -m "docs: design and plan for the Markdown export"
```

- [ ] **Step 2: Write the failing tests**

```js
test('yamlString quotes and escapes', () => {
  assert.equal(yamlString('Journalist'), '"Journalist"')
  assert.equal(yamlString('Say "hi" \\ bye'), '"Say \\"hi\\" \\\\ bye"')
  assert.equal(yamlString('a: b # c'), '"a: b # c"')
  assert.equal(yamlString('line1\nline2'), '"line1 line2"')
  assert.equal(yamlString(42), '"42"')
})

test('tableCell escapes pipes, flattens line breaks, defuses wikilinks', () => {
  assert.equal(tableCell('Art|Craft'), 'Art\\|Craft')
  assert.equal(tableCell('two\nlines'), 'two lines')
  assert.equal(tableCell('[[Trap]]'), '\\[\\[Trap]]')
  assert.equal(tableCell(null), '')
  assert.equal(tableCell(0), '0')
})

test('inlineText flattens line breaks and defuses wikilinks but keeps pipes', () => {
  assert.equal(inlineText('a|b\n[[c]]'), 'a|b \\[\\[c]]')
  assert.equal(inlineText(undefined), '')
})

test('fileNameFor strips what file systems and Obsidian links reject', () => {
  assert.equal(fileNameFor('Harvey Walters'), 'Harvey Walters.md')
  assert.equal(fileNameFor('A/B\\C:D*E?F"G<H>I|J#K^L[M]N'), 'ABCDEFGHIJKLMN.md')
  assert.equal(fileNameFor('  Dr. Armitage.  '), 'Dr. Armitage.md')
  assert.equal(fileNameFor('.hidden'), 'hidden.md')
  assert.equal(fileNameFor('///'), 'investigator.md')
  assert.equal(fileNameFor(''), 'investigator.md')
  assert.equal(fileNameFor(undefined), 'investigator.md')
})
```

- [ ] **Step 3: Run them and see them fail**

Run: `node --test test/markdown-export-format.test.js`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement the four functions in `scripts/markdown-export/format.js`**

`fileNameFor` removes `\ / : * ? " < > | # ^ [ ]`, then leading dots and surrounding whitespace, then trailing dots and whitespace. Runs of whitespace collapse to one space in all four functions.

- [ ] **Step 5: Run the tests and lint**

Run: `node --test test/markdown-export-format.test.js && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/markdown-export/format.js test/markdown-export-format.test.js
git commit -m "feat: add Markdown export formatting helpers"
```

---

### Task 2: Rich text to Markdown

**Files:**
- Create: `scripts/markdown-export/rich-text.js`
- Modify: `package.json` (add `showdown` `^2.1.0` to `devDependencies`, the version Foundry v13 and v14 ship; run `npm install`)
- Test: `test/markdown-export-rich-text.test.js`

**Interfaces:**
- Produces:
  - `richTextToMarkdown(html: string, deps: RichTextDeps): string`
  - `RichTextDeps = { isGM: boolean, doc: Document, htmlToMarkdown: (html: string) => string, resolveName: (uuid: string) => string | undefined }`
  - `doc` is an inert document used for all parsing. `htmlToMarkdown` receives cleaned HTML.
  - Returns `''` for content with no visible text.

The tests use the real converter, so they see what Foundry will produce:

```js
import showdown from 'showdown'
import { JSDOM } from 'jsdom'

const doc = new JSDOM('').window.document
const converter = new showdown.Converter()
const deps = (overrides = {}) => ({
  isGM: false,
  doc,
  htmlToMarkdown: html => converter.makeMarkdown(html, doc),
  resolveName: () => undefined,
  ...overrides
})
```

- [ ] **Step 1: Write the failing tests**

```js
test('converts basic formatting', () => {
  const md = richTextToMarkdown('<p>Born in <strong>Boston</strong>.</p><ul><li>One</li><li>Two</li></ul>', deps())
  assert.match(md, /Born in \*\*Boston\*\*\./)
  assert.match(md, /^- One$/m)
  assert.match(md, /^- Two$/m)
})

test('tidies converter noise', () => {
  const md = richTextToMarkdown('<p>A</p><ul><li>x</li></ul><ol><li>y</li></ol><p>B</p>', deps())
  assert.doesNotMatch(md, /<!--/)
  assert.doesNotMatch(md, /\n{3,}/)
  assert.equal(md, md.trim())
})

test('removes unrevealed secrets for a player, keeps revealed ones', () => {
  const html = '<p>Public</p><section class="secret" id="s1"><p>Hidden</p></section><section class="secret revealed"><p>Shown</p></section>'
  const md = richTextToMarkdown(html, deps())
  assert.match(md, /Public/)
  assert.match(md, /Shown/)
  assert.doesNotMatch(md, /Hidden/)
})

test('keeps every secret for a GM', () => {
  const md = richTextToMarkdown('<section class="secret"><p>Hidden</p></section>', deps({ isGM: true }))
  assert.match(md, /Hidden/)
})

test('document links become their label', () => {
  const md = richTextToMarkdown('<p>Met @UUID[Actor.abc123]{Dr. Armitage} and @Compendium[CoC7.items.xyz]{a tome}.</p>', deps())
  assert.match(md, /Met Dr\. Armitage and a tome\./)
})

test('an unlabelled link uses the resolved name, or nothing', () => {
  const resolveName = uuid => (uuid === 'Actor.abc123' ? 'Dr. Armitage' : undefined)
  assert.match(richTextToMarkdown('<p>Met @UUID[Actor.abc123].</p>', deps({ resolveName })), /Met Dr\. Armitage\./)
  assert.match(richTextToMarkdown('<p>Met @UUID[Actor.gone].</p>', deps({ resolveName })), /Met \./)
})

test('inline rolls become label or formula, never a wikilink', () => {
  const md = richTextToMarkdown('<p>Lose [[/roll 1d6]] or [[1d4+1]]{some} SAN, then [[/r 2d6 # fire]].</p>', deps())
  assert.match(md, /Lose 1d6 or some SAN, then 2d6\./)
  assert.doesNotMatch(md, /\[\[/)
})

test('no unescaped [[ survives', () => {
  const md = richTextToMarkdown('<p>See [[Arkham]] notes and a stray [[ here.</p>', deps())
  assert.match(md, /See Arkham notes/)
  assert.doesNotMatch(md, /(^|[^\\])\[\[/)
})

test('plain text with raw line breaks keeps its paragraphs', () => {
  const md = richTextToMarkdown('First line\nSecond line\n\nThird', deps())
  assert.equal(md, 'First line\n\nSecond line\n\nThird')
})

test('content with no visible text gives an empty string', () => {
  for (const html of ['', '   ', '<p></p>', '<p>&nbsp;</p>', '<section class="secret"><p>x</p></section>']) {
    assert.equal(richTextToMarkdown(html, deps()), '')
  }
  assert.equal(richTextToMarkdown(null, deps()), '')
})

test('scripts, styles and event handlers do not reach the note', () => {
  const md = richTextToMarkdown('<p>Safe</p><script>alert(1)</script><style>p{color:red}</style><img src="x" onerror="alert(2)">', deps())
  assert.match(md, /Safe/)
  assert.doesNotMatch(md, /alert|onerror|color:red/)
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test test/markdown-export-rich-text.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `richTextToMarkdown` in `scripts/markdown-export/rich-text.js`**

Order of work: parse into an element created by `deps.doc`; drop `script` and `style` elements and every `on*` attribute; drop `section.secret:not(.revealed)` unless `isGM`; rewrite Foundry syntax in text nodes only; return `''` if no visible text is left; convert; tidy.

Foundry syntax, as Foundry's own enrichers match it:
- Document link: `@Word[target]` with an optional `{label}`, where `Word` is `UUID`, `Compendium` or a document type name. Label when present, else `resolveName(target)` for `@UUID`, else nothing.
- Inline roll: `[[...]]` with an optional `{label}`. Label when present; otherwise the formula with a leading `/roll`, `/r` or other `/command` removed and anything from ` #` on (the roll's flavor) removed. Foundry treats every balanced `[[...]]` as an inline roll, so do the same: `[[Arkham]]` becomes `Arkham`. Only an unbalanced `[[` is left for the tidy step to escape.

Tidy: remove `<!-- -->` lines, collapse three or more newlines to two, trim, escape each remaining `[[` as `\[\[`.

Text with no HTML tag at all is wrapped first: each non-empty line becomes a `<p>`, with its text escaped.

- [ ] **Step 4: Run the tests and lint**

Run: `node --test test/markdown-export-rich-text.test.js && npm run lint`
Expected: PASS, no lint errors. If a tidy assertion fails because showdown emits a marker the plan did not list, extend the tidy step, not the test.

- [ ] **Step 5: Commit**

```bash
git add scripts/markdown-export/rich-text.js test/markdown-export-rich-text.test.js package.json package-lock.json
git commit -m "feat: convert Foundry rich text to Obsidian-safe Markdown"
```

---

### Task 3: Read the actor into plain data

**Files:**
- Create: `scripts/markdown-export/collect.js`
- Test: `test/markdown-export-collect.test.js`

**Interfaces:**
- Produces: `collectSheetData(actor: Actor, options: CollectOptions): SheetData`
- `CollectOptions = { isGM: boolean, oneBlockBackstory: boolean, displayPlayerName: boolean, locale: string }`
- `SheetData`:

```js
{
  name: string,
  infos: { occupation, age, sex, residence, birthplace, archetype, organization, player }, // strings, '' when blank
  vitals: { hp, hpMax, mp, mpMax, san, sanMax, luck, mov, build },                        // number | null
  db: string, armor: string,                                                              // '' when blank
  characteristics: { str, con, siz, dex, app, int, pow, edu },                            // number | null
  skills: [{ name: string, value: number }],                                              // sorted by name, options.locale
  weapons: [{ name, skill, damage, range, attacks, ammo, malfunction }],                  // strings, '' when blank
  possessions: { item: string[], book: string[], spell: string[], talent: string[], armor: string[], status: string[] },
  wealth: { spendingLevel: string, cash: string, assets: string, assetsDetails: string },
  notes: string,
  background: [{ title: string, html: string }],
  encounters: [{ type: string, totalLoss: number | null, immunity: boolean }],
  keeperNotesHtml: string | null                                                          // null unless options.isGM
}
```

Where each value comes from (all under `actor.system` unless it starts with `actor.`):

| Field | Source |
|---|---|
| `infos.occupation`, `infos.archetype` | `actor.occupation?.name`, `actor.archetype?.name`; else `infos.occupation`, `infos.archetype` |
| `infos.player` | `infos.playername`; when blank and `displayPlayerName`, `actor.userOwner?.name` |
| other `infos.*` | `infos.age`, `.sex`, `.residence`, `.birthplace`, `.organization` |
| `vitals` | `attribs.hp.value`, `.hp.max`, `.mp.value`, `.mp.max`, `.san.value`, `.san.max`, `.lck.value`, `.mov.value`, `.build.value` |
| `db`, `armor` | `attribs.db.value`, `attribs.armor.value`, as strings |
| `characteristics.x` | `characteristics.x.value` |
| `skills` | items of type `skill`: `item.name`, `item.system.value` |
| `weapons[].skill` | `item.system.skillMain` → `"<name> <system.value>%"`; when undefined, `item.system.skill.main.name` |
| `weapons[].damage`, `.range` | non-blank `range.normal`, `.long`, `.extreme` `.damage` / `.value`, joined with ` / ` |
| `weapons[].attacks` | `usesPerRound.normal`, plus ` (<max>)` when `usesPerRound.max` is set |
| `weapons[].ammo` | ranged only (`properties.rngd`): `ammo`, as `"<ammo>/<bullets>"` when `bullets` is not null |
| `weapons[].malfunction` | `malfunction`, `''` when null |
| `possessions.<type>` | names of items of that type, in `actor.items` order |
| `wealth` | `flags.manualCredit` on: `monetary.spendingLevel`, `.cash`, `.assets`. Off: `actor.system.formattedMonetaryValue('spending' \| 'cash' \| 'assets')`. `assetsDetails` from `monetary.assetsDetails` |
| `notes` | `notes` |
| `background` | `oneBlockBackstory` on: one entry `{ title: '', html: backstory }` when `backstory` is non-blank. Off: `biography` entries whose `value` is non-blank, as `{ title, html: value }` |
| `encounters` | `sanityLossEvents` as is |
| `keeperNotesHtml` | `description.keeper` when `isGM`, else `null` |

- [ ] **Step 1: Write the failing tests**

Build a `fakeActor(overrides)` helper in the test file: a plain object shaped like the table above, with `items` as an array that also has `get(id)`, and `system.formattedMonetaryValue: type => '$' + { spending: 10, cash: 150, assets: 3750 }[type]`. Weapon items get `system.skillMain` as a getter-free property pointing at a skill item or `undefined`.

```js
const OPTIONS = { isGM: false, oneBlockBackstory: false, displayPlayerName: false, locale: 'en' }

test('collects infos, vitals and characteristics', () => { /* assert.deepEqual on data.infos, data.vitals, data.characteristics, data.db, data.armor */ })

test('occupation and archetype items win over the stored text', () => {
  const data = collectSheetData(fakeActor({ occupation: { name: 'Journalist' }, infos: { occupation: 'stale' } }), OPTIONS)
  assert.equal(data.infos.occupation, 'Journalist')
})

test('a blank player name falls back to the owning user only when the setting is on', () => {
  const actor = fakeActor({ infos: { playername: '' }, userOwner: { name: 'Martin' } })
  assert.equal(collectSheetData(actor, OPTIONS).infos.player, '')
  assert.equal(collectSheetData(actor, { ...OPTIONS, displayPlayerName: true }).infos.player, 'Martin')
})

test('skills are sorted by name in the given locale', () => {
  // items named 'Écoute', 'Zoologie', 'Anthropologie' with locale 'fr'
  assert.deepEqual(data.skills.map(s => s.name), ['Anthropologie', 'Écoute', 'Zoologie'])
})

test('a weapon row shows its linked skill and value', () => {
  assert.deepEqual(data.weapons[0], {
    name: '.38 Revolver', skill: 'Handgun 40%', damage: '1D10', range: '15', attacks: '1 (3)', ammo: '6/6', malfunction: '100'
  })
})

test('a melee weapon has no ammo, and joins several range bands', () => { /* ammo '', damage '1D8 / 1D4', range '10 / 20' */ })

test('a weapon whose linked skill is gone falls back to the stored skill name', () => {
  // skillMain undefined, system.skill.main.name 'Handgun'
  assert.equal(data.weapons[0].skill, 'Handgun')
})

test('possessions are grouped by item type', () => { /* item, book, spell, talent, armor, status; occupation and skill items appear in none */ })

test('wealth uses the computed values unless manual credit is on', () => {
  assert.deepEqual(computed.wealth, { spendingLevel: '$10', cash: '$150', assets: '$3750', assetsDetails: 'A house' })
  assert.deepEqual(manual.wealth, { spendingLevel: 'modest', cash: '12', assets: 'none', assetsDetails: 'A house' })
})

test('background follows the one-block setting', () => {
  // actor has backstory '<p>Story</p>' and biography [{title:'Traits', value:'<p>Bold</p>'}, {title:'Empty', value:''}]
  assert.deepEqual(sections.background, [{ title: 'Traits', html: '<p>Bold</p>' }])
  assert.deepEqual(oneBlock.background, [{ title: '', html: '<p>Story</p>' }])
})

test('Keeper notes are collected for a GM only', () => {
  const actor = fakeActor({ keeper: '<p>He is a cultist</p>' })
  assert.equal(collectSheetData(actor, OPTIONS).keeperNotesHtml, null)
  assert.equal(collectSheetData(actor, { ...OPTIONS, isGM: true }).keeperNotesHtml, '<p>He is a cultist</p>')
})

test('incomplete actor data does not throw', () => {
  const bare = { name: 'Nobody', items: [], system: { infos: {}, attribs: {}, characteristics: {}, flags: {}, monetary: {}, description: {} } }
  const data = collectSheetData(bare, OPTIONS)
  assert.equal(data.vitals.hp, null)
  assert.deepEqual(data.skills, [])
  assert.deepEqual(data.background, [])
  assert.deepEqual(data.encounters, [])
  assert.deepEqual(data.wealth, { spendingLevel: '', cash: '', assets: '', assetsDetails: '' })
})
```

Write out the elided bodies with concrete fixture values of your choosing; each named test must exist.

- [ ] **Step 2: Run them and see them fail**

Run: `node --test test/markdown-export-collect.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `collectSheetData` in `scripts/markdown-export/collect.js`**

One small function per `SheetData` branch. `actor.items` may be a Foundry `Collection` or an array: iterate it with `[...actor.items]`. A missing `formattedMonetaryValue` (bare actor) gives `''`.

- [ ] **Step 4: Run the tests and lint**

Run: `node --test test/markdown-export-collect.test.js && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/markdown-export/collect.js test/markdown-export-collect.test.js
git commit -m "feat: collect an investigator's sheet data for export"
```

---

### Task 4: Render the note

**Files:**
- Create: `scripts/markdown-export/render.js`
- Test: `test/markdown-export-render.test.js`

**Interfaces:**
- Consumes: `SheetData` (Task 3); `yamlString`, `tableCell`, `inlineText` (Task 1).
- Produces: `renderNote(data: SheetData, deps: RenderDeps): string`
- `RenderDeps = { labels: Record<string, string>, today: string, richText: (html: string) => string }`. `today` is `YYYY-MM-DD`. `richText` returns Markdown, `''` when there is nothing to show.
- `labels` keys the renderer reads (Task 5 fills them): `characteristics str con siz dex app int pow edu hp mp san luck mov db build armor skills skill regular hard extreme weapons weapon damage range attacks ammo malfunction possessions items books spells talents armors statuses wealth spendingLevel cash assets background encounters immune keeperNotes`.

In the tests, `labels` maps every key to an English word (`skills: 'Skills'`, `armors: 'Armor'`, `statuses: 'Status'`, `wealth: 'Cash and Assets'`, `encounters: 'Losses from Strange Entities'`, `keeperNotes: "Keeper's notes"`, `immune: 'immune'`, and so on), and `richText` is `html => html.replace(/<[^>]+>/g, '').trim()`.

- [ ] **Step 1: Write the failing tests**

```js
test('renders the full note', () => {
  // data: the Harvey Walters sample from the spec, one biography section, one Keeper note
  assert.equal(renderNote(harvey, deps), EXPECTED)
})
```

`EXPECTED` is a literal string in the test file, laid out exactly as the spec's sample, with these fixed rules: one blank line between blocks; the file ends with a single newline; property order as in the spec; `exported: 2026-11-22` unquoted; numbers unquoted; table separator rows are `| --- |` per column; the vitals line joins `**<label>** <value>` parts with ` · `, pairs written `11/11`.

```js
test('blank infos and null vitals drop their property', () => {
  // archetype '', organization '', hp null
  assert.doesNotMatch(note, /^archetype:|^organization:|^hp:|^hp_max:/m)
  assert.match(note, /^type: "investigator"$/m)
  assert.match(note, /^tags:\n {2}- coc7\/investigator$/m)
})

test('a hostile occupation cannot break the properties block', () => {
  // occupation 'x"\ny: z'
  assert.match(note, /^occupation: "x\\" y: z"$/m)
})

test('empty sections leave no heading', () => {
  // no skills, weapons, possessions, wealth, notes, background, encounters
  assert.doesNotMatch(note, /^## (Skills|Weapons|Possessions|Background|Losses)/m)
})

test('an empty possession group is skipped, a filled one is listed', () => {
  // only books: ['Necronomicon']
  assert.match(note, /^## Possessions\n\n### Books\n\n- Necronomicon$/m)
  assert.doesNotMatch(note, /^### (Items|Spells)/m)
})

test('skill rows compute hard and extreme', () => {
  // { name: 'Art/Craft (Photography)', value: 45 }
  assert.match(note, /^\| Art\/Craft \(Photography\) \| 45 \| 22 \| 9 \|$/m)
})

test('names cannot break tables or create links', () => {
  // skill 'Lore|Occult', item '[[Trap]]\nsecond line'
  assert.match(note, /^\| Lore\\\|Occult \|/m)
  assert.match(note, /^- \\\[\\\[Trap]] second line$/m)
})

test('a background section whose rich text is empty is skipped', () => {
  // background [{ title: 'Traits', html: '<p></p>' }] only
  assert.doesNotMatch(note, /^## Background|^### Traits/m)
})

test('an untitled background section has no sub-heading', () => {
  // background [{ title: '', html: '<p>Story</p>' }]
  assert.match(note, /^## Background\n\nStory$/m)
})

test('encounters show the loss or the immunity', () => {
  assert.match(note, /^- Ghoul \(3\)$/m)
  assert.match(note, /^- Deep One \(immune\)$/m)
})

test('Keeper notes sit in one folded callout', () => {
  // richText returns 'First.\n\nSecond.'
  assert.match(note, /^> \[!danger\]- Keeper's notes\n> First\.\n>\n> Second\.$/m)
})

test('no Keeper notes means no callout and no Keeper label', () => {
  for (const keeperNotesHtml of [null, '', '<p></p>']) {
    assert.doesNotMatch(renderNote({ ...harvey, keeperNotesHtml }, deps), /danger|Keeper/)
  }
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test test/markdown-export-render.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `renderNote` in `scripts/markdown-export/render.js`**

One function per section, each returning a string or `''`; `renderNote` joins the non-empty ones with a blank line. Wealth is a `###` group under Possessions: a bullet per non-blank value (`- **<label>:** <value>`), then `assetsDetails` and `notes` as paragraphs. Possessions notes and assets details are plain text: pass them through `inlineText` per line.

- [ ] **Step 4: Run the tests and lint**

Run: `node --test test/markdown-export-render.test.js && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/markdown-export/render.js test/markdown-export-render.test.js
git commit -m "feat: render an investigator as an Obsidian note"
```

---

### Task 5: Header menu entry, labels and manifest

**Files:**
- Create: `scripts/markdown-export/labels.js`, `scripts/markdown-export/index.js`
- Modify: `module.json` (append `scripts/markdown-export/index.js` to `esmodules`; mention the export in `description`), `lang/en.json`, `lang/fr.json`
- Test: `test/markdown-export-labels.test.js`

**Interfaces:**
- Consumes: `collectSheetData` (Task 3), `renderNote` (Task 4), `richTextToMarkdown` (Task 2), `fileNameFor` (Task 1), `t` from `scripts/utils.js`, `LOG_PREFIX` from `scripts/constants.js`.
- Produces: `LABEL_KEYS: Record<string, string>` in `labels.js`, mapping each `labels` key of Task 4 to an i18n key.

`LABEL_KEYS` values. CoC7 keys (all present at 8.16 and 9.2):

| labels key | i18n key |
|---|---|
| `characteristics` | `CoC7.Characteristics` |
| `str` … `edu` | `CHARAC.STR`, `CHARAC.CON`, `CHARAC.SIZ`, `CHARAC.DEX`, `CHARAC.APP`, `CHARAC.INT`, `CHARAC.POW`, `CHARAC.EDU` |
| `hp`, `mp`, `san`, `luck`, `mov`, `db`, `build`, `armor` | `CoC7.HP`, `CoC7.MP`, `CoC7.SAN`, `CoC7.Luck`, `CoC7.Mov`, `CoC7.DB`, `CoC7.Build`, `CoC7.Armor` |
| `skills`, `skill` | `CoC7.Skills`, `CoC7.Skill` |
| `regular`, `hard`, `extreme` | `CoC7.RollDifficultyRegular`, `CoC7.RollDifficultyHard`, `CoC7.RollDifficultyExtreme` |
| `weapons`, `damage`, `range`, `malfunction` | `CoC7.Weapons`, `CoC7.WeaponDamage`, `CoC7.WeaponRange`, `CoC7.WeaponMalfunction` |
| `possessions`, `items`, `books`, `spells`, `talents`, `armors`, `statuses` | `CoC7.Possessions`, `CoC7.Items`, `CoC7.Books`, `CoC7.Spells`, `CoC7.PulpTalents`, `CoC7.Armor`, `CoC7.Status` |
| `wealth`, `background`, `encounters`, `keeperNotes` | `CoC7.MonetaryTitle`, `CoC7.Background`, `CoC7.BackgroundEncounters`, `CoC7.GmNotes` |

Because the sheet's own wording is reused, three headings differ from the spec's English sample: "Status", "Cash and Assets" and "Losses from Strange Entities".

Module keys, added to both lang files:

| Key | en | fr |
|---|---|---|
| `COC7QOL.MarkdownExport.Button` | Export to Markdown | Exporter en Markdown |
| `COC7QOL.MarkdownExport.Failed` | Could not export {name} to Markdown: {error} | Impossible d'exporter {name} en Markdown : {error} |
| `COC7QOL.MarkdownExport.Weapon` (`weapon`) | Weapon | Arme |
| `COC7QOL.MarkdownExport.Attacks` (`attacks`) | Attacks | Attaques |
| `COC7QOL.MarkdownExport.Ammo` (`ammo`) | Ammo | Munitions |
| `COC7QOL.MarkdownExport.SpendingLevel` (`spendingLevel`) | Spending level | Dépenses courantes |
| `COC7QOL.MarkdownExport.Cash` (`cash`) | Cash | Espèces |
| `COC7QOL.MarkdownExport.Assets` (`assets`) | Assets | Capital |
| `COC7QOL.MarkdownExport.Immune` (`immune`) | immune | immunisé |

- [ ] **Step 1: Write the failing test**

```js
const LABELS_USED = ['characteristics', 'str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu', 'hp', 'mp', 'san', 'luck', 'mov', 'db', 'build', 'armor', 'skills', 'skill', 'regular', 'hard', 'extreme', 'weapons', 'weapon', 'damage', 'range', 'attacks', 'ammo', 'malfunction', 'possessions', 'items', 'books', 'spells', 'talents', 'armors', 'statuses', 'wealth', 'spendingLevel', 'cash', 'assets', 'background', 'encounters', 'immune', 'keeperNotes']

test('LABEL_KEYS covers exactly the labels the renderer reads', () => {
  assert.deepEqual(Object.keys(LABEL_KEYS).sort(), [...LABELS_USED].sort())
})

test('every module-owned label key exists in lang/en.json', () => {
  const en = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'))
  for (const key of [...Object.values(LABEL_KEYS), 'COC7QOL.MarkdownExport.Button', 'COC7QOL.MarkdownExport.Failed']) {
    if (key.startsWith('COC7QOL.')) assert.ok(key in en, key)
  }
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/markdown-export-labels.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Add `labels.js` and the lang keys**

- [ ] **Step 4: Implement `scripts/markdown-export/index.js`**

```js
const EXPORT_ACTION = 'coc7qol-export-markdown'
const SYSTEM_ID = 'CoC7'

Hooks.on('getHeaderControlsActorSheetV2', (app, controls) => {
  const actor = app.document
  if (actor?.type !== 'character' || !actor.isOwner) return
  controls.push({
    action: EXPORT_ACTION,
    icon: 'fa-solid fa-file-export',
    label: 'COC7QOL.MarkdownExport.Button',
    onClick: () => exportActor(actor)
  })
})
```

`exportActor(actor)`, wrapped in one `try` / `catch`:
- `isGM = game.user.isGM`.
- `oneBlockBackstory` and `displayPlayerName` from `game.settings.get(SYSTEM_ID, 'oneBlockBackstory')` and `game.settings.get(SYSTEM_ID, 'displayPlayerNameOnSheet')`.
- `locale = game.i18n.lang`.
- `doc = document.implementation.createHTMLDocument('')` (inert).
- `converter = new window.showdown.Converter()`; `htmlToMarkdown = html => converter.makeMarkdown(html, doc)`.
- `resolveName = uuid => fromUuidSync(uuid)?.name`, itself in a `try` returning `undefined` (it throws for some compendium UUIDs).
- `labels` = each `LABEL_KEYS` entry through `t`.
- `today` = local date as `YYYY-MM-DD`.
- `foundry.utils.saveDataToFile(note, 'text/markdown', fileNameFor(actor.name))`.
- On error: `console.error(LOG_PREFIX, 'Exporting the investigator to Markdown failed:', err)` and `ui.notifications.error('COC7QOL.MarkdownExport.Failed', { format: { name: actor.name, error: err.message } })`, the pattern of `scripts/spell-cast/index.js`.

- [ ] **Step 5: Run everything**

Run: `npm test && npm run lint`
Expected: PASS, including `test/lang-parity.test.js` and `test/manifest.test.js`.

- [ ] **Step 6: Commit**

```bash
git add scripts/markdown-export/labels.js scripts/markdown-export/index.js test/markdown-export-labels.test.js module.json lang/en.json lang/fr.json
git commit -m "feat: add Export to Markdown to the investigator sheet menu"
```

---

### Task 6: Check in a running Foundry, then document

**Files:**
- Modify: whatever the checks below show to be wrong, with a test added first in the owning task's test file
- Create: `docs/features/markdown-export.md`
- Modify: `README.md` (row in "What's inside", a section in the style of the others), `CHANGELOG.md` (an `### Added` entry under a new unreleased heading in the file's existing style)

Follow "Browser automation with Playwright" in `CLAUDE.md`. `module.json` changed, so the world must be relaunched for the new script to load. Only a v14 / CoC7 9.x world runs locally.

- [ ] **Step 1: As Gamemaster, open an investigator and find the entry**

Expected: the "⋮" header menu lists **Export to Markdown**. It is absent on an NPC sheet.

- [ ] **Step 2: Capture the note without a file dialog**

In `browser_evaluate`, replace `foundry.utils.saveDataToFile` with a function that stores its three arguments on `window`, click the entry, read them back, then restore the original.
Expected: type `text/markdown`, file name `<actor name>.md`, and a note with every section the sheet has content for.

- [ ] **Step 3: Compare the note with the sheet**

Give the investigator a backstory with bold text, a list, an `@UUID` link, an inline roll and a secret block; a biography section; a weapon; Keeper notes of two paragraphs. Check each against the spec: values match the sheet, wealth is currency-formatted, no `[[`, no `<!--`, Keeper notes inside the callout. Toggle CoC7's one-block backstory setting and check the background follows it.

- [ ] **Step 4: As a player who owns the investigator, export again**

Expected: no Keeper callout, no Keeper label, no unrevealed secret text. A player who does not own the investigator has no entry in the menu.

- [ ] **Step 5: Open the file in Obsidian's format**

Paste the captured note into a `.md` file and check it against the `obsidian:obsidian-markdown` skill: the properties block parses, tables render, the callout folds.

- [ ] **Step 6: Fix what the checks found**

For each defect: a failing test in the owning test file, the fix, `npm test && npm run lint`.

- [ ] **Step 7: Write the feature page, README section and CHANGELOG entry**

State what is exported, where the entry is, who sees it, and the Keeper rule. Mirror `docs/features/strong-skills.md` and its README section.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: document the Markdown export"
```

Step 6 fixes are committed separately, each as `fix:` with its test.
