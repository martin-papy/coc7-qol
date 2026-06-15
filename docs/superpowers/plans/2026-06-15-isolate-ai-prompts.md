# Isolate AI System Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the two LLM `SYSTEM_PROMPT` blocks out of the mapper modules into standalone Markdown files loaded at runtime via a small cached loader.

**Architecture:** A new `scripts/ai-generator/prompts/` directory holds one `.md` file per system prompt plus a `loader.js` that fetches and caches prompt text using `foundry.utils.getRoute`. Mappers' `buildSystemPrompt()` becomes async and delegates to the loader. The single call site already runs in an async function and is updated to `await`.

**Tech Stack:** Vanilla ES modules (no build step), FoundryVTT v13 client API (`foundry.utils.getRoute`, `fetch`), Markdown prompt files bundled inside `scripts/`.

> **Testing note:** This project has no automated test suite (per `CLAUDE.md`). Verification is manual against a running FoundryVTT instance via the Playwright MCP server. Tasks therefore use implement → verify steps rather than RED/GREEN unit-test cycles.

---

## File Structure

- **Create** `scripts/ai-generator/prompts/loader.js` — `loadPrompt(name)`, fetch + in-memory cache. Sole responsibility: turn a prompt name into its text.
- **Create** `scripts/ai-generator/prompts/weapon-system-prompt.md` — verbatim weapon system prompt prose.
- **Create** `scripts/ai-generator/prompts/npc-system-prompt.md` — verbatim NPC system prompt prose.
- **Modify** `scripts/ai-generator/mappers/weapon.js` — drop `SYSTEM_PROMPT`, async `buildSystemPrompt()` → `loadPrompt('weapon-system-prompt')`.
- **Modify** `scripts/ai-generator/mappers/npc.js` — drop `SYSTEM_PROMPT`, async `buildSystemPrompt()` → `loadPrompt('npc-system-prompt')`.
- **Modify** `scripts/ai-generator/dialog-injector.js` — `await mapper.buildSystemPrompt()` at the call site.

---

### Task 1: Add the prompt loader

**Files:**
- Create: `scripts/ai-generator/prompts/loader.js`

- [ ] **Step 1: Write the loader**

Create `scripts/ai-generator/prompts/loader.js`:

```js
// scripts/ai-generator/prompts/loader.js
// Loads AI system-prompt Markdown files at runtime and caches them per session.

const cache = new Map()
const MODULE_ID = 'coc7-qol'

/**
 * Fetch a system-prompt Markdown file by base name (no extension).
 * Cached by name, so repeated calls fetch at most once per session.
 *
 * @param {string} name e.g. 'weapon-system-prompt'
 * @returns {Promise<string>} the raw Markdown text
 */
export async function loadPrompt (name) {
  if (cache.has(name)) return cache.get(name)
  const path = foundry.utils.getRoute(`modules/${MODULE_ID}/scripts/ai-generator/prompts/${name}.md`)
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load AI prompt "${name}": ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  cache.set(name, text)
  return text
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ai-generator/prompts/loader.js
git commit -m "feat: add runtime loader for AI system prompts"
```

---

### Task 2: Extract the weapon system prompt to Markdown

**Files:**
- Create: `scripts/ai-generator/prompts/weapon-system-prompt.md`
- Modify: `scripts/ai-generator/mappers/weapon.js`

- [ ] **Step 1: Create the Markdown file with the verbatim prompt**

Create `scripts/ai-generator/prompts/weapon-system-prompt.md` with the exact current prompt text (the contents of the `SYSTEM_PROMPT` template literal in `weapon.js`, lines 1–24):

```markdown
You are a Call of Cthulhu 7th Edition game master assistant. Generate a CoC7 weapon item based on the user's description.

Respond with ONLY a valid JSON object. No explanation, no markdown fences, no extra text — raw JSON only.

Required fields (must always be present):
- name: string — the weapon name
- damage: string — dice expression (e.g. "1d8", "1d6+1", "1d10+db")
- skill: string — the CoC7 skill name (e.g. "Firearms (Handgun)", "Fighting (Brawl)", "Firearms (Rifle/Shotgun)", "Throw")

Optional fields (omit or use null if not applicable):
- description: string — flavour text and physical description (default "")
- range: integer or null — effective range as a plain integer with NO unit (e.g. 15, 30); null for melee weapons
- usesPerRound: integer or string — BASE attacks per round, just a plain number (e.g. 1, 2). Do NOT use parentheses or burst ranges here.
- usesPerRoundMax: integer or null — maximum attacks per round when faster than base (e.g. 3 quick shots from a revolver); null when not applicable. CoC7 displays this as "normal(max)".
- bullets: number or null — magazine/cylinder capacity; null for non-firearms
- malfunction: number or null — malfunction threshold 96–100; null for non-firearms
- properties: object with boolean flags:
  - rngd: true if ranged weapon
  - impl: true if impaling (piercing) weapon
  - addb: true if adds full damage bonus (DB) to damage
  - ahdb: true if adds half damage bonus to damage

Common CoC7 skills: "Fighting (Brawl)", "Fighting (Sword)", "Fighting (Axe)", "Fighting (Spear)", "Fighting (Whip)", "Firearms (Handgun)", "Firearms (Rifle/Shotgun)", "Firearms (Submachine Gun)", "Firearms (Machine Gun)", "Throw", "Explosives"
Common damage bonus usage: melee weapons typically use "addb" or "ahdb"; firearms do not.
```

