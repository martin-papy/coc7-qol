---
title: NPC Generator — Design Spec
date: 2026-04-11
status: approved
scope: v2 — NPC generation
---

# NPC Generator for CoC7 QoL

## 1. Purpose

Enable GMs to generate fully-formed CoC7 NPCs from a natural-language prompt, directly inside Foundry VTT. The flow mirrors the existing weapon generator: prompt → LLM call → rich read-only preview → `Actor.create()` + `createEmbeddedDocuments()`.

An NPC includes: full stat block (8 characteristics + derived attributes), an AI-curated set of skills resolved against the CoC7 skills compendium, and narrative prose (physical description, personality, background).

---

## 2. Scope

**v2 includes:**
- NPC actor generation only (type `"npc"`)
- Bug fix: tighten existing item dialog detection to prevent false positives on the Create Actor dialog
- Same three LLM providers as v1: Anthropic, OpenAI, Gemini
- Injection into the native "Create Actor" dialog (same pattern as weapon generator)
- Rich read-only confirmation dialog (full stat block, skills, narrative)
- Skill resolution: compendium lookup first, fresh item creation as fallback

**Excluded from v2:**
- Weapons or gear on the NPC
- Character, creature, vehicle, or container actor types
- Editable fields in the confirmation dialog
- Per-provider API key storage
- AI image / token generation

---

## 3. Bug Fix — Item Dialog Detection

The current `injectAIButton` in `dialog-injector.js` detects the "Create Item" dialog by checking for `[name="name"]` and `[name="type"]` inputs. Both fields also exist in the "Create Actor" dialog, causing the sparkle button to appear there unintentionally.

**Fix:** after finding `[name="type"]`, verify that at least one of its options matches a known CoC7 item type value (e.g. `"weapon"`, `"skill"`, `"gear"`) before injecting. This makes the detection specific to item creation without coupling it to a dialog title or internal Foundry class names.

```js
const typeValues = [...typeSelect.options].map(o => o.value)
const COC7_ITEM_TYPES = ['weapon', 'skill', 'gear', 'consumable', 'spell', 'book', 'setup', 'chase', 'status', 'talent']
if (!typeValues.some(v => COC7_ITEM_TYPES.includes(v))) return
```

---

## 4. File Structure

Only `scripts/ai-generator/index.js` is in `module.json`'s `esmodules` array — unchanged.

```
scripts/ai-generator/
  index.js                      ← add NPCMapper import + registration (2 lines)
  dialog-injector.js            ← bug fix (item detection) + NPC injection
  generation-dialog.js          ← unchanged
  npc-confirmation-dialog.js    ← NEW: rich NPC preview ApplicationV2
  mappers/
    registry.js                 ← unchanged
    weapon.js                   ← unchanged
    npc.js                      ← NEW: LLM schema, validate(), toFoundryData(), skill resolution
  providers/                    ← all unchanged
  settings.js                   ← unchanged
```

Five files total: 2 new, 3 modified.

---

## 5. LLM Schema

The NPC mapper's system prompt instructs the LLM to return a single JSON object:

```json
{
  "name": "string",
  "occupation": "string",
  "age": "number",
  "physicalDescription": "string",
  "personalityTraits": "string",
  "background": "string",
  "characteristics": {
    "str": number,
    "con": number,
    "siz": number,
    "dex": number,
    "app": number,
    "int": number,
    "pow": number,
    "edu": number
  },
  "skills": [
    { "name": "string", "value": number }
  ]
}
```

**Required fields:** `name`, all 8 `characteristics` values, `skills` (non-empty array). Missing any of these blocks creation with an inline Retry error.

**Optional fields:** `occupation`, `age`, `physicalDescription`, `personalityTraits`, `background`. Absent fields default to empty strings — the NPC is still created.

**Characteristics guidance in the system prompt:** values for a typical human NPC range from 15–90, consistent with CoC7's 3d6×5 / (2d6+6)×5 generation methods. The LLM is instructed to calibrate values to the described occupation and age (e.g. an elderly librarian has high EDU/INT, lower STR/DEX).

**Derived attributes** (HP, MP, SAN, MOV, Build, Damage Bonus) are not requested from the LLM. CoC7 computes them automatically from characteristics when `auto: true` — the system default for NPC actors.

---

## 6. Skill Resolution

Implemented in `mappers/npc.js`. Called once per skill entry in the LLM output during `toFoundryData()`.

**Steps:**

1. **Normalize** the LLM skill name: trim whitespace, collapse internal spaces.
2. **Compendium lookup** — search `game.packs.get('CoC7.skills')` for a case-insensitive name match.
3. **If found** — clone the compendium entry to inherit proper metadata: `cocidFlag`, fighting/firearm/ranged properties, base formula, icon. Set `system.adjustments.personal` to the LLM target value so the total skill percentage equals the LLM value regardless of how the base formula resolves on this NPC.
4. **If not found** — create a fresh skill item using `CoC7ModelsItemSkillSystem.guessNameParts(name)` to correctly parse specializations (e.g. `"Fighting (Brawl)"` → `skillName: 'Brawl'`, `specialization: 'Fighting'`, `properties.fighting: true`). Set `system.adjustments.personal` to the LLM target value.

