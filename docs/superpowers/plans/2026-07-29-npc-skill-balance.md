# NPC Skill Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the AI NPC generator producing over-skilled, flat skill profiles by teaching the prompt the CoC7 expertise ladder, and surface each skill's tier in the review dialog so a stray Expert-level skill is visible before Accept.

**Architecture:** The bulk of the change is prompt text in `npc-system-prompt.md`. A new 40-line pure module `skill-tiers.js` owns the ladder (value → tier, tier → ceiling, above-tier test) and is consumed by the NPC mapper's validation and the review dialog. The mapper's characteristic and skill-writing behaviour is deliberately unchanged.

**Tech Stack:** Vanilla ES modules, no build step. FoundryVTT v13+ ApplicationV2. Verification is live-instance browser automation via the Playwright MCP server — this project has no test framework.

## Global Constraints

- **Design source of truth:** `docs/superpowers/specs/2026-07-29-npc-skill-balance-design.md`. Decisions are referenced as D1–D8.
- **No build step.** `module.json`'s `esmodules` array is the entry-point list. A new file only needs adding there if it is a top-level entry; `skill-tiers.js` is imported by other modules, so it must NOT be added to `esmodules`.
- **No automated test framework exists.** Do not add one. Verification runs against a live FoundryVTT instance (typically `http://localhost:30000`) through the Playwright MCP server, per CLAUDE.md. The module is symlinked into Foundry's `Data/modules/coc7-qol`, so working-tree edits are live: JS changes apply on page reload, CSS changes need a page reload.
- **Expertise ladder — exact boundaries** (from the rulebook, D-reference table):
  `novice` 1–5, `neophyte` 6–19, `amateur` 20–49, `professional` 50–74, `expert` 75–89, `master` 90–99.
- **Base values are authoritative** from `../CoC7-FoundryVTT-8.x/compendiums/en-skills.yaml`. Do not invent them.
- **The native language is named, never a placeholder** (spec D9). `Language (Own)` in the compendium is a *template* (`base: '@EDU'`, `requiresname`, `keepbasevalue`, `own`); `Language (English)` is the *foreign*-language skill (`base: 1`). The LLM emits a `nativeLanguage` field plus a concretely named skill; the mapper builds that one skill from the template. The literal string `Language (Own)` must never reach an actor or the review dialog.
- **Branch:** `bugfix-npc-skill-balance`, already created off `develop`. Ships as bugfix → `develop`, then `develop` → `main`.
- **Immutability:** follow the codebase style — build new objects, never mutate inputs.
- **Escaping:** all LLM-derived strings rendered into HTML go through `escapeHtml()` from `../utils.js`.
- **i18n:** all user-visible strings come from `lang/en.json` via `t()` / `tf()` from `../utils.js`. Never hardcode display text.

---

## File Structure

| File | Responsibility | Change |
|------|---------------|--------|
| `scripts/ai-generator/skill-tiers.js` | The expertise ladder as data plus four pure functions. No Foundry API use beyond `t()`. | Create (~55 lines) |
| `scripts/ai-generator/prompts/npc-system-prompt.md` | LLM instructions. Gains SKILL CALIBRATION and BASE VALUES sections; `expertiseTier` added to required fields; the two upward-biasing anchors removed. | Modify |
| `scripts/ai-generator/mappers/npc.js` | `validate()` requires a valid `expertiseTier`; weapon-skill fallback constant 20 → 25. | Modify (2 spots) |
| `scripts/ai-generator/npc-confirmation-dialog.js` | Renders the declared tier in the identity bar and a tier label per skill row, flagging above-tier rows. | Modify (2 spots) |
| `styles/ai-generator.css` | Three-column skill row; tier label styling; above-tier flag. | Modify |
| `lang/en.json` | Six tier names plus three dialog strings. | Modify |

---

### Task 1: The expertise ladder module

Pure functions with no dependency on the mapper or dialog, so it can be verified in isolation before anything consumes it.

**Files:**
- Create: `scripts/ai-generator/skill-tiers.js`
- Modify: `lang/en.json`
- Test: none — verified via `browser_evaluate` against the live instance (see Step 2)

**Interfaces:**
- Consumes: `t()` from `scripts/utils.js`
- Produces, relied on by Tasks 3 and 4:
  - `SKILL_TIERS` — frozen array of `{ key: string, min: number, max: number }`, ascending
  - `SKILL_TIER_KEYS` — frozen array of the six key strings
  - `tierForValue(value: number) => string` — tier key; clamps below 1 to `'novice'` and above 99 to `'master'`
  - `tierCeiling(tierKey: string) => number | null` — `null` for an unknown key
  - `isAboveTier(value: number, tierKey: string) => boolean` — `false` when the key is unknown
  - `tierLabel(tierKey: string) => string` — localized display name; returns the raw key if unknown

- [ ] **Step 1: Add the tier names to `lang/en.json`**

Insert alongside the other `COC7QOL.AIGenerator.*` keys:

```json
  "COC7QOL.AIGenerator.Tier.novice": "Novice",
  "COC7QOL.AIGenerator.Tier.neophyte": "Neophyte",
  "COC7QOL.AIGenerator.Tier.amateur": "Amateur",
  "COC7QOL.AIGenerator.Tier.professional": "Professional",
  "COC7QOL.AIGenerator.Tier.expert": "Expert",
  "COC7QOL.AIGenerator.Tier.master": "Master",
```

- [ ] **Step 2: Write the verification check and run it to confirm it fails**

Navigate to `http://localhost:30000`, join as `Gamemaster`, wait for `game.ready`, then run via `browser_evaluate`:

