# Design: NPC Random Characteristics

**Date:** 2026-04-16
**Status:** Approved

## Context

The AI NPC generator currently asks the LLM to produce fixed integer values (1–99) for all eight CoC7 characteristics. The CoC7 system supports an alternative: storing a dice formula in `system.characteristics[key].formula`. When a token is placed on a scene, `create-token.js` detects `hasRollableCharacteristics` and offers the GM a roll/average/ignore dialog. This is the canonical "random NPC" workflow in CoC7.

## Goal

Add a "Random characteristics" checkbox to the NPC generation prompt area. When selected, the generated NPC actor stores rulebook dice formulas in its characteristic fields instead of AI-chosen integers, so characteristics are rolled fresh on each token drop.

Formulas per the CoC7 7th Edition rulebook:
- **STR, CON, DEX, APP, POW:** `5*(3d6)`
- **INT, SIZ, EDU:** `5*(2d6+6)`

## Approach

Approach B: the NPC mapper owns the formula knowledge and exposes a helper. The injector calls the helper after `toFoundryData()`. This keeps formula constants co-located with the mapper they belong to, and sets the pattern for future document types (e.g. creatures) that may need different formulas.

## Changes

### 1. `scripts/ai-generator/mappers/npc.js`

Add two named exports alongside the default mapper object:

```js
export const CHARACTERISTIC_FORMULAS = {
  str: '5*(3d6)',
  con: '5*(3d6)',
  dex: '5*(3d6)',
  app: '5*(3d6)',
  pow: '5*(3d6)',
  int: '5*(2d6+6)',
  siz: '5*(2d6+6)',
  edu: '5*(2d6+6)'
}

export function applyRandomCharacteristics (npcData) {
  for (const [key, formula] of Object.entries(CHARACTERISTIC_FORMULAS)) {
    npcData.actorData.system.characteristics[key] = { formula, value: 0 }
  }
  npcData.randomCharacteristics = true
}
```

No changes to `validate()`, `toFoundryData()`, or `SYSTEM_PROMPT`. The LLM still generates numeric characteristics — they pass validation and are used for skills/narrative coherence — but are discarded in favour of formulas when the option is active.

### 2. `scripts/ai-generator/dialog-injector.js`

**`NPC_PROMPT_CONFIG`** gains an `extraHTML` string:

```js
extraHTML: `<label class="coc7-ai-random-chars-label">
  <input type="checkbox" name="ai-random-characteristics">
  Random characteristics <span class="coc7-ai-hint">(rulebook formula, rolled on token drop)</span>
</label>`
```

**`_transformToPromptView`** renders `config.extraHTML` inside `promptArea` when present (below the textarea, above the error div). `WEAPON_PROMPT_CONFIG` is unchanged (no `extraHTML`).

**`_runNPCGeneration`** reads the checkbox after `toFoundryData()`:

```js
import npcMapper, { applyRandomCharacteristics } from './mappers/npc.js'

// after: const npcData = mapper.toFoundryData(llmData)
const randomChars = form.querySelector('[name="ai-random-characteristics"]')?.checked
if (randomChars) applyRandomCharacteristics(npcData)
```

### 3. `scripts/ai-generator/npc-confirmation-dialog.js`

In `_renderHTML`, the characteristics grid checks `this.#npcData.randomCharacteristics`. When `true`, each cell renders the formula string from `CHARACTERISTIC_FORMULAS` instead of the LLM value:

```js
import { CHARACTERISTIC_FORMULAS } from './mappers/npc.js'

// in charCells map:
const displayValue = this.#npcData.randomCharacteristics
  ? CHARACTERISTIC_FORMULAS[k]
  : escapeHtml(String(chars[k] ?? '—'))
```

## Data flow

```
GM checks "Random characteristics" checkbox
  → Generate clicked
  → LLM generates NPC with numeric characteristics (validation passes)
  → toFoundryData() produces actorData with integer values
  → applyRandomCharacteristics() patches actorData:
      system.characteristics[key] = { formula: '5*(3d6)', value: 0 }  (or 5*(2d6+6))
      npcData.randomCharacteristics = true
  → CoC7NPCConfirmationDialog opens
      characteristics grid shows formula strings
  → GM clicks Accept
  → Actor created with formula fields set
  → GM drops token on scene
  → CoC7 create-token hook detects hasRollableCharacteristics → true
  → Dialog: Roll / Average / Ignore
  → Characteristics resolved to integers
```

## Out of scope

- No changes to the system prompt (LLM is not told about the random mode)
- No UI change to the confirmation dialog beyond the formula display
- No creature mapper (future work, same pattern applies)