> Copy the text exactly from the existing `SYSTEM_PROMPT` constant — do not reword. The simplest accurate way is to open `weapon.js`, select the literal's contents, and paste them here.

- [ ] **Step 2: Update `weapon.js` to load from the file**

In `scripts/ai-generator/mappers/weapon.js`:

a) Add the import at the top of the file (before the existing `const SYSTEM_PROMPT`):

```js
import { loadPrompt } from '../prompts/loader.js'
```

b) Delete the entire `const SYSTEM_PROMPT = \`...\`` block (lines 1–24).

c) Replace the `buildSystemPrompt` method:

```js
  async buildSystemPrompt () {
    return loadPrompt('weapon-system-prompt')
  },
```

- [ ] **Step 3: Verify weapon.js has no leftover reference**

Run: `grep -n "SYSTEM_PROMPT" scripts/ai-generator/mappers/weapon.js`
Expected: no output (the constant is fully removed).

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-generator/prompts/weapon-system-prompt.md scripts/ai-generator/mappers/weapon.js
git commit -m "refactor: load weapon system prompt from Markdown file"
```

---

### Task 3: Extract the NPC system prompt to Markdown

**Files:**
- Create: `scripts/ai-generator/prompts/npc-system-prompt.md`
- Modify: `scripts/ai-generator/mappers/npc.js`

- [ ] **Step 1: Create the Markdown file with the verbatim prompt**

Create `scripts/ai-generator/prompts/npc-system-prompt.md` with the exact current prompt text (the contents of the `SYSTEM_PROMPT` template literal in `npc.js`, lines 9–61):

```markdown
You are a Call of Cthulhu 7th Edition game master assistant. Generate a CoC7 NPC based on the user's description.

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
- name: string — full name of the NPC (language: culturally appropriate, per LANGUAGE RULES above)
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
- occupation: string — the NPC's job or role, ALWAYS in English (used for system lookup; e.g. "Pharmacist", "Dockworker", "Professor")
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
  - usesPerRound: integer or string (optional) — BASE attacks per round, just a plain number (e.g. 1, 2). Do NOT use parentheses or burst ranges here.
  - usesPerRoundMax: integer or null (optional) — maximum attacks per round when faster than base (e.g. 3 quick shots from a revolver); null when not applicable
  - bullets: number or null (optional) — magazine/cylinder capacity; null for non-firearms
  - malfunction: number or null (optional) — malfunction threshold 96–100; null for non-firearms
  - properties: object with boolean flags (optional): rngd (ranged), impl (impaling), addb (adds full damage bonus), ahdb (adds half damage bonus)
- possessions: array of possession objects (3–8 typical; may be empty or sparse for situational NPCs). Each possession:
  - name: string (required) — the item name
  - description: string (optional) — short flavour text
  - quantity: integer (optional, default 1) — positive integer

EQUIPMENT GUIDANCE:
- Possessions: 3–8 items consistent with the NPC's occupation, age, era, and personality. A shopkeeper might have keys, a ledger, and a pen; a doctor a stethoscope and a notebook; a 1920s detective notebooks and a magnifying glass; a cultist ritual trinkets.
- Weapons: 0 is the DEFAULT for most NPCs. Include weapons ONLY when the role clearly calls for them — soldiers, hunters, criminals, gangsters, private investigators, bodyguards, vigilantes, monster-hunters, beat cops on duty. Ordinary civilians and professionals (shopkeepers, teachers, doctors, clerks, librarians, scholars, dock workers, farmers, journalists, accountants, etc.) carry 0 weapons by default, EVEN in violent settings or eras like 1920s America. Do not arm a character just because the era is dangerous.
- If you do include weapons (typically 1–3 when justified), EVERY weapon's "skill" name MUST appear in skills[] with an appropriate value (e.g. a thug with a knife → "Fighting (Brawl)" at 30–60; a soldier with a rifle → "Firearms (Rifle/Shotgun)" at 50+). If you forget the skill, a generic default will be auto-added, but it won't reflect the character's actual competence.
```

> Copy the text exactly from the existing `SYSTEM_PROMPT` constant — do not reword.

- [ ] **Step 2: Update `npc.js` to load from the file**

In `scripts/ai-generator/mappers/npc.js`:

a) Add the import alongside the existing imports at the top:

```js
import { loadPrompt } from '../prompts/loader.js'
```

b) Delete the entire `const SYSTEM_PROMPT = \`...\`` block (lines 9–61). Leave `REQUIRED_CHARACTERISTICS`, `WEAPON_SKILL_FALLBACK_VALUE`, `CHARACTERISTIC_FORMULAS`, and `applyRandomCharacteristics` untouched.

