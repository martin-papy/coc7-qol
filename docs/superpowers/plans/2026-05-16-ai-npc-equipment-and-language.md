# AI NPC Equipment & Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing AI NPC generator with localized free-text narrative (matching the user's prompt language) and occupation-aligned weapons + possessions, in a single LLM call, editable via toggle-remove in the confirmation dialog.

**Architecture:** The NPC mapper (`mappers/npc.js`) imports the weapon mapper directly and reuses it inside two new helpers (`_validateAndMapWeapons`, `_mapPossessions`) called from `toFoundryData()`. The return shape gains `weaponsData`, `possessionsData`, and a non-blocking `warnings` array. The NPC confirmation dialog grows two new sections (weapons, possessions) with toggle-style × buttons that mark rows for removal without deleting them, plus an optional warnings section. The dialog-injector's `onAccept` builds a single batched `createEmbeddedDocuments('Item', items)` call covering skills + weapons + possessions.

**Tech Stack:** Vanilla ES modules, no build step. FoundryVTT v13+ ApplicationV2 API. CoC7 system runtime (`CoC7.skills` compendium, `CONFIG.Item.dataModels.skill`). Manual testing only (no test runner in this repo).

---

## Reference Notes for the Implementing Engineer

**Why no automated tests in tasks below.** Per `CLAUDE.md`: "No automated tests. All features require manual testing in a running FoundryVTT instance with the CoC7 system." Each task therefore has a **syntax check** step (`node --check`) and a **manual verification** step. Do not skip the manual step — the syntax check only proves the file parses.

**The weapon JSON in spec §4.1 is illustrative, not authoritative.** Spec §4.2 says the weapon sub-schema "Mirrors the existing standalone weapon-generator schema (single source of truth in `mappers/weapon.js`)". That means the prompt and code must use the actual weapon mapper's field names:

| Real weapon mapper field | NOT (spec §4.1 example) |
|---|---|
| `skill` | ~~`skillName`~~ |
| `range` (integer, no unit) | ~~`range` (string "15 yards")~~ |
| `usesPerRound` (string) | ~~`attacks`~~ |
| `bullets` (number) | ~~`ammo`~~ |
| `malfunction` (number) | (same) |
| `properties: { rngd, impl, addb, ahdb }` | ~~`{ rngd, hndg }`~~ |

Use the real schema everywhere — in the NPC SYSTEM_PROMPT, in the dialog row renderer, and in any test prompts you craft.

**Where `npcData` flows.** `mapper.toFoundryData(llmData)` produces the object the rest of the pipeline consumes. The shape after this plan is implemented:

```js
{
  actorData,          // unchanged
  skillsRaw,          // unchanged (resolved later by mapper.resolveSkills)
  weaponsData,        // NEW — Foundry-ready Item.create payloads (type: 'weapon')
  possessionsData,    // NEW — Foundry-ready Item.create payloads (type: 'item')
  warnings,           // NEW — array of human-readable strings
  llmData             // unchanged — raw LLM JSON, used by the dialog for display
}
```

`applyRandomCharacteristics(npcData)` (already in `npc.js`) spreads `...npcData`, so new fields pass through unchanged. No edit needed there.

**Index-based filtering survives toggle/untoggle.** Removed rows stay in the DOM. The dialog keeps two `Set<number>` instances — `removedWeaponIndexes` and `removedPossessionIndexes` — and filters at Accept time using the original arrays' indexes. Re-clicking the × removes the index. Indexes are stable because we never reorder or splice the arrays.

**i18n keys.** Spec §6.5 uses `COC7QOL.AIGenerator.NPC.Preview.*` and `COC7QOL.AIGenerator.NPC.Button.*`. The existing dialog already uses `COC7QOL.AIGenerator.NPCDialog.*` for older sections — don't rename those; just add the new namespace alongside. Keep both.

**Syntax check command.** `node --check path/to/file.js` parses an ES module without running it. Use this after every JS edit.

---

## File Structure

```
scripts/ai-generator/
  mappers/
    npc.js                       ← MODIFY: extend SYSTEM_PROMPT, add helpers,
                                   extend toFoundryData return shape
  npc-confirmation-dialog.js     ← MODIFY: weapons / possessions / warnings sections,
                                   toggle-style remove, header counts, filter on Accept
  dialog-injector.js             ← MODIFY: NPC_PROMPT_CONFIG.onAccept batches
                                   skills + weapons + possessions in one call

lang/
  en.json                        ← MODIFY: add 6 new strings + rename NPCSkillsFailed
  fr.json                        ← MODIFY: matching French translations

styles/
  ai-generator.css               ← MODIFY: .coc7-ai-removed, .coc7-ai-warnings,
                                   list-row styling
```

No new files. No `module.json` change.

---

### Task 1: Extend the NPC SYSTEM_PROMPT (language + equipment)

**Files:**
- Modify: `scripts/ai-generator/mappers/npc.js:8-31` (the `SYSTEM_PROMPT` constant)

- [ ] **Step 1: Replace the SYSTEM_PROMPT constant**