```js
async () => {
  let m
  try {
    m = await import('/modules/coc7-qol/scripts/ai-generator/skill-tiers.js')
  } catch (e) {
    return 'IMPORT FAILED: ' + e.message
  }
  const cases = [
    ['tierForValue(0)', m.tierForValue(0), 'novice'],
    ['tierForValue(3)', m.tierForValue(3), 'novice'],
    ['tierForValue(5)', m.tierForValue(5), 'novice'],
    ['tierForValue(6)', m.tierForValue(6), 'neophyte'],
    ['tierForValue(19)', m.tierForValue(19), 'neophyte'],
    ['tierForValue(20)', m.tierForValue(20), 'amateur'],
    ['tierForValue(49)', m.tierForValue(49), 'amateur'],
    ['tierForValue(50)', m.tierForValue(50), 'professional'],
    ['tierForValue(74)', m.tierForValue(74), 'professional'],
    ['tierForValue(75)', m.tierForValue(75), 'expert'],
    ['tierForValue(89)', m.tierForValue(89), 'expert'],
    ['tierForValue(90)', m.tierForValue(90), 'master'],
    ['tierForValue(150)', m.tierForValue(150), 'master'],
    ['tierCeiling(amateur)', m.tierCeiling('amateur'), 49],
    ['tierCeiling(master)', m.tierCeiling('master'), 99],
    ['tierCeiling(bogus)', m.tierCeiling('bogus'), null],
    ['isAboveTier(60, amateur)', m.isAboveTier(60, 'amateur'), true],
    ['isAboveTier(49, amateur)', m.isAboveTier(49, 'amateur'), false],
    ['isAboveTier(60, professional)', m.isAboveTier(60, 'professional'), false],
    ['isAboveTier(60, bogus)', m.isAboveTier(60, 'bogus'), false],
    ['tierLabel(professional)', m.tierLabel('professional'), 'Professional'],
    ['tierLabel(bogus)', m.tierLabel('bogus'), 'bogus'],
    ['SKILL_TIER_KEYS.length', m.SKILL_TIER_KEYS.length, 6]
  ]
  const fails = cases.filter(([, got, want]) => got !== want)
  return fails.length
    ? 'FAIL:\n' + fails.map(([n, got, want]) => `  ${n} → ${JSON.stringify(got)}, want ${JSON.stringify(want)}`).join('\n')
    : `PASS (${cases.length} checks)`
}
```

Expected at this point: `IMPORT FAILED: ...` — the file does not exist yet.

- [ ] **Step 3: Create `scripts/ai-generator/skill-tiers.js`**

```js
// The CoC7 skill expertise ladder (Call of Cthulhu 7th Edition rulebook).
//
// A skill percentage is a claim about competence, not an arbitrary number:
// 20-49% is a hobbyist, 50-74% earns a living at it, 75%+ is a career
// specialist. The AI generator uses this both to instruct the LLM and to flag
// skills that overshoot the tier the LLM declared for an NPC.

import { t } from '../utils.js'

export const SKILL_TIERS = Object.freeze([
  Object.freeze({ key: 'novice', min: 1, max: 5 }),
  Object.freeze({ key: 'neophyte', min: 6, max: 19 }),
  Object.freeze({ key: 'amateur', min: 20, max: 49 }),
  Object.freeze({ key: 'professional', min: 50, max: 74 }),
  Object.freeze({ key: 'expert', min: 75, max: 89 }),
  Object.freeze({ key: 'master', min: 90, max: 99 })
])

export const SKILL_TIER_KEYS = Object.freeze(SKILL_TIERS.map(tier => tier.key))

const LOWEST_TIER = SKILL_TIERS[0]
const HIGHEST_TIER = SKILL_TIERS[SKILL_TIERS.length - 1]

/**
 * The tier a skill percentage falls in. Values below the ladder (0, as with
 * Credit Rating or Cthulhu Mythos) read as novice; values above it read as
 * master.
 *
 * @param {number} value
 * @returns {string} tier key
 */
export function tierForValue (value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return LOWEST_TIER.key
  if (n < LOWEST_TIER.min) return LOWEST_TIER.key
  const tier = SKILL_TIERS.find(candidate => n >= candidate.min && n <= candidate.max)
  return tier ? tier.key : HIGHEST_TIER.key
}

/**
 * The highest percentage inside a tier, or null for an unrecognised key.
 *
 * @param {string} tierKey
 * @returns {number|null}
 */
export function tierCeiling (tierKey) {
  const tier = SKILL_TIERS.find(candidate => candidate.key === tierKey)
  return tier ? tier.max : null
}

/**
 * Whether a value overshoots a tier. An unrecognised tier never flags, so a
 * malformed LLM response degrades to "no warnings" rather than flagging
 * everything.
 *
 * @param {number} value
 * @param {string} tierKey
 * @returns {boolean}
 */
export function isAboveTier (value, tierKey) {
  const ceiling = tierCeiling(tierKey)
  if (ceiling === null) return false
  const n = Number(value)
  return Number.isFinite(n) && n > ceiling
}

/**
 * Localized tier name for display. Falls back to the raw key so an unexpected
 * value is visible rather than blank.
 *
 * @param {string} tierKey
 * @returns {string}
 */
export function tierLabel (tierKey) {
  if (!SKILL_TIER_KEYS.includes(tierKey)) return String(tierKey ?? '')
  return t(`COC7QOL.AIGenerator.Tier.${tierKey}`)
}
```

- [ ] **Step 4: Reload the page and re-run the check from Step 2**

Expected: `PASS (23 checks)`.

If `tierLabel(professional)` returns the raw key `COC7QOL.AIGenerator.Tier.professional` instead of `Professional`, the `lang/en.json` edit from Step 1 has not been picked up — hard-reload to bypass the browser cache on the language file.

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-generator/skill-tiers.js lang/en.json
git commit -m "feat: add CoC7 skill expertise ladder module

Pure ladder data plus tierForValue / tierCeiling / isAboveTier /
tierLabel, consumed next by the NPC mapper's validation and the NPC
review dialog.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rewrite the prompt's skill guidance

The substance of the fix (D1–D5). Everything here is text; the verification is a live generation.

**Files:**
- Modify: `scripts/ai-generator/prompts/npc-system-prompt.md`
- Test: none — verified by generating an NPC against a real provider (see Step 5)

**Interfaces:**
- Consumes: nothing
- Produces: the LLM response gains a required top-level `expertiseTier` string whose value is one of the six keys from `SKILL_TIER_KEYS` (Task 1). Task 3 validates it; Task 4 displays it.

- [ ] **Step 1: Add `expertiseTier` to the required-fields list**

In the `Required fields (must always be present):` block, insert immediately after the `name:` bullet:

```markdown
- expertiseTier: string — the NPC's PEAK competence band, exactly one of: "novice", "neophyte", "amateur", "professional", "expert", "master". See SKILL CALIBRATION below.
- nativeLanguage: string — the plain English name of the NPC's mother tongue, with no "Language" prefix and no parentheses (e.g. "English", "French", "Arabic"). ALWAYS in English regardless of prompt language. See BASE VALUES AND MANDATORY CORE SKILLS below.
```

- [ ] **Step 2: Replace the `skills:` bullet**

Replace this block (currently lines 22-26):

```markdown
- skills: array of { "name": string, "value": number } — pick skills that fit the character naturally
  - Use official CoC7 skill names (e.g. "Library Use", "Spot Hidden", "Fighting (Brawl)", "Firearms (Handgun)", "Psychology", "Persuade", "First Aid", "Medicine", "Drive Auto", "Dodge", "Listen", "Stealth", "Science (Chemistry)")
  - For specializations use the format "Category (Specialization)" e.g. "Art/Craft (Painting)", "Science (Pharmacy)", "Language (French)"
  - Values 1–99 as percentages
  - Include whatever skills make sense for the character — typically 5–12 skills
```

