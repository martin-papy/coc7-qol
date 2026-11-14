# Highlight Strong Skills — Design Spec

Issue: [#29](https://github.com/martin-papy/coc7-qol/issues/29) · Upstream request: [CoC7 #1884](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/1884)

## Problem

With skills sorted by name, nothing on a sheet shows what a character is good at. Sorting by value shows it, but then a given skill is hard to find. Players and Keepers want the name order kept and the strong skills marked.

## Scope change from the issue

Issue #29 also asks for combat skill labels to read skill first, specialization second (CoC7 #1941). That half is **dropped**: on CoC7 9.1's default investigator sheet (v3) the combat lists already print only the skill ("Brawl", "Handgun") under the *Melee skills* / *Ranged skills* headings. Only the optional classic v2 sheet still prints "Fighting (Brawl)". Decided by Martin on 2026-11-13; say so on the pull request that closes the issue.

## Goals

- A skill at or above a threshold stands out on the sheet at a glance, in name order and in value order.
- It reads clearly in both the light and the dark theme, and the skill's text stays as legible as before.
- A Keeper can turn it off, or move the threshold, for the whole table.

## Non-goals

- Reordering or relabelling skills.
- Graded tiers (for example 50 / 75 / 90). One threshold.
- A per-user setting. The issue asked for one; Martin chose world-wide settings instead.
- The investigator sheet's development tab. It has its own green "flagged for development" styling.

## Anti-goals

- Changing actor or item data. This is display only.
- Colour as the only cue, or coloured text that lowers contrast in one of the themes.
- A highlight that goes stale when a skill value or a setting changes while the sheet is open.

## Approaches considered

How the rows get marked:

1. **Render hook adds a class, a stylesheet styles it — chosen.** On every actor sheet render, compare each skill row's value to the threshold and toggle a class on the row. Same shape as the module's other sheet features.
2. **CSS only**, keyed off the `data-value-tooltip` attribute CoC7 already prints. Not possible: CSS cannot compare numbers, and that attribute is missing while the sheet is unlocked.
3. **Graded tiers**, one class per band. More than the issue asks; easy to add later on top of option 1.

How a marked row looks (tried on the real v3 sheet in both themes, 2026-11-13):

- **A. Bold name.** Subtle in the dark theme, close to invisible in the light one.
- **B. Bold name and value in the accent orange.** Clear in the dark theme; orange on parchment is hard to read in the light one and would need a second colour.
- **C. Faint accent tint on the row, a thin accent bar on its left edge, bold name — chosen by Martin.** Clear in both themes; the text keeps its own colour and contrast.

## Behaviour

### What gets highlighted

A skill row is highlighted when the feature is on and the skill's **effective value** (`item.system.value`, the number the sheet shows, active effects included) is greater than or equal to the threshold.

Rows covered, on sheets registered by the CoC7 system:

| Sheet | Rows |
|-------|------|
| Investigator v3 and classic v2 | Skills tab (both sort orders) and the combat tab's melee and ranged skill lists |
| Summarized investigator | The top-skills list (not the icons-only strip) |
| NPC and Creature | The skill list |

In CoC7 9.1 the first and last groups are `.item.skill[data-item-uuid]` elements, which leaves out the development tab (`li.item` without `skill`) and the NPC combat tab's weapon skill labels. The summarized sheet's rows are `.skills-block:not(.icons-only) .item[data-item-uuid]`.

Rows are highlighted whether the sheet is locked or unlocked, for every user who can open the sheet.

### Look

Option C. Values from the trial, as a starting point for the stylesheet:

```css
background: color-mix(in oklab, var(--color-text-accent) 16%, transparent);
box-shadow: inset 3px 0 0 var(--color-text-accent);
/* and on the skill name: */
font-weight: 700;
```

`--color-text-accent` is Foundry's own variable (`#ee9b3a` in both themes on v14). Define the accent and the tint strength once as module custom properties rather than repeating them.

### Settings

Two **world** settings, shown in the module's settings, in the style of the NPC sheet ones:

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| Highlight strong skills | Boolean | on | Off removes every highlight |
| Strong skill threshold | Whole number, 1 to 99 | 50 | A skill at or above it is highlighted |

A change to either one updates every open actor sheet on every connected client at once, without a reload. Labels and hints in English and French, each hint ending with "Applies to everyone in this world." like the existing ones.

## Constraints

- No build step, FoundryVTT v13 and v14, CoC7 8.16 and later. The row selectors above were read from CoC7 9.1; check them against 8.x if an 8.x world is at hand, and degrade to "no highlight" rather than an error where a row or item cannot be resolved.
- Foundry globals stay in the feature's `index.js` and `settings.js`. The rule and the DOM marking live in a module that imports nothing from Foundry and takes the values as arguments, with a `node --test` + jsdom test file, as `scripts/spell-cast/cast-control.js` does.
- Marking must be idempotent: the hook runs on every render, and a row that drops below the threshold loses its class.
- New `module.json` entries (`esmodules`, `styles`) only load after a world relaunch.

## Left to the builder

- File and symbol names. Suggested: `scripts/skill-highlight/{index,settings,highlight}.js`, `styles/skill-highlight.css`, `test/skill-highlight.test.js`.
- Whether the threshold is a slider or a number box.
- Tuning the tint strength and bar width if they clash with the NPC sheet's column layout or the classic v2 sheet; check both themes with Playwright on v3, v2, summarized and NPC sheets.
- README feature entry and a CHANGELOG line under *Unreleased → Added*, in the style of the existing entries.

## Calls made by Claude, not by Martin

- On by default (the issue's default threshold of 50 implies it).
- Threshold range 1 to 99, with the on/off switch replacing the issue's "0 = off".
- Effective value rather than the base value.
- Summarized, NPC and Creature sheets are included; the development tab is not.