Replace the entire current `SYSTEM_PROMPT` constant (lines 8–31) with the version below. Two changes:
1. Added language guidance block right after the JSON-only instruction.
2. Added two new optional top-level arrays — `weapons` and `possessions` — with the actual weapon schema field names.

```js
const SYSTEM_PROMPT = `You are a Call of Cthulhu 7th Edition game master assistant. Generate a CoC7 NPC based on the user's description.

The NPC should be a believable person with enough depth to be credible in a tabletop RPG session. Pick characteristics, skills, and narrative details that are internally consistent with the described occupation, age, and personality.

Respond with ONLY a valid JSON object. No explanation, no markdown fences, no extra text — raw JSON only.

LANGUAGE RULES:
- Write the free-text narrative fields (physicalDescription, personalityTraits, background, and weapons[].description / possessions[].description) in the SAME LANGUAGE as the user's prompt. If the user wrote in French, write these fields in French. Same for Spanish, German, Japanese, etc.
- The "name" field should be culturally appropriate for the setting/era (use your judgement).
- KEEP THE FOLLOWING IN ENGLISH regardless of prompt language:
  - "occupation" (required for system lookups)
  - every entry in skills[].name (required for compendium lookup — use the official CoC7 English skill names exactly)
- Weapon and possession "name" fields should typically be in English for canonical items (e.g. "Colt 1911", "Pocket notebook"), but use your judgement for culturally specific items.
- If the prompt is mixed-language, pick the dominant language. If the prompt is very short (e.g. "a doctor"), default to English.

Required fields (must always be present):
- name: string — full name of the NPC
- characteristics: object with all 8 integer values:
  - str, con, siz, dex, app, int, pow, edu
  - Values range 15–90 for a typical human, consistent with CoC7 3d6×5 / (2d6+6)×5 generation
  - Calibrate to occupation and age (e.g. elderly librarian: high EDU/INT, lower STR/DEX)
- skills: array of { "name": string, "value": number } — pick skills that fit the character naturally
  - Use official CoC7 skill names (e.g. "Library Use", "Spot Hidden", "Fighting (Brawl)", "Firearms (Handgun)", "Psychology", "Persuade", "First Aid", "Medicine", "Drive Auto", "Dodge", "Listen", "Stealth", "Science (Chemistry)")
  - For specializations use the format "Category (Specialization)" e.g. "Art/Craft (Painting)", "Science (Pharmacy)", "Language (French)"
  - Values 1–99 as percentages
  - Include whatever skills make sense for the character — typically 5–12 skills

Optional fields (include when relevant, omit if not applicable):
- occupation: string — the NPC's job or role (e.g. "Pharmacist", "Dockworker", "Professor")
- age: number — age in years
- physicalDescription: string — 1-2 sentences describing appearance
- personalityTraits: string — 1-2 sentences describing personality and demeanour
- background: string — 2-3 sentences of relevant background, hooks, or secrets useful to a GM
- weapons: array of weapon objects (0–3 typical, may be omitted entirely for non-combatants). Each weapon:
  - name: string (required) — the weapon name
  - damage: string (required) — dice expression (e.g. "1d8", "1d6+1", "1d10+db")
  - skill: string (required) — the CoC7 skill name (e.g. "Firearms (Handgun)", "Fighting (Brawl)", "Throw")
  - description: string (optional) — flavour text
  - range: integer or null (optional) — effective range as a plain integer with NO unit (e.g. 15, 30); null for melee
  - usesPerRound: string (optional) — attacks per round (e.g. "1", "2")
  - bullets: number or null (optional) — magazine/cylinder capacity; null for non-firearms
  - malfunction: number or null (optional) — malfunction threshold 96–100; null for non-firearms
  - properties: object with boolean flags (optional): rngd (ranged), impl (impaling), addb (adds full damage bonus), ahdb (adds half damage bonus)
- possessions: array of possession objects (3–8 typical). Each possession:
  - name: string (required) — the item name
  - description: string (optional) — short flavour text
  - quantity: integer (optional, default 1) — positive integer

