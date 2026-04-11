---
title: AI Generator — Design Spec
date: 2026-04-11
status: approved
scope: v1 — weapon generation only
---

# AI Generator for CoC7 QoL

## 1. Purpose

Enable GMs to generate fully-formed CoC7 weapon items from a natural-language prompt, directly inside Foundry VTT. The flow is: prompt → LLM call → lightweight preview → `Item.create()`.

The internal architecture is designed as an extensible registry so future document types (actors, journals, etc.) can be added without rewiring the provider or UI layers.

---

## 2. Scope

**v1 includes:**
- Weapon item generation only
- Three LLM providers: Anthropic, OpenAI, Gemini
- In-place transformation of the native "Create Item" dialog
- Lightweight confirmation dialog (name + key stats)
- Module settings: provider selector + API key / endpoint / model

**Excluded from v1:**
- Actor, journal, scene, or other document type generation
- AI image generation
- Prompt history or templates
- Per-provider key storage (single active provider at a time)

---

## 3. File Structure

Only `scripts/ai-generator/index.js` is added to `module.json`'s `esmodules` array. All other files are imported from there.

```
scripts/
  ai-generator/
    index.js              ← registers hooks + settings; sole esmodules entry
    settings.js           ← game.settings.register() calls
    dialog-injector.js    ← renderDialog hook + in-place DOM transformation
    generation-dialog.js  ← ApplicationV2 confirmation dialog
    providers/
      registry.js         ← { register, get } — extensible provider registry
      anthropic.js        ← Anthropic Claude API
      openai.js           ← OpenAI API
      gemini.js           ← Google Gemini API
    mappers/
      registry.js         ← { register, get } — extensible mapper registry
      weapon.js           ← LLM JSON → CoC7 weapon schema
```

---

## 4. LLM Provider Layer

### Interface

Each provider implements a single async method:

```js
async generate(systemPrompt, userPrompt) → object  // parsed JSON
```

Providers use `fetch()` directly from the browser. API key, endpoint, and model are read from module settings at call time — never cached in module state.

### Registry

```js
// providers/registry.js
const _providers = {}
export function register(id, providerClass) { _providers[id] = providerClass }
export function get(id) { return _providers[id] }
```

### Provider Defaults

| Provider | Default endpoint | Default model |
|---|---|---|
| Anthropic | `https://api.anthropic.com/v1/messages` | `claude-sonnet-4-6` |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `gemini-2.0-flash` |

For Gemini, `{model}` in the endpoint is interpolated from the model setting at call time.

### Structured Output

- **OpenAI**: `response_format: { type: "json_object" }`
- **Gemini**: `responseMimeType: "application/json"`
- **Anthropic**: system prompt instruction + JSON.parse on the response text

---

## 5. Module Settings

4 settings total, all `scope: "world"`, GM-only.

| Setting key | Type | Label | Default |
|---|---|---|---|
| `ai-provider` | String (select) | LLM Provider | `"anthropic"` |
| `ai-api-key` | String (password) | API Key | `""` |
| `ai-endpoint` | String | Endpoint URL | `"https://api.anthropic.com/v1/messages"` |
| `ai-model` | String | Model | `"claude-sonnet-4-6"` |

When `ai-provider` changes, `ai-endpoint` and `ai-model` are auto-updated to the new provider's defaults via `onChange`. The GM only needs to update their API key when switching providers.

Single active provider at a time. Switching providers requires re-entering the API key for the new provider — acceptable for v1.

---

## 6. Weapon Spec Mapper

### Registry

```js
// mappers/registry.js
const _mappers = {}
export function register(type, mapper) { _mappers[type] = mapper }
export function get(type) { return _mappers[type] }
```

In v1, only `"weapon"` is registered. Adding new types in future versions is a single `register()` call.

### LLM JSON Schema

The system prompt instructs the LLM to return only a JSON object with this shape:

```json
{
  "name": "string",
  "description": "string",
  "skill": "string (e.g. 'Firearms (Handgun)')",
  "damage": "string (dice expression, e.g. '1d8+1')",
  "range": "string (e.g. '15m')",
  "usesPerRound": "string (e.g. '1')",
  "bullets": "number or null",
  "malfunction": "number or null",
  "properties": {
    "rngd": "boolean",
    "impl": "boolean",
    "addb": "boolean",
    "ahdb": "boolean"
  }
}
```

### Validation & Mapping

Required fields: `name`, `damage`, `skill`. If any are missing, an error is shown in the dialog with a Retry option — item creation is blocked.

Optional fields default to CoC7 schema defaults if absent. The mapper outputs a complete `{ name, type: "weapon", system: { ... } }` object ready for `Item.create()`.

---

## 7. Dialog Flow

### Step 1 — Injection

`Hooks.on('renderDialog', ...)` fires on every dialog open. We detect the "Create Item" dialog by checking for `[name="type"]` and `[name="name"]` inputs. We inject a sparkle SVG icon button next to the "Create Item" button.

### Step 2 — In-place Transformation

GM clicks the sparkle button. We:
1. Capture any existing name value from the input
2. Replace the Name + Type fields with a `<textarea>`, pre-filled with the captured name as a starting hint
3. Replace "Create Item" with a "Generate" button
4. Hide the sparkle button

### Step 3 — Generation

GM enters their prompt and clicks Generate. A loading spinner replaces the button. We call:

```js
providers.get(selectedProvider).generate(systemPrompt, userPrompt)
```

On failure (network error, unparseable JSON, missing required fields): an error message appears inline with a Retry option.

### Step 4 — Confirmation Dialog

On success, a new `ApplicationV2` dialog opens showing:

- Editable **Name** field
- Read-only stats: Damage · Skill · Range · Uses/round · Bullets · Malfunction
- Short description excerpt (read-only)
- Three buttons: **Accept** · **Regenerate** · **Cancel**

### Step 5 — Accept

Calls `Item.create(mappedData)`. On success, opens the created item's sheet and closes both dialogs.

### Step 6 — Regenerate

Closes the confirmation dialog. Returns to the transformed "Create Item" dialog with the textarea still populated, ready for another generate attempt.

### Step 7 — Cancel

Closes the confirmation dialog. Restores the "Create Item" dialog to its original Name + Type form.

---

## 8. Error Handling

| Error condition | Behaviour |
|---|---|
| No API key configured | Show message in dialog before calling LLM: "No API key set — configure in module settings." |
| Network / HTTP error | Inline error in dialog with Retry button |
| LLM returns unparseable JSON | Inline error with Retry button |
| Required fields missing from LLM output | Inline error with Retry button |
| `Item.create()` fails | `ui.notifications.error(...)` toast |

---

## 9. Architectural Extension Points

When adding a new document type (e.g. actor generation in v2):

1. Add `mappers/actor.js` implementing the mapper interface
2. Call `mappers.register("actor", ActorMapper)` in `index.js`
3. Add a new render hook in `dialog-injector.js` targeting the "Create Actor" dialog
4. No changes to the provider layer, settings, or confirmation dialog

When adding a new LLM provider:

1. Add `providers/myprovider.js` implementing `generate(systemPrompt, userPrompt)`
2. Call `providers.register("myprovider", MyProvider)` in `index.js`
3. Add `"myprovider"` to the provider select choices in `settings.js`
4. No changes to the mapper layer or dialog layer

---

## 10. Out of Scope / Future

- Per-provider API key storage (v2 — once multi-provider switching is common)
- Actor / NPC generation (v2)
- AI image generation for items (v3)
- Prompt history and templates (v5)