with:

```markdown
- skills: array of { "name": string, "value": number }
  - Use official CoC7 skill names (e.g. "Library Use", "Spot Hidden", "Fighting (Brawl)", "Firearms (Handgun)", "Psychology", "Persuade", "First Aid", "Medicine", "Drive Auto", "Dodge", "Listen", "Stealth", "Science (Chemistry)")
  - For specializations use the format "Category (Specialization)" e.g. "Art/Craft (Painting)", "Science (Pharmacy)", "Language (French)"
  - Values are percentages, 1–99
  - Which skills to include, and what values to give them, is governed by SKILL CALIBRATION and BASE VALUES AND MANDATORY CORE SKILLS below. Follow both sections — they matter more than any other instruction in this prompt.
```

- [ ] **Step 3: Insert the two new sections**

Insert immediately before the existing `EQUIPMENT GUIDANCE:` line:

```markdown
SKILL CALIBRATION (most important section — read carefully):

In CoC7 a skill percentage is a claim about how good the NPC actually is:

  01–05%  Novice        complete amateur, baseline or theoretical knowledge only
  06–19%  Neophyte      beginner, small knowledge, rare practice
  20–49%  Amateur       hobby-level, rudimentary training or casual talent
  50–74%  Professional  competent enough to earn a living (~bachelor's degree)
  75–89%  Expert        advanced expertise (~master's degree or Ph.D.)
  90–99%  Master        elite, among the best in the world

Step 1 — Declare the tier. Set "expertiseTier" to one of: novice, neophyte,
  amateur, professional, expert, master. This is the NPC's PEAK — the band of
  their single best skill, NOT an average. Most NPCs met in play are amateur or
  professional. Reserve expert for genuine specialists with years of formal
  training, and master for world-renowned figures — a handful across an entire
  campaign, not one per session. A competent working adult is "professional",
  not "expert".

Step 2 — Decide which 2–4 skills are the occupation skills. ONLY these may
  reach the declared tier. A librarian's are Library Use, Language, History. A
  constable's are Spot Hidden, Law, Listen. A pharmacist's are Science
  (Pharmacy), Medicine, Accounting.

  CRITICAL: combat and firearms skills are NOT occupation skills unless the
  role is fundamentally about violence — soldier, prizefighter, hitman,
  gangster enforcer, big-game hunter. A police constable, night watchman,
  security guard, or private detective carries a weapon and rarely uses it
  well: keep their combat skills in the Amateur band, typically 25–40%.
  Carrying a weapon in weapons[] or possessions[] does NOT justify a
  tier-level combat skill.

Step 3 — Everything else falls below the declared tier and toward base value.
  Most non-occupation skills sit at, or only a little above, their base value.
  A skill resting exactly at its base value is always correct — never raise a
  skill just to avoid repeating a base number, and never lower one below base
  to widen the spread. The base-value floor always wins over this step.

ANTI-PATTERN — do not do this: a flat profile where every skill lands in the
  same 35–60% band. That is a bland generalist, not a character. The correct
  shape is two skills that define them, a few they are passably trained in, and
  the rest at baseline.

Worked example — "a police constable in 1920s London", DEX 50, EDU 55:
  expertiseTier: "professional"; occupation skills Spot Hidden, Law, Listen,
  Intimidate.
    Spot Hidden 55, Law 50            (occupation, at tier)
    Intimidate 45, Listen 40          (occupation, below peak)
    Fighting (Brawl) 40               (NOT an occupation skill — Amateur band)
    Psychology 20, Persuade 25        (non-occupation, near base)
    Language (English) 55             (native tongue = EDU; nativeLanguage "English")
    First Aid 30, Dodge 25, Climb 20, Drive Auto 20, Firearms (Handgun) 20,
    Jump 20, Library Use 20, Stealth 20, Swim 20, Throw 20
                                      (core skills at base)

BASE VALUES AND MANDATORY CORE SKILLS:

NEVER assign a value BELOW a skill's base value. In CoC7 the base value is what
a completely untrained person already has, so it is a hard floor.

These 14 skills are ALWAYS present in skills[], at their base value or higher
(higher only when it genuinely fits the character):

  Climb 20                 Language (native tongue) = EDU
  Dodge = DEX ÷ 2          Library Use 20
  Drive Auto 20            Listen 20
  Fighting (Brawl) 25      Spot Hidden 25
  Firearms (Handgun) 20    Stealth 20
  First Aid 30             Swim 20
  Jump 20                  Throw 20

Two of these are derived — compute them yourself from the characteristics you
assigned to THIS NPC:
  - Dodge = DEX ÷ 2, rounded DOWN (DEX 50 → 25, DEX 65 → 32)
  - The native language = exactly the EDU value (EDU 55 → 55)

THE NATIVE LANGUAGE — name the actual language, never a placeholder:
  Set "nativeLanguage" to the plain language name ("English"), and list the
  skill under its real name, "Language (English)". A London constable gets
  nativeLanguage "English" and a skill "Language (English)" at EDU. A Parisian
  gets nativeLanguage "French" and "Language (French)" at EDU.
  NEVER write the literal string "Language (Own)" — that is an internal
  placeholder, not a skill name, and it renders as an unnamed skill on the
  sheet.
  Any ADDITIONAL language the NPC learned is a separate entry at its own
  trained value, well below EDU — e.g. a London constable who studied a little
  French lists "Language (French)" at 15. Only the mother tongue equals EDU,
  and only the mother tongue goes in "nativeLanguage".

Keep era-inappropriate entries anyway: an 1890s NPC still lists Drive Auto at
20, because that is the character-sheet default.

Base values for other common skills, for reference:
  Accounting 5, Animal Handling 5, Anthropology 1, Appraise 5, Archaeology 1,
  Art/Craft (any) 5, Charm 15, Civics 10, Computer Use 5, Credit Rating 0,
  Cthulhu Mythos 0, Demolitions 1, Disguise 5, Diving 1, Electrical Repair 10,
  Electronics 1, Fast Talk 5, Fighting (Axe) 15, Fighting (Spear) 20,
  Fighting (Sword) 20, Firearms (Bow) 15, Firearms (Rifle/Shotgun) 25,
  Gambling 10, History 5, Hypnosis 1, Intimidate 15, Language (other) 1, Law 5,
  Locksmith 1, Lore (any) 1, Mechanical Repair 10, Medicine 1,
  Natural World 10, Navigate 10, Occult 5, Operate Heavy Machinery 1,
  Persuade 10, Pilot (any) 1, Psychoanalysis 1, Psychology 10, Read Lips 1,
  Ride 5, Rope Use 5, Science (any) 1, Science (Mathematics) 10,
  Sleight of Hand 10, Survival (any) 10, Track 10

Beyond the mandatory 14, include a skill ONLY when the NPC is trained ABOVE its
base value. Do not pad the list with untrained skills — leave them out. Expect
roughly 17–22 skills total: the 14 core ones plus 3–8 others.
```