EQUIPMENT GUIDANCE:
- Add 0–3 weapons and 3–8 possessions, all consistent with the NPC's occupation, age, era, and personality.
- A pacifist librarian likely has 0 weapons; a 1920s detective might have a revolver and a few notebooks; a cultist might carry ritual items. Use judgement.`
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/ai-generator/mappers/npc.js`
Expected: no output (clean parse).

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-generator/mappers/npc.js
git commit -m "feat(ai-npc): extend SYSTEM_PROMPT with language + equipment instructions"
```

---

### Task 2: Add weapon/possession mapping helpers and extend `toFoundryData()`

**Files:**
- Modify: `scripts/ai-generator/mappers/npc.js` (top of file — add import; bottom of `toFoundryData()` — extend return; below `_resolveOneSkill` — add helpers)

- [ ] **Step 1: Add the weapon mapper import**

At the top of `scripts/ai-generator/mappers/npc.js`, after the existing `import { escapeHtml } from '../../utils.js'` line, add:

```js
import weaponMapper from './weapon.js'
```

- [ ] **Step 2: Extend `toFoundryData()` to call the new helpers and return the new fields**

Replace the entire `toFoundryData(data)` method body (currently lines 92–132) with the version below. The change is purely additive: the existing `actorData`, `skillsRaw`, and `llmData` are unchanged; three new fields appear in the return.

```js
  toFoundryData (data) {
    const personalityHtml = data.personalityTraits
      ? `<p><strong>Personality:</strong> ${escapeHtml(data.personalityTraits)}</p>`
      : ''
    const backgroundHtml = data.background
      ? `<p><strong>Background:</strong> ${escapeHtml(data.background)}</p>`
      : ''

    const warnings = []
    const weaponsData = this._validateAndMapWeapons(data.weapons, warnings)
    const possessionsData = this._mapPossessions(data.possessions)

    return {
      actorData: {
        name: data.name,
        type: 'npc',
        system: {
          characteristics: {
            str: { value: data.characteristics.str },
            con: { value: data.characteristics.con },
            siz: { value: data.characteristics.siz },
            dex: { value: data.characteristics.dex },
            app: { value: data.characteristics.app },
            int: { value: data.characteristics.int },
            pow: { value: data.characteristics.pow },
            edu: { value: data.characteristics.edu }
          },
          infos: {
            occupation: data.occupation ?? '',
            age: String(data.age ?? ''),
            type: '',
            organization: ''
          },
          biography: {
            personalDescription: { value: escapeHtml(data.physicalDescription) }
          },
          description: {
            keeper: personalityHtml + backgroundHtml
          }
        }
      },
      skillsRaw: data.skills,
      weaponsData,
      possessionsData,
      warnings,
      llmData: data
    }
  },
```

- [ ] **Step 3: Add `_validateAndMapWeapons` and `_mapPossessions` helpers**

Append the two methods below to the default-exported object in `scripts/ai-generator/mappers/npc.js`. Place them immediately after `_resolveOneSkill` (the current last method), inside the same object literal — so before the closing `}` of `export default { ... }`. Add a leading comma after `_resolveOneSkill`'s closing brace.

```js
  _validateAndMapWeapons (rawWeapons, warnings) {
    if (!Array.isArray(rawWeapons)) return []
    const mapped = []
    for (const raw of rawWeapons) {
      if (!raw || typeof raw !== 'object' || !raw.name) continue  // drop silently
      try {
        weaponMapper.validate(raw)
        mapped.push(weaponMapper.toFoundryData(raw))
      } catch (err) {
        warnings.push(`Weapon "${raw.name}": ${err.message}`)
      }
    }
    return mapped
  },

  _mapPossessions (rawPossessions) {
    if (!Array.isArray(rawPossessions)) return []
    const mapped = []
    for (const raw of rawPossessions) {
      if (!raw || typeof raw !== 'object' || !raw.name) continue  // drop silently
      const n = Math.floor(Number(raw.quantity))
      const quantity = Number.isFinite(n) && n > 0 ? n : 1
      mapped.push({
        name: raw.name,
        type: 'item',
        system: {
          description: { value: escapeHtml(raw.description ?? '') },
          quantity
        }
      })
    }
    return mapped
  }
```

- [ ] **Step 4: Syntax check**

Run: `node --check scripts/ai-generator/mappers/npc.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-generator/mappers/npc.js
git commit -m "feat(ai-npc): map weapons and possessions in NPC toFoundryData"
```

---

### Task 3: Add i18n strings (English + French) and rename `NPCSkillsFailed`

**Files:**
- Modify: `lang/en.json`
- Modify: `lang/fr.json`

The existing key `COC7QOL.AIGenerator.Error.NPCSkillsFailed` is generalized to `NPCItemsFailed` per spec §7.2. Keep the same `{error}` placeholder. The injector change in Task 8 will use the new key.

- [ ] **Step 1: Edit `lang/en.json`**

Make two changes to `lang/en.json`:

**a.** Rename `COC7QOL.AIGenerator.Error.NPCSkillsFailed` to `COC7QOL.AIGenerator.Error.NPCItemsFailed`, and update its value to reflect skills + equipment.

Find the line (currently line 47):
```json
  "COC7QOL.AIGenerator.Error.NPCSkillsFailed": "CoC7 AI Generator: NPC created but some skills failed — {error}",
```

Replace with:
```json
  "COC7QOL.AIGenerator.Error.NPCItemsFailed": "CoC7 AI Generator: NPC created but some items (skills/weapons/possessions) failed — {error}",
```

**b.** Add eight new keys (six string templates per spec §6.5, plus one extra "partial" header variant per type — see note below) before the closing brace of the `AIGenerator.NPCDialog.*` block. Insert these lines after `"COC7QOL.AIGenerator.NPCDialog.SectionBackground": "Background",` (currently line 62):

```json
  "COC7QOL.AIGenerator.NPC.Preview.WeaponsHeader": "Weapons ({count})",
  "COC7QOL.AIGenerator.NPC.Preview.WeaponsHeaderPartial": "Weapons ({kept} / {count})",
  "COC7QOL.AIGenerator.NPC.Preview.PossessionsHeader": "Possessions ({count})",
  "COC7QOL.AIGenerator.NPC.Preview.PossessionsHeaderPartial": "Possessions ({kept} / {count})",
  "COC7QOL.AIGenerator.NPC.Preview.WarningsHeader": "Warnings",
  "COC7QOL.AIGenerator.NPC.Preview.WeaponRowDamage": "{damage} • {skill}",
  "COC7QOL.AIGenerator.NPC.Preview.PossessionRowQuantity": "×{quantity}",
  "COC7QOL.AIGenerator.NPC.Button.RemoveItem": "Remove from NPC",
