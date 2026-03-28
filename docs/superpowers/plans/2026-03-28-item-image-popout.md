# Item Image Popout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `coc7-qol` FoundryVTT module that lets non-GM players click item sheet images to view them full-size in an ImagePopout window.

**Architecture:** A minimal FoundryVTT module with a single ES module that registers a `renderItemSheet` hook. The hook finds `img[data-edit="img"]` elements, strips the edit attribute for non-GM users, and attaches a click handler that opens `ImagePopout`. Must support both FoundryVTT v12 (ApplicationV1 + jQuery) and v13 (ApplicationV2 + HTMLElement).

**Tech Stack:** Vanilla JavaScript ES modules, FoundryVTT Hooks API, FoundryVTT ImagePopout class.

---

## File Structure

```
coc7-qol/
├── module.json                  # Module manifest
└── scripts/
    └── item-image-popout.js     # Hook registration and click handler logic
```

- `module.json` — Module identity, compatibility, system restriction, ES module entry point.
- `scripts/item-image-popout.js` — Single file: registers the `renderItemSheet` hook, guards on `!game.user.isGM`, modifies the image element, attaches the popout click handler. Handles v12/v13 API differences.

---

### Task 1: Create module.json manifest

**Files:**
- Create: `module.json`

- [ ] **Step 1: Create `module.json`**

```json
{
  "id": "coc7-qol",
  "title": "CoC7 QoL Improvements",
  "description": "Quality of life improvements for the Call of Cthulhu 7th Edition system. Adds image popout on item sheets for players.",
  "version": "0.1.0",
  "authors": [
    {
      "name": "Martin Papy"
    }
  ],
  "compatibility": {
    "minimum": "12",
    "verified": "13"
  },
  "relationships": {
    "systems": [
      {
        "id": "CoC7",
        "type": "system"
      }
    ]
  },
  "esmodules": [
    "scripts/item-image-popout.js"
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add module.json
git commit -m "feat: add module.json manifest for coc7-qol"
```

---

### Task 2: Create item-image-popout.js

**Files:**
- Create: `scripts/item-image-popout.js`

- [ ] **Step 1: Create `scripts/item-image-popout.js`**

```javascript
Hooks.on('renderItemSheet', (sheet, html, data) => {
  if (game.user.isGM) return;

  // html is jQuery in v12, HTMLElement in v13
  const element = html instanceof jQuery ? html[0] : html;
  const img = element.querySelector('img[data-edit="img"]');
  if (!img) return;

  // Remove data-edit so Foundry's file picker doesn't intercept clicks
  img.removeAttribute('data-edit');
  img.style.cursor = 'pointer';

  img.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const src = img.getAttribute('src');
    const title = sheet.object.name;

    // v13 uses ApplicationV2-style options, v12 uses positional args
    if (foundry.applications?.apps?.ImagePopout) {
      new foundry.applications.apps.ImagePopout({
        src: src,
        window: { title: title }
      }).render(true);
    } else {
      new ImagePopout(src, { title: title }).render(true);
    }
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/item-image-popout.js
git commit -m "feat: add item image popout for non-GM players"
```

---

### Task 3: Manual testing

No automated tests — this is a FoundryVTT UI module that requires a running game server. Manual verification steps:

- [ ] **Step 1: Install module in FoundryVTT**

Symlink or copy the `coc7-qol/` folder into your FoundryVTT modules directory:

```bash
ln -s /Users/martin.papy/Development/coc7-qol "$FOUNDRY_DATA_PATH/Data/modules/coc7-qol"
```

Replace `$FOUNDRY_DATA_PATH` with your actual FoundryVTT user data path.

- [ ] **Step 2: Activate and test as player**

1. Launch FoundryVTT, open a world using the CoC7 system.
2. Go to Settings > Manage Modules > enable "CoC7 QoL Improvements".
3. Log in as a **player** (non-GM).
4. Open any item sheet (weapon, spell, book, skill, generic item, etc.).
5. Click the item image — verify an `ImagePopout` window opens showing the full image.
6. Verify the image is displayed in a draggable, resizable Foundry window.

- [ ] **Step 3: Test as GM**

1. Log in as **GM**.
2. Open any item sheet.
3. Click the item image — verify the **file picker** opens (default behavior, unchanged).

- [ ] **Step 4: Test edge cases**

1. Open an item with the default/placeholder image — verify popout still opens (no crash).
2. Open multiple item sheets and click images — verify each opens its own popout with the correct title.
3. Close and reopen an item sheet — verify the click handler still works (re-render).