- [ ] **Step 4: Rewrite the weapon-skill anchor**

This is root cause 2 — the only numeric anchors in the prompt, and both are high. Replace the final bullet of `EQUIPMENT GUIDANCE:` (currently line 53):

```markdown
- If you do include weapons (typically 1–3 when justified), EVERY weapon's "skill" name MUST appear in skills[] with an appropriate value (e.g. a thug with a knife → "Fighting (Brawl)" at 30–60; a soldier with a rifle → "Firearms (Rifle/Shotgun)" at 50+). If you forget the skill, a generic default will be auto-added, but it won't reflect the character's actual competence.
```

with:

```markdown
- If you do include weapons (typically 1–3 when justified), EVERY weapon's "skill" name MUST appear in skills[]. Choose its value using SKILL CALIBRATION — holding a weapon does not make its skill an occupation skill. A dock thug's "Fighting (Brawl)" belongs in the Amateur band; only someone whose living is violence (soldier, prizefighter, enforcer) reaches Professional or above. If you omit the skill, a fallback at its base value is auto-added, which will not reflect the character.
```

- [ ] **Step 5: Verify with a live generation**

Reload the page (the prompt is `fetch`ed and cached per session by `prompts/loader.js`, so a reload is required to pick up the edit). Open the Create Actor dialog, choose type `npc`, click the AI sparkle button, and generate with the exact prompt:

```
a police constable in 1920s London
```

In the review dialog, check:
- The response validated — no error notification.
- No combat skill (`Fighting (*)`, `Firearms (*)`) exceeds 49%. **This is the reported defect.**
- All 14 mandatory core skills are present.
- `Dodge` equals ⌊DEX ÷ 2⌋ and the native-language skill equals EDU, read off the characteristics shown in the same dialog.
- `nativeLanguage` is a bare language name (`"English"`, no parentheses), `skills[]` contains `Language (<that name>)`, and the literal string `Language (Own)` appears nowhere.
- Skill count is roughly 17–22, and the profile is not flat: the top skill should sit clearly above the median.

If a combat skill still exceeds 49%, do not weaken the check — regenerate twice more to see whether it is systematic or a one-off. If systematic, the Step 3 CRITICAL paragraph needs strengthening (e.g. naming the specific occupation that failed), not the verification loosening.

- [ ] **Step 6: Commit**

```bash
git add scripts/ai-generator/prompts/npc-system-prompt.md
git commit -m "fix: calibrate NPC skill values to the CoC7 expertise ladder

Generated NPCs were systematically over-skilled and flat — a beat
constable came out with Fighting (Brawl) at 60%, Professional tier,
alongside nine skills clustered between 35% and 60%.

The prompt previously said only 'Values 1-99 as percentages', and its
only numeric anchors were high ('thug with a knife -> 30-60',
'soldier with a rifle -> 50+'). It now carries the rulebook ladder, a
declared expertiseTier denoting the NPC's peak, the rule that only 2-4
occupation skills may reach that peak, and an explicit carve-out that
combat skills are not occupation skills unless the role is about
violence.

Also adds CoC7 base values as a hard floor, the 14 mandatory core
skills, and instructions to derive Dodge from DEX and the native
language from EDU. The mother tongue is named concretely
('Language (English)') with a new nativeLanguage field, never the
internal 'Language (Own)' placeholder.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mapper — tier validation, weapon-skill floor, and native-language resolution

**Files:**
- Modify: `scripts/ai-generator/mappers/npc.js:11` (constant), `:49-68` (`validate`), `:70-118` (`toFoundryData`), `:120-135` (`resolveSkills`), `:137-185` (`_resolveOneSkill`)
- Test: none — verified via `browser_evaluate` (see Steps 1, 4, 5 and 7)

**Interfaces:**
- Consumes: `SKILL_TIER_KEYS` from `scripts/ai-generator/skill-tiers.js` (Task 1); the `expertiseTier` and `nativeLanguage` fields the prompt produces (Task 2)
- Produces:
  - `validate()` throws when `expertiseTier` is missing or not one of the six keys.
  - `skillsRaw` entries may carry an extra `own: true` flag marking the native language. `resolveSkills()` builds those from the `Language (Own)` compendium template. No signature change to `resolveSkills()`, so `dialog-injector.js` needs no edit.
  - No change to `toFoundryData()`'s outer return shape — `expertiseTier` and `nativeLanguage` already reach the dialog inside the existing `llmData: data` passthrough.

- [ ] **Step 1: Write the verification check and run it to confirm it fails**

Run via `browser_evaluate`:

```js
async () => {
  const { default: mapper } = await import('/modules/coc7-qol/scripts/ai-generator/mappers/npc.js')
  const base = {
    name: 'Test Subject',
    characteristics: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50 },
    skills: [{ name: 'Dodge', value: 25 }]
  }
  const attempt = (data) => {
    try { mapper.validate(data); return 'no-error' } catch (e) { return e.message }
  }
  const results = {
    missing: attempt({ ...base }),
    invalid: attempt({ ...base, expertiseTier: 'godlike' }),
    wrongCase: attempt({ ...base, expertiseTier: 'Professional' }),
    valid: attempt({ ...base, expertiseTier: 'professional' })
  }
  const fails = []
  if (!/expertiseTier/.test(results.missing)) fails.push(`missing → ${results.missing}`)
  if (!/expertiseTier/.test(results.invalid)) fails.push(`invalid → ${results.invalid}`)
  if (!/expertiseTier/.test(results.wrongCase)) fails.push(`wrongCase → ${results.wrongCase}`)
  if (results.valid !== 'no-error') fails.push(`valid → ${results.valid}`)
  return fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'PASS (4 checks)'
}
```

Expected: `FAIL` on `missing`, `invalid`, and `wrongCase` — `validate()` does not know about `expertiseTier` yet, so all three return `no-error`.

- [ ] **Step 2: Import the tier keys and raise the fallback constant**

In `scripts/ai-generator/mappers/npc.js`, add to the imports:

```js
import { SKILL_TIER_KEYS } from '../skill-tiers.js'
```

Then replace the constant:

```js
const WEAPON_SKILL_FALLBACK_VALUE = 20
```

with:

```js
// 25 is the highest base value among weapon skills (Fighting (Brawl) 25,
// Firearms (Rifle/Shotgun) 25), so this fallback is at or above base for every
// weapon skill. A CoC7 skill may never sit below its base value; the previous
// 20 was illegal for a brawler.
const WEAPON_SKILL_FALLBACK_VALUE = 25
```

- [ ] **Step 3: Validate the tier**

In `validate()`, insert after the `if (!data.name) errors.push('name')` line:

```js
    if (!SKILL_TIER_KEYS.includes(data.expertiseTier)) {
      errors.push(`expertiseTier (must be one of: ${SKILL_TIER_KEYS.join(', ')})`)
    }
