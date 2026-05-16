---
title: AI NPC Equipment & Language — Design Spec
date: 2026-05-16
status: approved
scope: v3 — extend the AI NPC generator with localized narrative and occupation-aligned equipment
---

# AI NPC Equipment & Language

## 1. Purpose

Extend the existing AI NPC generator (v2) with two additive features:

1. **Localized narrative.** Free-text fields (`physicalDescription`, `personalityTraits`, `background`) are emitted in the same language as the user's prompt. Identifiers used for system lookups (`occupation`, skill names) stay in English so existing resolution still works.
2. **Occupation-aligned equipment.** Each generated NPC is shipped with a believable set of weapons and possessions, configured against CoC7's existing item types, and editable in the confirmation dialog before commit.

Both features are produced by a **single LLM call**, reusing the existing weapon mapper for per-weapon validation and Foundry data conversion.

---

## 2. Scope

**v3 includes:**

- One additive language instruction in the NPC system prompt; no JS-side language detection.
- Two new top-level arrays in the LLM contract: `weapons[]` and `possessions[]`.
- Composition of the existing `mappers/weapon.js` inside `mappers/npc.js` for per-weapon validation and Foundry mapping.
- New "Weapons" and "Possessions" sections in the NPC confirmation dialog with toggle-style remove buttons.
- A non-blocking warnings channel surfaced in the confirmation dialog when the LLM produces a malformed weapon/possession that was dropped.
- A single batched `createEmbeddedDocuments('Item', [...])` call covering skills + weapons + possessions on Accept.

**Excluded from v3:**

- Per-row editing in the confirmation dialog (GMs edit on the actor sheet after creation).
- Compendium lookup for weapons or possessions (fresh items only, matching the current weapon-generator pattern).
- A second LLM call for equipment (single-call design; documented escape hatch if quality requires it later).
- Armor, books, spells, or other CoC7 item types as dedicated arrays. All non-weapon equipment is created as `type: 'item'`.
- AI image / token generation for the NPC or items.
- Era/setting consistency validation in code.

---

## 3. Language Behavior

### 3.1 Rule

| Field | Language |
|---|---|
| `physicalDescription`, `personalityTraits`, `background` | Same as user prompt |
| `name` | Culturally appropriate for the setting/era (LLM judgement) |
| `occupation` | English |
| `skills[].name` | English (required for compendium lookup) |
| `weapons[].name`, `possessions[].name` | LLM judgement — typically English for canonical names (e.g. "Colt 1911", "Pocket notebook") |
| `weapons[].description`, `possessions[].description` | Same as user prompt |

### 3.2 Implementation

Append a single instruction block to the existing `SYSTEM_PROMPT` constant in `scripts/ai-generator/mappers/npc.js`. No code-side language detection; no per-language prompt variants. Modern instruction-tuned LLMs handle this reliably.

### 3.3 Edge cases

- **Mixed-language prompt:** LLM picks the dominant language. GM Regenerates if unsatisfied.
- **Very short prompt** ("a doctor"): English by default.
- **Non-Latin scripts** (Japanese, Cyrillic): supported by virtue of the LLM and Foundry's UTF-8 rendering. No code change required.

---

## 4. LLM Contract Additions

### 4.1 New top-level fields

Both arrays are **optional** in the contract (default `[]`) but the system prompt requests them as part of normal generation.

```json
{
  "...existing NPC fields...",
  "weapons": [
    {
      "name": "Colt 1911",
      "skillName": "Firearms (Handgun)",
      "damage": "1D10",
      "range": "15 yards",
      "attacks": "1",
      "ammo": 7,
      "malfunction": 100,
      "properties": { "rngd": true, "hndg": true }
    }
  ],
  "possessions": [
    {
      "name": "Pocket notebook",
      "description": "Filled with shorthand notes from past assignments.",
      "quantity": 1
    }
  ]
}
```

### 4.2 Weapon sub-schema

Mirrors the existing standalone weapon-generator schema (single source of truth in `mappers/weapon.js`). Each weapon is validated by `weaponMapper.validate()` and mapped to Foundry data by `weaponMapper.toFoundryData()`.