c) Replace the `buildSystemPrompt` method:

```js
  async buildSystemPrompt () {
    return loadPrompt('npc-system-prompt')
  },
```

- [ ] **Step 3: Verify npc.js has no leftover reference**

Run: `grep -n "SYSTEM_PROMPT" scripts/ai-generator/mappers/npc.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-generator/prompts/npc-system-prompt.md scripts/ai-generator/mappers/npc.js
git commit -m "refactor: load NPC system prompt from Markdown file"
```

---

### Task 4: Await the now-async buildSystemPrompt at the call site

**Files:**
- Modify: `scripts/ai-generator/dialog-injector.js:278`

- [ ] **Step 1: Add the `await`**

In `scripts/ai-generator/dialog-injector.js`, inside the `async _run(...)` function, change:

```js
    const systemPrompt = mapper.buildSystemPrompt()
```

to:

```js
    const systemPrompt = await mapper.buildSystemPrompt()
```

- [ ] **Step 2: Verify no other call site builds the prompt synchronously**

Run: `grep -rn "buildSystemPrompt" scripts/`
Expected: definitions in `mappers/weapon.js` and `mappers/npc.js` (both `async`), and exactly one call in `dialog-injector.js` that now uses `await`.

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-generator/dialog-injector.js
git commit -m "refactor: await async buildSystemPrompt in dialog injector"
```

---

### Task 5: Manual verification in FoundryVTT (Playwright MCP)

**Files:** none (verification only)

> Requires a running FoundryVTT instance (typically `http://localhost:30000`) with the CoC7 system and a configured AI provider/API key. If no instance or API key is available, record this task as "not run" rather than marking it passed.

- [ ] **Step 1: Reload the client**

Navigate to `http://localhost:30000`, join as `Gamemaster`, wait for `game.ready`. JS changes apply on reload.

- [ ] **Step 2: Verify weapon prompt loads and generates**

Open Create Item, select type `weapon`, click the AI sparkle button, enter a description (e.g. "a worn 1911 pistol"), click Generate.
- Confirm via `browser_network_requests` that a request to `.../prompts/weapon-system-prompt.md` returned 200.
- Confirm a weapon confirmation dialog appears with valid fields.

- [ ] **Step 3: Verify NPC prompt loads and generates**

Open Create Actor, select type `npc`, click the AI sparkle button, enter a description (e.g. "a tired 1920s dock worker"), click Generate.
- Confirm `.../prompts/npc-system-prompt.md` returned 200.
- Confirm the NPC confirmation dialog appears with valid fields.

- [ ] **Step 4: Verify caching**

Trigger a second weapon generation in the same session.
- Confirm via `browser_network_requests` that `weapon-system-prompt.md` is NOT fetched a second time (served from the in-memory cache).

- [ ] **Step 5: Verify the error path**

In `browser_evaluate`, import the loader and call it with a bad name:

```js
const { loadPrompt } = await import('/modules/coc7-qol/scripts/ai-generator/prompts/loader.js')
try { await loadPrompt('does-not-exist'); return 'NO ERROR (unexpected)' }
catch (e) { return e.message }
```

Expected: a thrown error message of the form `Failed to load AI prompt "does-not-exist": 404 ...`.

- [ ] **Step 6: Record results**

Note pass/fail (or "not run") for each step in the PR description. No commit.

---

## Self-Review

**Spec coverage:**
- New `prompts/` dir with loader + two `.md` files → Tasks 1–3. ✓
- Loader cached + fails loud + `getRoute` path → Task 1. ✓
- weapon.js / npc.js `buildSystemPrompt` async → Tasks 2–3. ✓
- dialog-injector await → Task 4. ✓
- Verbatim prompt text (behaviour preserved) → Tasks 2–3 copy exactly, with explicit "do not reword" notes. ✓
- No `module.json` / `release.yml` change needed (scripts/ bundled) → reflected in File Structure (no such tasks). ✓
- Testing via Playwright incl. cache + error path → Task 5. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases". The `.md` bodies are the actual full text. ✓

**Type consistency:** `loadPrompt(name)` is defined in Task 1 and called identically in Tasks 2, 3, and 5. `buildSystemPrompt()` is `async` in both mappers and `await`ed once in Task 4. ✓

---

## Execution Handoff

Offered after save.