```

> **Why two header keys per type instead of one with an optional `{kept}`?** Foundry's `game.i18n.format` substitutes all named placeholders. There's no built-in "if defined" syntax. Cleanest path is two keys: a plain one when nothing is removed and a "partial" one when something is. The dialog picks which to format based on `removedSet.size`.

- [ ] **Step 2: Edit `lang/fr.json`**

Mirror the same edits in `lang/fr.json`.

**a.** Rename `NPCSkillsFailed` to `NPCItemsFailed`. Find line 47:
```json
  "COC7QOL.AIGenerator.Error.NPCSkillsFailed": "CoC7 AI Generator : PNJ créé mais certaines compétences ont échoué — {error}",
```

Replace with:
```json
  "COC7QOL.AIGenerator.Error.NPCItemsFailed": "CoC7 AI Generator : PNJ créé mais certains objets (compétences/armes/possessions) ont échoué — {error}",
```

**b.** Insert the eight new keys after `"COC7QOL.AIGenerator.NPCDialog.SectionBackground": "Historique",`:

```json
  "COC7QOL.AIGenerator.NPC.Preview.WeaponsHeader": "Armes ({count})",
  "COC7QOL.AIGenerator.NPC.Preview.WeaponsHeaderPartial": "Armes ({kept} / {count})",
  "COC7QOL.AIGenerator.NPC.Preview.PossessionsHeader": "Possessions ({count})",
  "COC7QOL.AIGenerator.NPC.Preview.PossessionsHeaderPartial": "Possessions ({kept} / {count})",
  "COC7QOL.AIGenerator.NPC.Preview.WarningsHeader": "Avertissements",
  "COC7QOL.AIGenerator.NPC.Preview.WeaponRowDamage": "{damage} • {skill}",
  "COC7QOL.AIGenerator.NPC.Preview.PossessionRowQuantity": "×{quantity}",
  "COC7QOL.AIGenerator.NPC.Button.RemoveItem": "Retirer du PNJ",
```

- [ ] **Step 3: Verify JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); JSON.parse(require('fs').readFileSync('lang/fr.json','utf8')); console.log('ok')"`
Expected output: `ok`

- [ ] **Step 4: Commit**

```bash
git add lang/en.json lang/fr.json
git commit -m "feat(i18n): add weapons/possessions/warnings strings for NPC dialog"
```

---

### Task 4: Confirmation dialog — render the Weapons section

**Files:**
- Modify: `scripts/ai-generator/npc-confirmation-dialog.js`

This task only adds the weapons section as a static (non-toggle) rendering. Toggle behavior is added in Task 7 once both sections exist.

- [ ] **Step 1: Add instance state for filtering, plus expose `tf`**

In `scripts/ai-generator/npc-confirmation-dialog.js`:

**a.** Update the import line at the top:

Find:
```js
import { escapeHtml, t } from '../utils.js'
```

Replace with:
```js
import { escapeHtml, t, tf } from '../utils.js'
```

**b.** Add two new private fields and update the field-block comment. Find the existing private field declarations (currently around line 21):

```js
  #npcData      // { actorData, skillsRaw, llmData } from mapper.toFoundryData()
  #acceptCallback
  #regenerateCallback
  #cancelCallback
```

Replace with:
```js
  #npcData      // { actorData, skillsRaw, weaponsData, possessionsData, warnings, llmData }
  #acceptCallback
  #regenerateCallback
  #cancelCallback
  #removedWeaponIndexes = new Set()
  #removedPossessionIndexes = new Set()
```

- [ ] **Step 2: Add the weapons section build in `_renderHTML`**

Inside `_renderHTML`, after the skills section is built (i.e. after the `const skillsHtml = ...` block, currently ending around line 88), but before the `// --- Narrative sections ---` comment, insert:

```js
    // --- Weapons section ---
    const weaponsData = this.#npcData.weaponsData ?? []
    const weaponsHtml = this.#renderWeaponsSection(weaponsData)
```

Then in the `div.innerHTML = ...` concatenation at the bottom of the method (currently line 108), insert `weaponsHtml` between `skillsHtml` and the narrative sections.

Find:
```js
    div.innerHTML = identityHtml + charsHtml + skillsHtml
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionAppearance'), llm.physicalDescription)
```

Replace with:
```js
    div.innerHTML = identityHtml + charsHtml + skillsHtml + weaponsHtml
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionAppearance'), llm.physicalDescription)
```

- [ ] **Step 3: Add the `#renderWeaponsSection` private method**

Add this method to the class body, after `_replaceHTML`:

```js
  #renderWeaponsSection (weaponsData) {
    if (!weaponsData.length) return ''
    const total = weaponsData.length
    const kept = total - this.#removedWeaponIndexes.size
    const headerLabel = this.#removedWeaponIndexes.size > 0
      ? tf('COC7QOL.AIGenerator.NPC.Preview.WeaponsHeaderPartial', { kept, count: total })
      : tf('COC7QOL.AIGenerator.NPC.Preview.WeaponsHeader', { count: total })
    const removeTitle = t('COC7QOL.AIGenerator.NPC.Button.RemoveItem')

    const rows = weaponsData.map((w, i) => {
      const name = w?.name ?? ''
      const damage = w?.system?.range?.normal?.damage ?? ''
      const skill = w?.system?.skill?.main?.name ?? ''
      const detail = tf('COC7QOL.AIGenerator.NPC.Preview.WeaponRowDamage', {
        damage: escapeHtml(damage),
        skill: escapeHtml(skill)
      })
      const removed = this.#removedWeaponIndexes.has(i) ? ' coc7-ai-removed' : ''
      return `
        <div class="coc7-npc-equip-row${removed}" data-equip-kind="weapon" data-equip-index="${i}">
          <span class="coc7-npc-equip-name">${escapeHtml(name)}</span>
          <span class="coc7-npc-equip-detail">${detail}</span>
          <button type="button" class="coc7-npc-equip-remove" title="${escapeHtml(removeTitle)}" aria-label="${escapeHtml(removeTitle)}">×</button>
        </div>`
    }).join('')

    return `
      <div class="coc7-npc-section" data-section="weapons">
        <div class="coc7-npc-section-label">${escapeHtml(headerLabel)}</div>
        <div class="coc7-npc-equip-list">${rows}</div>
      </div>`
  }
```

- [ ] **Step 4: Syntax check**

Run: `node --check scripts/ai-generator/npc-confirmation-dialog.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-generator/npc-confirmation-dialog.js
git commit -m "feat(ai-npc): render weapons section in confirmation dialog"
```

---

### Task 5: Confirmation dialog — render the Possessions section

**Files:**
- Modify: `scripts/ai-generator/npc-confirmation-dialog.js`

- [ ] **Step 1: Build the possessionsHtml in `_renderHTML`**

In `_renderHTML`, immediately after the line you added in Task 4 (`const weaponsHtml = this.#renderWeaponsSection(weaponsData)`), add:

```js
    // --- Possessions section ---
    const possessionsData = this.#npcData.possessionsData ?? []
    const possessionsHtml = this.#renderPossessionsSection(possessionsData)
```

And update the `div.innerHTML = ...` line to include `possessionsHtml` right after `weaponsHtml`:

Find:
```js
    div.innerHTML = identityHtml + charsHtml + skillsHtml + weaponsHtml
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionAppearance'), llm.physicalDescription)
```

Replace with:
```js
    div.innerHTML = identityHtml + charsHtml + skillsHtml + weaponsHtml + possessionsHtml
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionAppearance'), llm.physicalDescription)
```

- [ ] **Step 2: Add the `#renderPossessionsSection` private method**

Add this method to the class body, immediately after `#renderWeaponsSection`:

```js
  #renderPossessionsSection (possessionsData) {
    if (!possessionsData.length) return ''
    const total = possessionsData.length
    const kept = total - this.#removedPossessionIndexes.size
    const headerLabel = this.#removedPossessionIndexes.size > 0
      ? tf('COC7QOL.AIGenerator.NPC.Preview.PossessionsHeaderPartial', { kept, count: total })
      : tf('COC7QOL.AIGenerator.NPC.Preview.PossessionsHeader', { count: total })
    const removeTitle = t('COC7QOL.AIGenerator.NPC.Button.RemoveItem')

    const rows = possessionsData.map((p, i) => {
      const name = p?.name ?? ''
      const quantity = p?.system?.quantity ?? 1
      const qtyText = quantity > 1
        ? tf('COC7QOL.AIGenerator.NPC.Preview.PossessionRowQuantity', { quantity })
        : ''
      const removed = this.#removedPossessionIndexes.has(i) ? ' coc7-ai-removed' : ''
      return `
        <div class="coc7-npc-equip-row${removed}" data-equip-kind="possession" data-equip-index="${i}">
          <span class="coc7-npc-equip-name">${escapeHtml(name)}</span>
          <span class="coc7-npc-equip-detail">${escapeHtml(qtyText)}</span>
          <button type="button" class="coc7-npc-equip-remove" title="${escapeHtml(removeTitle)}" aria-label="${escapeHtml(removeTitle)}">×</button>
        </div>`
    }).join('')

    return `
      <div class="coc7-npc-section" data-section="possessions">
        <div class="coc7-npc-section-label">${escapeHtml(headerLabel)}</div>
        <div class="coc7-npc-equip-list">${rows}</div>
      </div>`
  }
```

- [ ] **Step 3: Syntax check**

Run: `node --check scripts/ai-generator/npc-confirmation-dialog.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-generator/npc-confirmation-dialog.js
git commit -m "feat(ai-npc): render possessions section in confirmation dialog"
```

---

### Task 6: Confirmation dialog — render the Warnings section

**Files:**
- Modify: `scripts/ai-generator/npc-confirmation-dialog.js`