### 4.3 Possession sub-schema

| Field | Type | Required | Default |
|---|---|---|---|
| `name` | string | yes | — |
| `description` | string | no | `""` |
| `quantity` | integer | no | `1` |

Possessions become CoC7 items of `type: 'item'`. No compendium lookup.

### 4.4 Volume guidance in the prompt

> *Add 0–3 `weapons` and 3–8 `possessions`, all consistent with the NPC's occupation, age, era, and personality. A pacifist librarian likely has 0 weapons; a 1920s detective might have a revolver and a few notebooks; a cultist might carry ritual items.*

Soft guidance only — the LLM decides exact counts.

---

## 5. Mapper Composition

### 5.1 Imports

`mappers/npc.js` imports the weapon mapper directly (not via the registry — registry is for dialog wiring, not internal reuse):

```js
import weaponMapper from './weapon.js'
```

### 5.2 New internal helpers on the NPC mapper

- **`_validateAndMapWeapons(rawWeapons, warnings)`** — iterates `rawWeapons`; for each entry calls `weaponMapper.validate()` inside a `try/catch`. On success, calls `weaponMapper.toFoundryData()` and accumulates the Foundry-ready item data. On throw, pushes a human-readable string into `warnings` and skips the entry. Drops entries missing `name` silently.
- **`_mapPossessions(rawPossessions)`** — pure mapping to `type: 'item'` Foundry data: `{ name, type: 'item', system: { description: { value: escapeHtml(description) }, quantity } }`. Coerces `quantity` to a positive integer: `const n = Math.floor(Number(rawQuantity)); quantity = Number.isFinite(n) && n > 0 ? n : 1`. Drops entries missing `name` silently.

### 5.3 `validate()` extension

Existing required-field checks for `name`, `characteristics`, `skills` are unchanged. `weapons` and `possessions` are not part of `validate()` — they're handled inside `toFoundryData()` so malformed entries don't block the NPC.

### 5.4 `toFoundryData()` return shape

```js
{
  actorData: { ... },          // unchanged
  skillsRaw: [...],            // unchanged
  weaponsData: [...],          // NEW — Item.create-ready array
  possessionsData: [...],      // NEW — Item.create-ready array
  warnings: [...],             // NEW — strings to display non-blockingly
  llmData: { ... }             // unchanged
}
```

`applyRandomCharacteristics` is untouched — it only mutates `actorData.system.characteristics`. Weapons and possessions pass through verbatim.

---

## 6. Confirmation Dialog Changes

File: `scripts/ai-generator/npc-confirmation-dialog.js`.

### 6.1 Layout additions

Two new sections rendered between the skills section and the narrative section:

```
Characteristics
Skills
─────────────────────────────────
Weapons (N)         ← NEW, omitted if N = 0
  • <name>  <damage> / <skill>  ×
─────────────────────────────────
Possessions (N)     ← NEW, omitted if N = 0
  • <name>  ×<qty>  ×
─────────────────────────────────
Physical description (narrative)
Personality (narrative)
Background (narrative)
─────────────────────────────────
Warnings (if any)   ← NEW, omitted if warnings.length = 0
  ⚠ <warning text>
─────────────────────────────────
[Accept]  [Regenerate]  [Cancel]
```

### 6.2 Toggle-style remove

Each weapon/possession row has a trailing × button. Clicking it:

- Adds the row's index to the dialog's `removedWeaponIndexes` / `removedPossessionIndexes` (`Set<number>`).
- Applies a `.coc7-ai-removed` class to the row — strikethrough + 50% opacity. Row stays in the DOM.
- Updates the section header count to `Weapons (kept / total)` (e.g. `Weapons (2 / 3)`). Reverts to plain `Weapons (3)` once nothing is removed.

Clicking the same × again removes the class and removes the index from the set. The pattern lets the GM see what they pruned without losing the row.

### 6.3 Warnings rendering