The compendium lookup benefits skills like Dodge, Credit Rating, and Cthulhu Mythos — they carry canonical `cocidFlag` identifiers that the system uses to find them by role, not by name string.

---

## 7. Dialog Flow

### Step 1 — Injection

`Hooks.on('renderDialogV2', ...)` fires on every dialog open. The existing handler guards for item dialogs (with the bug fix applied). A new parallel guard detects the Create Actor dialog by checking that `[name="type"]`'s options contain CoC7 actor type values (e.g. `"npc"`, `"character"`, `"creature"`).

A sparkle SVG button is injected next to the "Create Actor" button — same styling as the existing item injection.

### Step 2 — In-place Transformation

GM clicks the sparkle button. The Name + Type fields are replaced with a `<textarea>` pre-filled with any existing name as a hint. The label reads "Describe your NPC". The "Create Actor" button is replaced with "Generate".

### Step 3 — Generation

GM enters their prompt and clicks Generate. A loading spinner replaces the button. The flow calls:

```js
providers.get(selectedProvider).generate(systemPrompt, userPrompt)
```

On failure: inline error with Retry.

### Step 4 — Confirmation Dialog

On success, `CoC7NPCConfirmationDialog` (a new `ApplicationV2`) opens showing:

- **Identity bar** — name, occupation, age
- **Characteristics grid** — 8 stats (4×2), styled like CoC7's own sheet
- **Derived row** — HP, MP, SAN, MOV, DB (read-only, computed from characteristics)
- **Skills list** — two-column layout, name + percentage
- **Narrative sections** — Appearance, Personality, Background (prose, read-only)
- **Buttons** — Accept · Regenerate · Cancel

### Step 5 — Accept

Two-step creation:
1. `Actor.create(actorData)` — creates the NPC actor
2. `actor.createEmbeddedDocuments('Item', resolvedSkills)` — attaches skills

On full success: opens the created actor's sheet and closes both dialogs.

On partial failure (actor created, skills failed): `ui.notifications.warn(...)` — actor is usable, skills may be incomplete.

### Step 6 — Regenerate

Closes the confirmation dialog. Returns to the transformed Create Actor dialog with the textarea still populated.

### Step 7 — Cancel

Closes the confirmation dialog. Restores the Create Actor dialog to its original Name + Type form.

---

## 8. Actor Data Shape

```js
{
  name: llmData.name,
  type: 'npc',
  system: {
    characteristics: {
      str: { value: llmData.characteristics.str },
      con: { value: llmData.characteristics.con },
      siz: { value: llmData.characteristics.siz },
      dex: { value: llmData.characteristics.dex },
      app: { value: llmData.characteristics.app },
      int: { value: llmData.characteristics.int },
      pow: { value: llmData.characteristics.pow },
      edu: { value: llmData.characteristics.edu }
    },
    infos: {
      occupation: llmData.occupation ?? '',
      age: String(llmData.age ?? ''),
      type: '',
      organization: ''
    },
    biography: {
      personalDescription: { value: llmData.physicalDescription ?? '' }
    },
    description: {
      keeper: `<p><strong>Personality:</strong> ${llmData.personalityTraits ?? ''}</p><p><strong>Background:</strong> ${llmData.background ?? ''}</p>`
    }
  }
}
```

Personality and background are combined into the GM-only keeper notes field as simple HTML paragraphs. Physical description goes into `biography.personalDescription` (visible to players if the GM shares it).

---

## 9. Error Handling

| Condition | Behaviour |
|---|---|
| No API key configured | Inline message before LLM call: "No API key set — configure in Module Settings → CoC7 QoL Improvements." |
| Network / HTTP error | Inline error in dialog with Retry button |
| LLM returns unparseable JSON | Inline error with Retry button |
| Required fields missing from LLM output | Inline error listing missing fields, with Retry button |
| `Actor.create()` fails | `ui.notifications.error(...)` toast |
| `createEmbeddedDocuments()` fails | `ui.notifications.warn(...)` toast — actor created but skills incomplete |

---

## 10. Architectural Extension Points

No changes to the provider layer or settings. Adding NPC generation follows the extension points defined in v1:

- `mappers/npc.js` registered via `mappers.register('npc', NPCMapper)` in `index.js`
- `dialog-injector.js` extended with a second detection branch for actor dialogs
- New `npc-confirmation-dialog.js` handles the richer NPC preview independently from `generation-dialog.js`

Future document types (journal entries, scenes) follow the same pattern.

---

## 11. Out of Scope / Future

- Weapons and gear on generated NPCs (v3)
- Editable confirmation dialog fields
- Per-provider API key storage
- AI image / token generation
- Creature, character, or vehicle actor generation