- [ ] **Step 1: Build warningsHtml in `_renderHTML`**

In `_renderHTML`, immediately before the buttons block (currently `// --- Buttons ---`), add:

```js
    // --- Warnings ---
    const warnings = this.#npcData.warnings ?? []
    const warningsHtml = this.#renderWarningsSection(warnings)
```

Then update the `div.innerHTML = ...` concatenation: insert `+ warningsHtml` after the three `narrativeSection(...)` calls and before `+ buttonsHtml`. The final assignment becomes:

```js
    div.innerHTML = identityHtml + charsHtml + skillsHtml + weaponsHtml + possessionsHtml
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionAppearance'), llm.physicalDescription)
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionPersonality'), llm.personalityTraits)
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionBackground'), llm.background)
      + warningsHtml
      + buttonsHtml
```

- [ ] **Step 2: Add the `#renderWarningsSection` private method**

Add this method to the class body, immediately after `#renderPossessionsSection`:

```js
  #renderWarningsSection (warnings) {
    if (!warnings.length) return ''
    const items = warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')
    return `
      <div class="coc7-npc-section coc7-ai-warnings">
        <div class="coc7-npc-section-label">${escapeHtml(t('COC7QOL.AIGenerator.NPC.Preview.WarningsHeader'))}</div>
        <ul class="coc7-ai-warnings-list">${items}</ul>
      </div>`
  }
```

- [ ] **Step 3: Syntax check**

Run: `node --check scripts/ai-generator/npc-confirmation-dialog.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-generator/npc-confirmation-dialog.js
git commit -m "feat(ai-npc): render warnings section in confirmation dialog"
```

---

### Task 7: Wire toggle-style remove + filtering on Accept

**Files:**
- Modify: `scripts/ai-generator/npc-confirmation-dialog.js`

ApplicationV2's `_replaceHTML` runs every render. The cleanest hook for adding listeners after the DOM is in the document is `_onRender` (called after `_replaceHTML`). We attach a single delegated click listener per render and let it dispatch by `data-equip-kind` + `data-equip-index`.

- [ ] **Step 1: Add `_onRender` to attach listeners, plus toggle + section-refresh helpers**

Add these methods to the class body, immediately after `_replaceHTML` and before the three static handlers:

```js
  _onRender (_context, _options) {
    const root = this.element
    if (!root) return
    this.#attachEquipRemoveListeners(root)
  }

  #attachEquipRemoveListeners (scope) {
    scope.querySelectorAll('.coc7-npc-equip-remove').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.preventDefault()
        const row = btn.closest('.coc7-npc-equip-row')
        if (!row) return
        const kind = row.dataset.equipKind
        const idx = Number(row.dataset.equipIndex)
        if (!Number.isInteger(idx)) return
        this.#toggleRemoved(kind, idx)
      })
    })
  }

  #toggleRemoved (kind, index) {
    const set = kind === 'weapon' ? this.#removedWeaponIndexes : this.#removedPossessionIndexes
    if (set.has(index)) set.delete(index)
    else set.add(index)
    this.#refreshEquipSection(kind)
  }

  #refreshEquipSection (kind) {
    const root = this.element
    if (!root) return
    const selector = `[data-section="${kind === 'weapon' ? 'weapons' : 'possessions'}"]`
    const oldSection = root.querySelector(selector)
    if (!oldSection) return
    const data = kind === 'weapon'
      ? (this.#npcData.weaponsData ?? [])
      : (this.#npcData.possessionsData ?? [])
    const html = kind === 'weapon'
      ? this.#renderWeaponsSection(data)
      : this.#renderPossessionsSection(data)
    const template = document.createElement('template')
    template.innerHTML = html.trim()
    const newSection = template.content.firstElementChild
    if (!newSection) return
    oldSection.replaceWith(newSection)
    this.#attachEquipRemoveListeners(newSection)
  }
```

> **Why a hand-rolled section refresh instead of `this.render()`?** ApplicationV2 `render()` would rebuild the entire dialog and lose scroll position. Replacing just the affected section is cheap and keeps the rest of the dialog stable.

- [ ] **Step 2: Filter on Accept**

Replace the `#handleAccept` static method (currently lines 121–124) with:

```js
  static async #handleAccept (_event, _target) {
    const data = this.#npcData
    const filteredWeapons = (data.weaponsData ?? [])
      .filter((_, i) => !this.#removedWeaponIndexes.has(i))
    const filteredPossessions = (data.possessionsData ?? [])
      .filter((_, i) => !this.#removedPossessionIndexes.has(i))
    await this.#acceptCallback({
      ...data,
      weaponsData: filteredWeapons,
      possessionsData: filteredPossessions
    })
    this.close()
  }
```

- [ ] **Step 3: Syntax check**

Run: `node --check scripts/ai-generator/npc-confirmation-dialog.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-generator/npc-confirmation-dialog.js
git commit -m "feat(ai-npc): toggle-style remove for weapons and possessions"
```

---

### Task 8: Batch skills + weapons + possessions into a single Item.create call