Plain bulleted list inside a styled callout (`.coc7-ai-warnings`, warm yellow border-left). Non-blocking — Accept stays enabled.

### 6.4 `onAccept` payload

The dialog filters the arrays itself and passes filtered data through; the injector does not see the index sets:

```js
onAccept({
  actorData,
  skillsRaw,
  weaponsData:     weaponsData.filter((_, i) => !removedWeaponIndexes.has(i)),
  possessionsData: possessionsData.filter((_, i) => !removedPossessionIndexes.has(i))
})
```

### 6.5 Localization

New i18n strings under `COC7QOL.AIGenerator.NPC.Preview.*`:

- `WeaponsHeader` (placeholders: `{count}`, optional `{kept}`)
- `PossessionsHeader` (same placeholders)
- `WarningsHeader`
- `WeaponRowDamage` (placeholder: `{damage}`, `{skill}`)
- `PossessionRowQuantity` (placeholder: `{quantity}`)

Plus one button title under `COC7QOL.AIGenerator.NPC.Button.*`:

- `RemoveItem` — tooltip on the × button

All strings added in the same change to both `lang/en.json` and `lang/fr.json`.

---

## 7. Actor Creation Flow

In `scripts/ai-generator/dialog-injector.js`, the `NPC_PROMPT_CONFIG.onAccept` handler is updated.

### 7.1 Sequence

```
1. resolvedSkills = await mapper.resolveSkills(data.skillsRaw)
2. actor = await Actor.create(data.actorData)
3. if (!actor) → notification + return
4. items = [...resolvedSkills, ...data.weaponsData, ...data.possessionsData]
5. if (items.length > 0) await actor.createEmbeddedDocuments('Item', items)
6. actor.sheet.render(true)
7. dialog.close()
```

### 7.2 Single batched call

All embedded documents are created in **one** `createEmbeddedDocuments('Item', [...])` call. Avoids partial-success ambiguity, reduces Foundry write overhead, and reuses the existing `try/catch` warning pattern that today wraps skill attachment.

If the batched call throws, the existing `NPCSkillsFailed` notification path is generalized to a single `NPCItemsFailed` message that names skills + equipment.

---

## 8. Error Handling

### 8.1 Blocking (existing surface, behavior unchanged)

| Failure | Surface |
|---|---|
| API key missing/invalid | Inline error in prompt area |
| Provider HTTP/network failure | Inline error in prompt area |
| Non-JSON or unparseable LLM response | Inline error |
| `validate()` throws (missing `name` / `characteristics` / `skills`) | Inline error with field names |

All happen before the confirmation dialog opens. No behavioral change vs. v2.

### 8.2 Non-blocking (new, surfaced as warnings)

| Failure | Strategy |
|---|---|
| Weapon fails `weaponMapper.validate()` | Drop; push `"Weapon '<name>': <reason>"` into `warnings[]` |
| Weapon missing `name` | Drop silently |
| Possession missing `name` | Drop silently |
| Possession `quantity` is non-numeric / ≤ 0 | Coerce to `1` |
| `weapons` / `possessions` field missing or non-array | Treat as `[]`, no warning |

### 8.3 Foundry write failures

| Failure | Strategy |
|---|---|
| `Actor.create()` returns `null` | Existing `NPCCreationCancelled` notification, no actor created |
| `Actor.create()` throws | Existing `NPCCreationFailed` notification |
| `createEmbeddedDocuments` throws | Warn-and-notify; actor exists with no embedded items. GM can re-add manually. |

### 8.4 What we deliberately don't validate

