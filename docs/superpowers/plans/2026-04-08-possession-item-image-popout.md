# Possession Item Image Popout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a `div.item-image` in the Gear & Cash (Possession) tab opens a full-size `ImagePopout` for both players and GMs.

**Architecture:** A new self-contained ES module registers a `renderActorSheetV2` hook, guards to character actor sheets only, and attaches click handlers to all `.item-image` divs inside `.inventory`. The hook resolves the item via `fromUuid` (from `data-item-uuid` on the parent `<li>`) to get `img` and `name` for the popout. No GM guard — both roles get the behaviour.

**Tech Stack:** Vanilla JS ES module, FoundryVTT v13 AppV2 hooks, `foundry.applications.apps.ImagePopout`.

---

### Task 1: Create the script

**Files:**
- Create: `scripts/possession-item-image-popout.js`

> No automated tests exist in this project — manual verification steps are provided instead (per project conventions).

- [ ] **Step 1: Create the file with the following content**

```js
Hooks.on('renderActorSheetV2', (application, element) => {
  if (!(application instanceof foundry.applications.sheets.ActorSheetV2)) return;
  if (application.document.type !== 'character') return;

  element.querySelectorAll('.inventory .item-image').forEach((img) => {
    img.style.cursor = 'pointer';

    img.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const li = img.closest('[data-item-uuid]');
      if (!li) return;

      const item = await fromUuid(li.dataset.itemUuid);
      if (!item) return;

      new foundry.applications.apps.ImagePopout({
        src: item.img,
        window: { title: item.name }
      }).render(true);
    });
  });
});
```

- [ ] **Step 2: Verify the file was created correctly**

Confirm `scripts/possession-item-image-popout.js` exists and contains the hook above.

- [ ] **Step 3: Commit**

```bash
git add scripts/possession-item-image-popout.js
git commit -m "feat: add image popout for possession tab item icons"
```

---

### Task 2: Register the script in module.json

**Files:**
- Modify: `module.json`

- [ ] **Step 1: Add the new script to `esmodules`**

In `module.json`, change:

```json
"esmodules": [
  "scripts/item-image-popout.js"
]
```

to:

```json
"esmodules": [
  "scripts/item-image-popout.js",
  "scripts/possession-item-image-popout.js"
]
```

- [ ] **Step 2: Commit**

```bash
git add module.json
git commit -m "chore: register possession-item-image-popout script"
```

---

### Task 3: Manual verification

> Run these checks in a live FoundryVTT instance with CoC7 8.1+ and this module enabled.

- [ ] **Step 1: Verify cursor appears on hover**

Open a character actor sheet → Gear & Cash tab. Hover over the small icon next to any item or weapon. The cursor should change to a pointer.

- [ ] **Step 2: Verify popout opens for a player**

Log in as a player who owns a character with at least one item in the Gear & Cash tab. Click the item icon. An `ImagePopout` should appear showing the item's image with the item name as the title.

- [ ] **Step 3: Verify popout opens for the GM**

As GM, open a character sheet → Gear & Cash tab. Click an item icon. The same `ImagePopout` should appear.

- [ ] **Step 4: Verify the item name label still works**

Click the item name label (e.g. "1 x new item"). The inline summary panel should still expand/collapse as before — the new click handler must not interfere.

- [ ] **Step 5: Verify weapons also work**

Click the small icon next to a weapon (e.g. "Unarmed"). The popout should appear with the weapon's image and name.

- [ ] **Step 6: Verify NPC sheets are unaffected**

Open an NPC actor sheet. The item images there should have no pointer cursor and no click behaviour.