```

- [ ] **Step 4: Reload the page and re-run the check from Step 1**

Expected: `PASS (4 checks)`.

- [ ] **Step 5: Confirm the auto-add warning still reads correctly**

Run via `browser_evaluate` — a weapon whose skill is absent from `skills[]` must be auto-added at 25 with a warning:

```js
async () => {
  const { default: mapper } = await import('/modules/coc7-qol/scripts/ai-generator/mappers/npc.js')
  const out = mapper.toFoundryData({
    name: 'Test Subject',
    expertiseTier: 'amateur',
    characteristics: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50 },
    skills: [{ name: 'Dodge', value: 25 }],
    weapons: [{ name: 'Cosh', damage: '1d6', skill: 'Fighting (Brawl)' }]
  })
  const added = out.skillsRaw.find(s => s.name === 'Fighting (Brawl)')
  if (!added) return 'FAIL: skill was not auto-added'
  if (added.value !== 25) return `FAIL: auto-added at ${added.value}, want 25`
  if (!out.warnings.some(w => w.includes('Fighting (Brawl)'))) return 'FAIL: no warning recorded'
  return 'PASS: auto-added at 25 with warning — ' + out.warnings[0]
}
```

Expected: `PASS: auto-added at 25 with warning — Auto-added skill "Fighting (Brawl)" at 25% …`

- [ ] **Step 6: Tag the native-language skill in `toFoundryData`**

Per spec decision D9. In `en-skills.yaml`, `Language (Own)` is a *template* —
`base: '@EDU'` with `requiresname: true`, `keepbasevalue: true`, `own: true` —
while `Language (English)` is the *foreign*-language skill with `base: 1`. The
NPC's mother tongue must be named concretely but built from the template, or it
is recorded as a language the NPC merely studied. `properties.own` is not
cosmetic: `character-sheet-v2.js:140` appends an "own" marker to the displayed
name and `utilities.js:1067` sorts own-languages separately.

In `toFoundryData`, replace this line:

```js
    const skillsRaw = this._ensureWeaponSkills(data.skills, weaponsData, warnings)
```

with:

```js
    const skillsRaw = this._tagNativeLanguage(
      this._ensureWeaponSkills(data.skills, weaponsData, warnings),
      data.nativeLanguage,
      warnings
    )
```

Then add this method next to `_ensureWeaponSkills`:

```js
  /**
   * Mark the NPC's mother tongue so resolveSkills() can build it from the
   * `Language (Own)` compendium template rather than the foreign-language
   * entry of the same name. Only the first match is tagged — an NPC has one
   * native language.
   */
  _tagNativeLanguage (skills, nativeLanguage, warnings) {
    const language = (nativeLanguage ?? '').trim()
    if (!language) return skills
    const target = `language (${language})`.toLowerCase()
    let tagged = false
    const result = skills.map(skill => {
      if (tagged) return skill
      if ((skill?.name ?? '').trim().toLowerCase() !== target) return skill
      tagged = true
      return { ...skill, own: true }
    })
    if (!tagged) {
      warnings.push(`Native language "${language}" has no matching skill — expected an entry named "Language (${language})"`)
    }
    return result
  }