- **Era/setting consistency** (1920s NPC with a smartphone) — trust the LLM's "internally consistent" instruction, leave the rest to GM judgement in the preview.
- **Damage formula syntax** — strings pass through to Foundry; CoC7's roll engine parses at roll-time.
- **Weapon-skill alignment** (weapon references a skill the NPC doesn't have) — accepted; CoC7's normal "skill not found" handling applies at roll-time.

---

## 9. File Changes

```
scripts/ai-generator/
  mappers/
    npc.js                       ← extend SYSTEM_PROMPT (language + equipment),
                                   add _validateAndMapWeapons, _mapPossessions,
                                   extend toFoundryData return shape
  npc-confirmation-dialog.js     ← weapons section, possessions section,
                                   warnings section, remove toggle, header counts
  dialog-injector.js             ← NPC_PROMPT_CONFIG.onAccept builds the
                                   single batched items[] from skills + weapons + possessions

lang/
  en.json                        ← 6 new strings under AIGenerator.NPC.Preview.* and .Button.*
  fr.json                        ← matching French translations

styles/
  ai-generator.css (or existing) ← .coc7-ai-removed, .coc7-ai-warnings,
                                   minor list-row styling for weapons/possessions
```

No new files. No additions to `module.json`'s `esmodules` array (everything is reachable through the existing entry point).

---

## 10. Testing

No automated tests in this repo. Manual matrix in a running Foundry v13+ instance with the CoC7 system, run as GM:

| # | Scenario | Pass criteria |
|---|---|---|
| 1 | English prompt, generic NPC ("a 1920s newspaper editor") | Narrative in English. 0–3 weapons + 3–8 possessions. Skill names English, resolved against compendium. |
| 2 | French prompt ("un docker irlandais de Boston, en 1925") | `physicalDescription` / `personalityTraits` / `background` in French. `occupation` and skill names English. Name culturally appropriate. |
| 3 | Other non-English prompt (Spanish / German / Japanese) | Same language-scope rules hold. |
| 4 | Mixed-language prompt | LLM picks one language; output is consistent within itself. |
| 5 | Pacifist occupation ("a quiet village librarian, age 72") | 0 weapons. Possessions reflect role. |
| 6 | Combat-heavy occupation ("a 1920s mob enforcer") | 1–3 weapons with believable damage formulas. Properties populated. |
| 7 | Remove a weapon in preview, click Accept | Removed weapon not on actor. Kept weapons are. Skills and possessions unaffected. |
| 8 | Remove a row, click it again | Row visually restored. Item created on Accept. Header count updates. |
| 9 | Random characteristics toggle ON + equipment | Characteristics show formulas; weapons/possessions still created. |
| 10 | Malformed weapon in response | Bad weapon dropped; warnings section visible; NPC and other weapons created OK. |
| 11 | Empty `weapons` and `possessions` | Both sections hidden. Accept works. Actor has only skills. |
| 12 | Multiple weapons sharing a `skillName` | Both created and visible on the actor sheet. |
| 13 | Weapon references a skill the NPC doesn't have | Weapon still created. CoC7 handles the missing skill at roll-time. |
| 14 | API key missing → click Generate | Existing inline error; no dialog opened. (Regression check.) |
| 15 | Player (non-GM) opens Create Actor | Sparkle button not visible. (Regression check.) |

Scenarios 1, 2, and 6 are run against each of the three providers (Anthropic, OpenAI, Gemini). Remaining scenarios against the default provider only.

---

## 11. Escape Hatch — If LLM Quality Degrades

The mapper composition pattern leaves a clean path to a two-pass design if real-world testing shows quality problems:

- Call 1: existing NPC core (current schema; no `weapons` / `possessions`).
- Call 2: equipment-only call, with the NPC's `occupation`, `age`, era cues as context, returning `{ weapons, possessions }`.

Both calls reuse the same mappers. The dialog-injector orchestrates the two calls. No schema or contract change for the confirmation dialog. **This is deliberately not implemented in v3** — single-call is sufficient at current LLM capability and output size.

---

## 12. Out-of-Scope Decisions Worth Naming

- No per-row editing in the confirmation dialog.
- No compendium lookup for weapons or possessions.
- No second LLM call.
- No new actor types or item types.
- No image/token generation.
- No era/setting validation in code.
- No latency measurement or budgeting — single-call latency is whatever the provider delivers for ~1.5k in / ~1.5k out.

---

## 13. Open Questions

None at spec time. The escape hatch in §11 covers the one real risk (LLM quality) without committing to extra complexity upfront.
