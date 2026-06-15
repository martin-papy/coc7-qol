# Isolate AI system prompts as runtime-loaded Markdown files

**Date:** 2026-06-15
**Status:** Approved

## Problem

The AI generator's LLM system prompts are large, dense instruction blocks hardcoded as
`SYSTEM_PROMPT` template literals inside the mapper modules:

- [`scripts/ai-generator/mappers/weapon.js`](../../../scripts/ai-generator/mappers/weapon.js) — ~24 lines
- [`scripts/ai-generator/mappers/npc.js`](../../../scripts/ai-generator/mappers/npc.js) — ~53 lines

This couples prompt prose with mapper logic. Reviewing or tweaking a prompt means scrolling
through JavaScript, and the prompt text competes for attention with validation and
data-mapping code. We want the prompts isolated so they can be read and maintained on their own.

## Scope

**In scope:** the two LLM `SYSTEM_PROMPT` blocks returned by each mapper's `buildSystemPrompt()`.

**Out of scope:** user-facing prompt scaffolding (textarea placeholders, prefill prefixes). These
already live in the i18n lang files (`COC7QOL.AIGenerator.*.Placeholder`,
`COC7QOL.AIGenerator.*.PrefillPrefix`) and stay there to remain translatable.

## Approach

Store each system prompt as a standalone Markdown file and load it at runtime via `fetch`.
Markdown is the most reviewer-friendly format, and the prompt text already reads as structured
prose with bullet lists.

### New structure

```
scripts/ai-generator/prompts/
├── loader.js                 # loadPrompt(name) → Promise<string>, cached
├── weapon-system-prompt.md   # verbatim current weapon SYSTEM_PROMPT text
└── npc-system-prompt.md      # verbatim current npc SYSTEM_PROMPT text
```

These ship with no packaging change: the release zip already includes `scripts/` recursively
(see `CLAUDE.md` → Releasing → Zip contents), so `.md` files under it are bundled automatically.
No edits to `module.json` or `.github/workflows/release.yml`.

### The loader

```js
// scripts/ai-generator/prompts/loader.js
const cache = new Map()
const MODULE_ID = 'coc7-qol'

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

- **Cached by name** — regenerate and repeated generations fetch the file at most once per session.
- **Fails loud** — a missing or unreadable file throws. The error propagates through the existing
  `_run` try/catch in `dialog-injector.js`, which already calls `ui.notifications.error`.
- **Path resolution** uses `foundry.utils.getRoute(...)` (confirmed present in the v13 source,
  `common/utils/helpers.mjs`), which honours any server route prefix.

### Touch points

Three small edits, plus the new files:

1. **`mappers/weapon.js`** — remove the `SYSTEM_PROMPT` const; `buildSystemPrompt()` becomes
   `async` and returns `loadPrompt('weapon-system-prompt')`. Import the loader.
2. **`mappers/npc.js`** — same change. The unrelated `CHARACTERISTIC_FORMULAS` export and
   `applyRandomCharacteristics()` are untouched.
3. **`dialog-injector.js`** — line ~278 becomes `const systemPrompt = await mapper.buildSystemPrompt()`.
   It is already inside the `async _run(...)` function, so awaiting is safe.

The mapper interface keeps `buildSystemPrompt()`; only its return type changes from `string` to
`Promise<string>`. This was chosen over exposing a raw `promptFile` name and loading from the
injector, so the "how is the prompt produced" detail stays encapsulated in the mapper.

### Behaviour preservation

The `.md` files contain the current prompt text **verbatim** — no rewording, reformatting, or
reordering. The string sent to each provider's `generate(systemPrompt, userPrompt)` is
byte-identical to today's. LLM output behaviour is unchanged.

## Data flow

```
dialog _run() ──await mapper.buildSystemPrompt()──▶ loadPrompt(name)
                                                       │
                                          cache hit ◀──┤
                                                       ▼ (miss)
                                          fetch(getRoute(.md)) ─▶ text ─▶ cache.set ─▶ return
```

`buildSystemPrompt()` is the only signature that changes (sync → async). Both call sites already
`await` downstream, so the change is fully contained.

## Error handling

| Failure | Behaviour |
|---|---|
| `.md` file missing / 404 | `loadPrompt` throws; `_run` catch shows a user error notification and re-enables the Generate button |
| `fetch` network error | same path — thrown error surfaces via existing catch |
| Empty `.md` file | returns empty string; treated as a normal (if useless) prompt — acceptable, caught in review of the file content, not a runtime concern |

## Testing

No automated tests exist (per `CLAUDE.md`). Verify manually in a running FoundryVTT instance via
the Playwright MCP server:

1. Trigger **weapon** generation — confirm a network request fetches `weapon-system-prompt.md`,
   and a valid weapon is produced.
2. Trigger **NPC** generation — confirm `npc-system-prompt.md` is fetched and a valid NPC is produced.
3. **Cache check** — a second generation of the same type issues no second `.md` fetch.
4. **Error path** — temporarily point the loader at a non-existent file (or rename the `.md`) and
   confirm a clean error notification appears rather than a silent failure.

## Out of scope / non-goals

- Translating system prompts (they contain explicit language rules instructing the LLM to match
  the user's prompt language; the prompt scaffolding stays in i18n).
- Changing prompt content or provider request shapes.
- Adding new document-type mappers.
