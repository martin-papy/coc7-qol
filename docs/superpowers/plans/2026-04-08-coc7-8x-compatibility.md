# CoC7 8.x Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `coc7-qol` to work with CoC7 system 8.x, which migrated item sheets from ApplicationV1 to ApplicationV2.

**Architecture:** Replace the `renderItemSheet` (AppV1) hook with `renderItemSheetV2` (AppV2), update the hook signature, add an `instanceof` guard against unintended sheet types, and switch the intercepted image attribute from `data-edit` to `data-action`. Bump `module.json` to version 0.2.0 and declare CoC7 ≥ 8.1.

**Tech Stack:** Vanilla ES module, FoundryVTT v13 ApplicationV2 API, no build step.

---

### Task 1: Update the item-image-popout hook for AppV2

**Files:**
- Modify: `scripts/item-image-popout.js`

> Note: This project has no automated test runner. Verification is manual in a live FoundryVTT instance — see the manual test checklist at the end of each task.

- [ ] **Step 1: Replace the entire contents of `scripts/item-image-popout.js`**

The changes in one diff:
- Hook: `renderItemSheet` → `renderItemSheetV2`
- Signature: `(sheet, html, data)` → `(application, element, context, options)`
- Guard: add `instanceof foundry.applications.sheets.ItemSheetV2` check
- Selector: `img[data-edit="img"]` → `img[data-action="editImage"]`
- Attribute removal: `img.removeAttribute('data-edit')` → `img.removeAttribute('data-action')`
- Variable rename: `html` → `element` to match the new signature

New file contents:

```js
Hooks.on('renderItemSheetV2', (application, element, context, options) => {
  if (!(application instanceof foundry.applications.sheets.ItemSheetV2)) return;
  if (game.user.isGM) return;

  const img = element.querySelector('img[data-action="editImage"]');
  if (!img) return;

  // Remove data-action so AppV2's root action dispatcher doesn't intercept clicks
  img.removeAttribute('data-action');
  img.style.cursor = 'pointer';

  img.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    new foundry.applications.apps.ImagePopout({
      src: img.getAttribute('src'),
      window: { title: application.document.name }
    }).render(true);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/item-image-popout.js
git commit -m "fix: update item image popout hook for CoC7 8.x AppV2 sheets"
```

---

### Task 2: Update module.json for version 0.2.0 and CoC7 8.1

**Files:**
- Modify: `module.json`

- [ ] **Step 1: Update `module.json`**

Apply these four changes:

1. `"version": "0.1.0"` → `"version": "0.2.0"`
2. CoC7 system `"minimum": "7.24"` → `"minimum": "8.1"`
3. CoC7 system `"verified": "7.24"` → `"verified": "8.1"`
4. `"download"` URL: change `v0.1.0` → `v0.2.0`

Final `module.json`:

```json
{
  "id": "coc7-qol",
  "title": "CoC7 QoL Improvements",
  "description": "Quality of life improvements for the Call of Cthulhu 7th Edition system. Adds image popout on item sheets for players.",
  "version": "0.2.0",
  "authors": [
    {
      "name": "Martin Papy"
    }
  ],
  "compatibility": {
    "minimum": "13",
    "verified": "13"
  },
  "relationships": {
    "systems": [
      {
        "id": "CoC7",
        "type": "system",
        "compatibility": {
          "minimum": "8.1",
          "verified": "8.1"
        }
      }
    ]
  },
  "url": "https://github.com/martin-papy/coc7-qol",
  "manifest": "https://github.com/martin-papy/coc7-qol/releases/latest/download/module.json",
  "download": "https://github.com/martin-papy/coc7-qol/releases/download/v0.2.0/coc7-qol.zip",
  "esmodules": [
    "scripts/item-image-popout.js"
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add module.json
git commit -m "chore: bump to v0.2.0, target CoC7 8.1+"
```

---

### Task 3: Manual verification and release

**Files:** No code changes — verification and release steps only.

- [ ] **Step 1: Load the module in FoundryVTT v13 with CoC7 8.1**

Enable the `coc7-qol` module in a world running CoC7 8.1. Open the browser console (F12) to watch for errors.

- [ ] **Step 2: Test as a player (non-GM)**

Log in as a non-GM user who has Observer or Limited permission on at least one item. Open that item's sheet. Click the item image.

Expected: `ImagePopout` opens showing the item image. No JS errors in the console.

- [ ] **Step 3: Test as GM**

Log in as GM. Open any item sheet. Click the item image.

Expected: The normal file picker dialog opens (GM behaviour is unchanged). No JS errors in the console.

- [ ] **Step 4: Test with multiple item types**

Repeat the player test with at least two different item types (e.g. a `weapon` and a `skill`) to confirm the hook fires for all sheet subclasses, not just `CoC7ModelsItemItemSheetV2`.

Expected: Popout opens for both item types.

- [ ] **Step 5: Create the GitHub release**

```bash
zip -r /tmp/coc7-qol.zip module.json scripts/
gh release create v0.2.0 --title "v0.2.0" --notes "Fix compatibility with CoC7 8.1 (AppV2 item sheets)" /tmp/coc7-qol.zip module.json
```

Expected output: GitHub prints the URL of the new release.