**Files:**
- Modify: `scripts/ai-generator/dialog-injector.js:73-95` (the `NPC_PROMPT_CONFIG.onAccept` block)

- [ ] **Step 1: Replace the `onAccept` handler**

Find the current `onAccept` block (currently lines 73–95):

```js
  onAccept: async (data, { mapper, dialog }) => {
    try {
      const resolvedSkills = await mapper.resolveSkills(data.skillsRaw)
      const actor = await Actor.create(data.actorData)
      if (!actor) {
        ui.notifications.error(t('COC7QOL.AIGenerator.Error.NPCCreationCancelled'))
        return
      }
      if (resolvedSkills.length > 0) {
        try {
          await actor.createEmbeddedDocuments('Item', resolvedSkills)
        } catch (skillErr) {
          console.warn('[coc7-qol] Skill attachment failed:', skillErr)
          ui.notifications.warn(tf('COC7QOL.AIGenerator.Error.NPCSkillsFailed', { error: skillErr.message }))
        }
      }
      actor?.sheet?.render(true)
      dialog.close()
    } catch (err) {
      console.error('[coc7-qol] NPC actor creation failed:', err)
      ui.notifications.error(tf('COC7QOL.AIGenerator.Error.NPCCreationFailed', { error: err.message }))
    }
  },
```

Replace with:

```js
  onAccept: async (data, { mapper, dialog }) => {
    try {
      const resolvedSkills = await mapper.resolveSkills(data.skillsRaw)
      const actor = await Actor.create(data.actorData)
      if (!actor) {
        ui.notifications.error(t('COC7QOL.AIGenerator.Error.NPCCreationCancelled'))
        return
      }
      const items = [
        ...resolvedSkills,
        ...(data.weaponsData ?? []),
        ...(data.possessionsData ?? [])
      ]
      if (items.length > 0) {
        try {
          await actor.createEmbeddedDocuments('Item', items)
        } catch (itemErr) {
          console.warn('[coc7-qol] Item attachment failed:', itemErr)
          ui.notifications.warn(tf('COC7QOL.AIGenerator.Error.NPCItemsFailed', { error: itemErr.message }))
        }
      }
      actor?.sheet?.render(true)
      dialog.close()
    } catch (err) {
      console.error('[coc7-qol] NPC actor creation failed:', err)
      ui.notifications.error(tf('COC7QOL.AIGenerator.Error.NPCCreationFailed', { error: err.message }))
    }
  },
```

> **Note:** The i18n key changed from `NPCSkillsFailed` to `NPCItemsFailed` to match the broader scope. Task 3 already added the new key and removed the old one.

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/ai-generator/dialog-injector.js`
Expected: no output.

- [ ] **Step 3: Verify no other code still references `NPCSkillsFailed`**

Run: `grep -rn 'NPCSkillsFailed' scripts/ lang/`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-generator/dialog-injector.js
git commit -m "feat(ai-npc): batch skills, weapons, and possessions in single Item.create call"
```

---

### Task 9: CSS for removed rows, warnings, and equipment list rows

**Files:**
- Modify: `styles/ai-generator.css`

- [ ] **Step 1: Append new style rules**

Append the block below to the end of `styles/ai-generator.css`:

```css
/* ─── NPC dialog: equipment rows (weapons + possessions) ─────────────────── */

.coc7-npc-equip-list {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.coc7-npc-equip-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.2rem 0;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--color-cool-5-75, #1f1f1f);
}

.coc7-npc-equip-name {
  color: var(--color-text-light-3, #ccc);
}

.coc7-npc-equip-detail {
  color: var(--color-text-light-6, #888);
  font-size: 0.78rem;
}

.coc7-npc-equip-remove {
  flex: 0 0 auto;
  width: 1.5rem;
  height: 1.5rem;
  line-height: 1;
  padding: 0;
  font-size: 1rem;
  background: transparent;
  border: 1px solid var(--color-border-dark, #333);
  border-radius: 4px;
  color: var(--color-text-light-6, #888);
  cursor: pointer;
}

.coc7-npc-equip-remove:hover {
  color: var(--color-warm-2, #c9a96e);
  border-color: var(--color-warm-2, #c9a96e);
}

.coc7-npc-equip-row.coc7-ai-removed .coc7-npc-equip-name,
.coc7-npc-equip-row.coc7-ai-removed .coc7-npc-equip-detail {
  text-decoration: line-through;
  opacity: 0.5;
}

/* ─── NPC dialog: warnings callout ───────────────────────────────────────── */

.coc7-ai-warnings {
  border-left: 3px solid var(--color-warm-2, #d4a017);
  background: rgba(212, 160, 23, 0.08);
}

.coc7-ai-warnings-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.8rem;
  color: var(--color-text-light-5, #bbb);
}

.coc7-ai-warnings-list li {
  margin: 0.15rem 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles/ai-generator.css
git commit -m "style(ai-npc): add weapons/possessions/warnings styles"
```

---

### Task 10: Manual smoke test in FoundryVTT

This task has no commits — only verification.

- [ ] **Step 1: Load the module in FoundryVTT v13+ with the CoC7 system**