```

- [ ] **Step 7: Resolve the tagged skill from the `Language (Own)` template**

In `resolveSkills`, widen the destructuring to carry the flag through:

```js
    for (const { name, value } of skillsRaw) {
      const normalized = name.trim().replace(/\s+/g, ' ')
      const skillData = await this._resolveOneSkill(normalized, value, pack, compendiumIndex)
```

becomes:

```js
    for (const { name, value, own } of skillsRaw) {
      const normalized = name.trim().replace(/\s+/g, ' ')
      const skillData = await this._resolveOneSkill(normalized, value, pack, compendiumIndex, own === true)
```

Change `_resolveOneSkill`'s signature to accept the flag:

```js
  async _resolveOneSkill (skillName, targetValue, pack, compendiumIndex, isNativeLanguage = false) {
```

and insert this as the FIRST thing in its body, before the existing compendium
lookup. It mirrors CoC7's own naming flow at `document-class.js:645-658`:

```js
    // The mother tongue is built from the `Language (Own)` template, then named.
    // keepbasevalue is true on that template, so `base` stays '@EDU' — CoC7
    // clears the naming flags once a concrete language is chosen.
    if (isNativeLanguage && pack && compendiumIndex) {
      const template = compendiumIndex.find(
        entry => entry.name.toLowerCase() === 'language (own)'
      )
      const templateDoc = template ? await pack.getDocument(template._id) : null
      if (templateDoc) {
        const data = templateDoc.toObject()
        const parts = CONFIG.Item.dataModels.skill.guessNameParts(skillName)
        data.name = parts.name
        data.system.skillName = parts.system.skillName
        data.system.specialization = parts.system.specialization
        data.system.properties = {
          ...data.system.properties,
          requiresname: false,
          picknameonly: false,
          keepbasevalue: false,
          own: true
        }
        data.system.adjustments = {
          personal: targetValue,
          base: 0,
          occupation: 0,
          archetype: 0,
          experiencePackage: 0,
          experience: 0
        }
        foundry.utils.setProperty(
          data,
          'flags.CoC7.cocidFlag.id',
          'i.skill.' + parts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        )
        delete data._id
        return data
      }
    }
```

- [ ] **Step 8: Verify the native-language resolution against the real compendium**

Reload the page, then run via `browser_evaluate`. This exercises the real
`CoC7.skills` pack, so it catches a wrong template name or a schema mismatch:

```js
async () => {
  const { default: mapper } = await import('/modules/coc7-qol/scripts/ai-generator/mappers/npc.js')
  const out = mapper.toFoundryData({
    name: 'Test Subject',
    expertiseTier: 'professional',
    nativeLanguage: 'English',
    characteristics: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 55 },
    skills: [
      { name: 'Language (English)', value: 55 },
      { name: 'Language (French)', value: 15 },
      { name: 'Dodge', value: 25 }
    ]
  })
  const tagged = out.skillsRaw.filter(s => s.own === true).map(s => s.name)
  const resolved = await mapper.resolveSkills(out.skillsRaw)
  const byName = Object.fromEntries(resolved.map(s => [s.name, s]))
  const native = byName['Language (English)']
  const foreign = byName['Language (French)']
  const total = s => Object.values(s.system.adjustments).reduce((c, v) => c + Number(v), 0)
  const fails = []
  if (JSON.stringify(tagged) !== JSON.stringify(['Language (English)'])) fails.push(`tagged = ${JSON.stringify(tagged)}, want ["Language (English)"]`)
  if (!native) fails.push('native language skill missing from resolved output')
  if (native && native.system.properties.own !== true) fails.push('native: own !== true')
  if (native && native.system.properties.requiresname !== false) fails.push('native: requiresname not cleared')
  if (native && native.system.base !== '@EDU') fails.push(`native: base = ${JSON.stringify(native?.system.base)}, want "@EDU"`)
  if (native && native.system.skillName !== 'English') fails.push(`native: skillName = ${native.system.skillName}, want English`)
  if (native && total(native) !== 55) fails.push(`native: total = ${total(native)}, want 55`)
  if (foreign && foreign.system.properties.own === true) fails.push('foreign language wrongly marked own')
  if (foreign && total(foreign) !== 15) fails.push(`foreign: total = ${total(foreign)}, want 15`)
  if (resolved.some(s => s.name === 'Language (Own)')) fails.push('a skill literally named "Language (Own)" reached the actor')
  return fails.length
    ? 'FAIL:\n  ' + fails.join('\n  ')
    : `PASS — native ${native.name} own=${native.system.properties.own} base=${native.system.base} total=${total(native)}; foreign ${foreign.name} total=${total(foreign)}`
}
```

Expected: `PASS`. Also confirm the mismatch path warns rather than throwing — re-run with `nativeLanguage: 'Klingon'` and check `out.warnings` contains a "has no matching skill" entry and that `resolveSkills` still returns all three skills.

- [ ] **Step 9: Commit**

```bash
git add scripts/ai-generator/mappers/npc.js
git commit -m "fix: require a valid expertiseTier and lift the weapon-skill floor

validate() now rejects a response whose expertiseTier is missing or
outside the six ladder keys, so a non-compliant provider surfaces a
clear error instead of a dialog that silently cannot flag anything.

WEAPON_SKILL_FALLBACK_VALUE goes 20 -> 25. A CoC7 skill may never sit
below its base value, and Fighting (Brawl)'s base is 25, so the old
fallback wrote an illegal value. 25 is the highest base among weapon
skills, so it is legal for all of them.

The NPC's mother tongue is now built from the `Language (Own)`
compendium template and named concretely. That entry is a template
(base '@EDU', requiresname, keepbasevalue, own), whereas
`Language (English)` is the foreign-language skill with base 1 —
so resolving the mother tongue by plain name recorded a native speaker
as having merely studied their own language, losing properties.own,
which drives both the sheet's own-language marker and skill sorting.
toFoundryData tags the entry named for `nativeLanguage`; resolveSkills
builds it from the template, clears the naming flags, and keeps own.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Show tiers in the review dialog

D8. Read-only display; the GM adjusts on the sheet afterwards.

**Files:**
- Modify: `scripts/ai-generator/npc-confirmation-dialog.js:36-51` (identity bar), `scripts/ai-generator/npc-confirmation-dialog.js:74-85` (skill rows)
- Modify: `styles/ai-generator.css` (skill row becomes three columns)
- Modify: `lang/en.json` (three strings)
- Test: none — verified by instantiating the dialog with mock data via `browser_evaluate` (see Step 4)

**Interfaces:**
- Consumes: `tierForValue`, `isAboveTier`, `tierLabel` from `scripts/ai-generator/skill-tiers.js` (Task 1); `llmData.expertiseTier` produced by Task 2 and validated by Task 3
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the dialog strings to `lang/en.json`**

```json
  "COC7QOL.AIGenerator.NPCDialog.TierLabel": "Peak",
  "COC7QOL.AIGenerator.NPCDialog.AboveTierTitle": "Above the declared {tier} tier — check this is deliberate",
  "COC7QOL.AIGenerator.NPCDialog.AboveTierBadge": "!",
```

- [ ] **Step 2: Import the ladder helpers**

In `scripts/ai-generator/npc-confirmation-dialog.js`, extend the existing imports:

```js
import { escapeHtml, t, tf } from '../utils.js'
import { CHARACTERISTIC_FORMULAS } from './mappers/npc.js'
import { tierForValue, isAboveTier, tierLabel } from './skill-tiers.js'
```

- [ ] **Step 3: Render the declared tier and per-skill tiers**

In `_renderHTML`, add the tier to the identity meta block. Replace:

```js
          ${llm.age ? `<span><span class="coc7-npc-identity-meta-label">${t('CoC7.Age')}</span>&nbsp;${escapeHtml(String(llm.age))}</span>` : ''}
```

with:

```js
          ${llm.age ? `<span><span class="coc7-npc-identity-meta-label">${t('CoC7.Age')}</span>&nbsp;${escapeHtml(String(llm.age))}</span>` : ''}
          ${llm.expertiseTier ? `<span><span class="coc7-npc-identity-meta-label">${t('COC7QOL.AIGenerator.NPCDialog.TierLabel')}</span>&nbsp;${escapeHtml(tierLabel(llm.expertiseTier))}</span>` : ''}
```

Then replace the whole `skillRows` block:

```js
    const skillRows = skills.map(s => `
      <div class="coc7-npc-skill-row">
        <span class="coc7-npc-skill-name">${escapeHtml(s.name)}</span>
        <span class="coc7-npc-skill-value">${escapeHtml(String(s.value))}%</span>
      </div>`).join('')
```

with:

```js
    const declaredTier = llm.expertiseTier
    const aboveTierTitle = tf('COC7QOL.AIGenerator.NPCDialog.AboveTierTitle', {
      tier: tierLabel(declaredTier)
    })
    const skillRows = skills.map(s => {
      const above = isAboveTier(s.value, declaredTier)
      const flag = above
        ? `<span class="coc7-npc-skill-flag" title="${escapeHtml(aboveTierTitle)}">${t('COC7QOL.AIGenerator.NPCDialog.AboveTierBadge')}</span>`
        : ''
      return `
      <div class="coc7-npc-skill-row${above ? ' coc7-npc-skill-above-tier' : ''}">
        <span class="coc7-npc-skill-name">${escapeHtml(s.name)}</span>
        <span class="coc7-npc-skill-tier">${escapeHtml(tierLabel(tierForValue(s.value)))}</span>
        <span class="coc7-npc-skill-value">${flag}${escapeHtml(String(s.value))}%</span>
      </div>`
    }).join('')
```

- [ ] **Step 4: Restyle the skill row for three columns**

In `styles/ai-generator.css`, replace:

```css
.coc7-npc-skill-row {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-cool-5-75, #1f1f1f);
  padding: 0.15rem 0;
}

.coc7-npc-skill-name {
  color: var(--color-text-light-3, #ccc);
}
```

with:

```css
/* Three columns: name (shrinkable), tier, value. The tier text is the
   at-a-glance calibration cue — a beat constable showing "Professional" next
   to a combat skill is the bug this dialog exists to surface. */
.coc7-npc-skill-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  column-gap: 0.4rem;
  border-bottom: 1px solid var(--color-cool-5-75, #1f1f1f);
  padding: 0.15rem 0;
}

.coc7-npc-skill-name {
  color: var(--color-text-light-3, #ccc);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coc7-npc-skill-tier {
  font-size: 0.68rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--color-text-dark-5, #7a7a7a);
}

.coc7-npc-skill-above-tier {
  background: rgba(212, 160, 23, 0.1);
  border-bottom-color: var(--color-warm-2, #d4a017);
}

.coc7-npc-skill-above-tier .coc7-npc-skill-tier {
  color: var(--color-warm-2, #d4a017);
}

.coc7-npc-skill-flag {
  color: var(--color-warm-2, #d4a017);
  font-weight: bold;
  margin-right: 0.25rem;
  cursor: help;
}
```

- [ ] **Step 5: Verify by instantiating the dialog with mock data**

Reload the page (CSS needs it), then run via `browser_evaluate`. The mock deliberately reproduces the reported constable so the flag has something to catch:

```js
async () => {
  const { default: Dialog } = await import('/modules/coc7-qol/scripts/ai-generator/npc-confirmation-dialog.js')
  const dlg = new Dialog({
    npcData: {
      llmData: {
        name: 'Constable Arthur Finch',
        occupation: 'Police Officer',
        age: 34,
        expertiseTier: 'amateur',
        characteristics: { str: 65, con: 60, siz: 65, dex: 50, app: 50, int: 55, pow: 50, edu: 55 },
        skills: [
          { name: 'Fighting (Brawl)', value: 60 },
          { name: 'Spot Hidden', value: 45 },
          { name: 'Law', value: 30 },
          { name: 'Language (English)', value: 55 },
          { name: 'Dodge', value: 25 }
        ]
      },
      weaponsData: [],
      possessionsData: [],
      warnings: []
    },
    onAccept () {}, onRegenerate () {}, onCancel () {}
  })
  await dlg.render(true)
  const root = dlg.element
  const rows = [...root.querySelectorAll('.coc7-npc-skill-row')]
  const report = rows.map(r => ({
    name: r.querySelector('.coc7-npc-skill-name').textContent,
    tier: r.querySelector('.coc7-npc-skill-tier').textContent,
    flagged: r.classList.contains('coc7-npc-skill-above-tier'),
    overflows: r.scrollWidth > r.clientWidth
  }))
  const meta = root.querySelector('.coc7-npc-identity-meta').textContent.replace(/\s+/g, ' ').trim()
  const fails = []
  if (!/Peak\s*Amateur/.test(meta)) fails.push(`identity bar missing peak tier: "${meta}"`)
  const brawl = report.find(r => r.name === 'Fighting (Brawl)')
  // textContent is the un-transformed string. The CSS uppercases the tier
  // visually, but text-transform never reaches the DOM text.
  if (brawl?.tier !== 'Professional') fails.push(`Fighting (Brawl) tier = ${brawl?.tier}, want Professional`)
  if (!brawl?.flagged) fails.push('Fighting (Brawl) at 60 was not flagged above the amateur tier')
  const lang = report.find(r => r.name === 'Language (English)')
  if (!lang?.flagged) fails.push('Language (English) at 55 was not flagged above the amateur tier')
  if (report.find(r => r.name === 'Spot Hidden')?.flagged) fails.push('Spot Hidden at 45 was wrongly flagged')
  if (report.find(r => r.name === 'Dodge')?.flagged) fails.push('Dodge at 25 was wrongly flagged')
  if (report.some(r => r.overflows)) fails.push('a skill row overflows its column')
  return (fails.length ? 'FAIL:\n  ' + fails.join('\n  ') + '\n\n' : 'PASS\n\n') + JSON.stringify(report, null, 1)
}
```

Expected: `PASS`, with `Fighting (Brawl)` and `Language (Own)` flagged and the rest clean.

Note: this mock uses `expertiseTier: 'amateur'` to exercise the flag. A real constable would declare `professional` per Task 2's worked example, in which case only skills above 74 would flag.

- [ ] **Step 6: Take a screenshot and check the layout at a small viewport**

Capture a screenshot of the open dialog. Then `browser_resize` to 1024×600 — the small-display case behind issue #8 — and confirm the footer buttons are still reachable and the dialog scrolls internally rather than clipping. `.coc7-ai-npc-dialog` already owns its scroll region, so this is a regression check on the taller skill list, not new work.

- [ ] **Step 7: Clean up**

ApplicationV2 instances live in `foundry.applications.instances`, not the legacy `ui.windows`:

```js
async () => {
  const insts = [...foundry.applications.instances.values()]
    .filter(a => a.constructor.name === 'CoC7NPCConfirmationDialog')
  for (const a of insts) await a.close()
  return `closed ${insts.length}`
}
```

- [ ] **Step 8: Commit**

```bash
git add scripts/ai-generator/npc-confirmation-dialog.js styles/ai-generator.css lang/en.json
git commit -m "feat: show skill tiers in the NPC review dialog

The identity bar shows the LLM's declared peak tier, each skill row
carries its own tier name, and rows above the declared tier get an
amber flag with a tooltip. An over-tuned skill is now visible before
Accept rather than after the actor exists.

Skill rows become a three-column grid; long names ellipsize rather
than pushing the value out of the row.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification across varied NPCs

The spec's test plan. This is where the fix is actually judged — the earlier tasks only prove the machinery works.

**Files:**
- Modify: none expected. Any fix goes to `npc-system-prompt.md`.
- Test: none — manual generation against a live provider

**Interfaces:**
- Consumes: everything from Tasks 1–4
- Produces: a go/no-go on the prompt rewrite

- [ ] **Step 1: Generate the five profile prompts and record the results**

Reload the page. For each prompt, generate an NPC and record: declared tier, peak skill and value, the value of every combat skill, total skill count, and whether all 14 core skills are present.

1. `a nervous pharmacist in 1920s Arkham, middle-aged`
2. `a dockworker in 1890s Liverpool`
3. `a professor of archaeology at Miskatonic University`
4. `a gangster enforcer in 1930s Chicago`
5. `a country doctor in rural Vermont, 1920s`

- [ ] **Step 2: Check the results against these criteria**

- **Combat carve-out (D2):** prompts 1, 2, 3, 5 must have every `Fighting (*)` and `Firearms (*)` skill ≤ 49. Prompt 4 is the control — the enforcer legitimately may reach Professional or above, and if it does not, the rule has over-corrected.
- **Not flat (D1):** peak minus median should be well above 10 points for every NPC.
- **Tier restraint (D1):** none of prompts 1, 2, 5 should self-declare `expert` or `master`. Prompt 3 declaring `expert` is defensible for a tenured academic.
- **Floors (D3):** no skill below its base value. Spot-check `First Aid ≥ 30`, `Fighting (Brawl) ≥ 25`, `Spot Hidden ≥ 25`, `Listen ≥ 20`.
- **Core set (D4):** all 14 present on every NPC.
- **Derived (D6):** `Dodge` = ⌊DEX ÷ 2⌋ and the native language = EDU against the characteristics in the same dialog.
- **Native language (D9):** `nativeLanguage` is a bare language name with no parentheses; `skills[]` carries `Language (<that name>)` and NOT the literal `Language (Own)`. On at least one accepted actor, confirm the created skill has `properties.own === true` and `properties.requiresname === false`, and that any additional foreign language is well below EDU and not marked `own`.
- **No padding (D5):** roughly 17–22 skills; a run of non-core skills sitting exactly at base means D5 is being ignored.

- [ ] **Step 3: Check the random-characteristics known limitation is benign**

Generate prompt 1 again with the **Random characteristics** checkbox ticked. Confirm: the dialog renders, characteristics show as formulas, no validation error, and Accept creates the actor. `Dodge` and `Language (Own)` will disagree with the rolled DEX and EDU — that is the documented known limitation in the spec, not a bug to fix here. Note the actual discrepancy in the PR description.

- [ ] **Step 4: Check a non-English prompt**

Generate with:

```
un pharmacien nerveux à Arkham dans les années 1920
```

Confirm: narrative fields come back in French, every `skills[].name` is still an English CoC7 name, and `expertiseTier` is still one of the six lowercase English keys. A localized tier value (`"professionnel"`) would fail validation — if that happens, the required-fields bullet from Task 2 Step 1 needs the same "KEEP IN ENGLISH" treatment the existing LANGUAGE RULES give `occupation`.

- [ ] **Step 5: Check the missing-field path**

Confirm a response without `expertiseTier` produces a clear error rather than a broken dialog:

```js
async () => {
  const { default: mapper } = await import('/modules/coc7-qol/scripts/ai-generator/mappers/npc.js')
  try {
    mapper.validate({
      name: 'X',
      characteristics: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50 },
      skills: [{ name: 'Dodge', value: 25 }]
    })
    return 'FAIL: no error thrown'
  } catch (e) {
    return /expertiseTier/.test(e.message) ? 'PASS: ' + e.message : 'FAIL: ' + e.message
  }
}
```

- [ ] **Step 6: If any criterion in Step 2 fails, strengthen the prompt and re-run**

Fix in `npc-system-prompt.md` only — do not loosen the criteria and do not add a code-level clamp, which the spec rejected under D8. Name the failing occupation explicitly in the Step 3 CRITICAL paragraph if the combat carve-out is what slipped. Commit each prompt iteration separately so the effect of each is traceable.

- [ ] **Step 7: Commit any prompt refinements**

```bash
git add scripts/ai-generator/prompts/npc-system-prompt.md
git commit -m "fix: tighten NPC skill calibration after live verification

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Ship it

- [ ] **Step 1: Re-run the three isolated checks once more on a fresh page load**

Task 1 Step 2, Task 3 Step 1, and Task 4 Step 5. All three must report `PASS` against the final state of the code, not the state each was written for.

- [ ] **Step 2: Confirm nothing unintended is staged**

```bash
git status
git diff develop...HEAD --stat
```

Expected files only: `docs/superpowers/specs/2026-07-29-npc-skill-balance-design.md`, `docs/superpowers/plans/2026-07-29-npc-skill-balance.md`, `scripts/ai-generator/skill-tiers.js`, `scripts/ai-generator/prompts/npc-system-prompt.md`, `scripts/ai-generator/mappers/npc.js`, `scripts/ai-generator/npc-confirmation-dialog.js`, `styles/ai-generator.css`, `lang/en.json`.

`module.json` must NOT appear — `skill-tiers.js` is an imported module, not an entry point.

- [ ] **Step 3: Open the PR to `develop`**

```bash
git push -u origin bugfix-npc-skill-balance
```

Then open a PR titled `fix: calibrate AI-generated NPC skills to the CoC7 expertise ladder`, whose body covers: the reported constable, the four root causes, the six decisions implemented, the two known limitations from the spec (random-characteristics staleness, floors depending on model compliance), and the Task 5 results table.

- [ ] **Step 4: Add the CHANGELOG entry on `develop` after the merge**

Per project convention, changelog edits go directly on `develop` rather than on a bugfix branch. After the PR merges, on `develop`, add a new heading above the existing `## [0.5.1] - 2026-07-29` block — `## [0.5.2] - <today's date>`, matching the existing format, since `release.sh` aborts unless a `## [X.Y.Z] - YYYY-MM-DD` entry already exists for the target version. Under it:

```markdown
### Fixed

- **AI-generated NPCs were systematically over-skilled** — Generated NPCs came out as bland generalists with every skill bunched in one competent band; a beat constable would have Fighting (Brawl) at 60%, the range that describes someone who fights for a living. The generator now works from the rulebook's expertise ladder: it declares an NPC's peak competence band up front, lets only the two-to-four skills the occupation is actually built on reach it, and keeps combat skills amateur unless the role is genuinely about violence. CoC7 base values are enforced as a floor, the 14 core skills are always present, and the review dialog now labels every skill with its tier and flags any that overshoot the declared peak.
```

---

## Notes for the implementer

**The prompt is the deliverable.** Tasks 1, 3 and 4 are small and mechanical. Task 2 and Task 5 are the actual fix, and Task 5 is where it either works or does not. Budget accordingly, and resist the temptation to treat a passing Task 4 check as evidence the balance problem is solved — it only proves the dialog can display a tier.

**LLM output is not deterministic.** A single good generation does not prove the prompt works, and a single bad one does not prove it failed. Generate at least three times before concluding anything about a criterion.

**Why the review dialog and not a code clamp.** The spec rejected clamping skill values in the mapper (D8): it would silently override deliberately high-end NPCs — a master swordsman, a 90% cult leader — and would need an occupation → tier table the module has no authoritative source for. The dialog puts the judgement with the Keeper. Do not "improve" this by adding a clamp.

**One display observation to make during Task 4 Step 6.** With the 14 mandatory core skills mostly at base, many rows will read `AMATEUR`, which may look repetitive. If it reads as noise, the cheap alternative is showing the tier text only on rows at or above the declared tier. Raise it rather than changing it unilaterally — the spec asks for a label on every row.