- Launch FoundryVTT, load a world with the CoC7 system installed.
- Enable the `coc7-qol` module.
- As GM, open the Actors directory and click "Create Actor".
- Choose type **NPC**.
- Confirm the sparkle button appears in the dialog footer. (Regression: a player-role user should NOT see it.)

- [ ] **Step 2: Run scenario 1 — English NPC**

Click the sparkle, type: `a 1920s newspaper editor, mid-40s, ex-boxer`.
Click Generate. Wait for the confirmation dialog.

Expect:
- Narrative fields in English.
- Skills section with 5–12 skills, English names.
- A Weapons section (header reading `Weapons (N)`) with 0–3 rows.
- A Possessions section (header reading `Possessions (N)`) with 3–8 rows.
- No Warnings section.
- Click Accept. Verify the resulting actor sheet has all skills, weapons, and possessions as embedded items.

- [ ] **Step 3: Run scenario 2 — French NPC**

Sparkle → type: `un docker irlandais de Boston, en 1925`. Generate.

Expect:
- `physicalDescription`, `personalityTraits`, `background` (and any item descriptions) in French.
- `occupation` and skill names in English.
- Name culturally appropriate (Irish, e.g. "Seamus O'Connor" or similar).
- Accept and verify actor sheet.

- [ ] **Step 4: Run scenario 5 — Pacifist NPC (no weapons)**

Sparkle → type: `a quiet village librarian, age 72`. Generate.

Expect:
- Weapons section either hidden entirely (LLM returned empty/missing array) or with 0 rows.
- Possessions section populated with believable items.

- [ ] **Step 5: Run scenario 7 + 8 — Toggle remove**

Sparkle → type: `a 1920s mob enforcer`. Generate.

- Click the × next to one weapon. Row visibly strikes through; header changes to `Weapons (X / Y)`.
- Click the same × again. Row restores. Header reverts to `Weapons (Y)`.
- Click × on a different weapon. Click Accept.
- Verify: kept weapons exist on the actor sheet, removed one does not. Skills and possessions unaffected.

- [ ] **Step 6: Run scenario 9 — Random characteristics + equipment**

Sparkle → check the "Random characteristics" box → type a prompt → Generate.

Expect:
- Characteristics show formulas (e.g. `5*(3d6)`) in the preview.
- Weapons and possessions still appear and create normally on Accept.

- [ ] **Step 7: Run scenario 11 — Empty equipment**

If scenario 5 didn't produce truly empty arrays, you can force this by regenerating with a prompt like `a sleeping infant`. Verify the dialog shows neither section and Accept works.

- [ ] **Step 8: Run scenario 14 — API key missing (regression)**

Clear the API key in module settings. Sparkle → type → Generate.
Expect: inline error in the prompt area, no confirmation dialog.

- [ ] **Step 9: Run scenario 15 — Non-GM (regression)**

Switch to a player account or use the "View as Player" mode. Open Create Actor.
Expect: sparkle button is NOT rendered.

---

## Self-Review Notes

**Spec coverage check:**

| Spec section | Task(s) |
|---|---|
| §3 Language behavior | Task 1 (prompt) |
| §4.1–4.4 LLM contract additions | Task 1 (prompt advertises arrays, gives volume guidance) |
| §5.1 Weapon mapper import | Task 2 step 1 |
| §5.2 Helpers | Task 2 step 3 |
| §5.3 `validate()` unchanged | Task 2 — no `validate()` edit |
| §5.4 New return shape | Task 2 step 2 |
| §6.1 Layout | Tasks 4, 5, 6 |
| §6.2 Toggle remove | Task 7 |
| §6.3 Warnings rendering | Task 6 |
| §6.4 onAccept payload filter | Task 7 step 2 |
| §6.5 i18n keys | Task 3 |
| §7.1–7.2 Batched create | Task 8 |
| §8.1 Blocking error surface unchanged | Task 8 keeps existing try/catch |
| §8.2 Non-blocking strategies | Task 2 step 3 (drop silently / push warning / coerce qty) |
| §8.3 Foundry write failures | Task 8 keeps existing notifications, renames key |
| §9 File changes | All edits map to listed files |
| §10 Testing scenarios | Task 10 |

**Placeholder scan:** none of the "TBD / handle edge cases / similar to Task N" anti-patterns appear in this plan; every code change shows full code.

**Type / name consistency check:**
- `weaponsData`, `possessionsData`, `warnings` used identically in mapper return, dialog state, and injector `onAccept`. ✓
- `removedWeaponIndexes` / `removedPossessionIndexes` used identically in field declarations, render methods, `#toggleRemoved`, and `#handleAccept`. ✓
- i18n keys `WeaponsHeader`, `WeaponsHeaderPartial`, `PossessionsHeader`, `PossessionsHeaderPartial`, `WarningsHeader`, `WeaponRowDamage`, `PossessionRowQuantity`, `Button.RemoveItem` match between Task 3 (definition) and Tasks 4–6 (consumption). ✓
- The renamed key `NPCItemsFailed` is defined once (Task 3) and used once (Task 8). The old `NPCSkillsFailed` is removed in Task 3 and absent in Task 8 — Task 8 step 3 verifies the codebase no longer references the old key. ✓
