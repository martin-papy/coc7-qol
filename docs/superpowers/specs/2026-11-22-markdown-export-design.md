# Export an Investigator to Markdown — Design Spec

## Problem

Martin runs his campaign notes in an Obsidian vault. An investigator's sheet lives only in Foundry, so its content cannot be linked, searched or listed next to the rest of the campaign. He wants to export a sheet as a note he can drop into the vault.

## Goals

- From an investigator's sheet, one action downloads a `.md` file holding the sheet's content.
- The file is a good Obsidian note as it is: properties on top for Bases / Dataview, clear headings, tables that render, no stray Foundry syntax.
- Keeper-only content is in the file only when the person exporting is a GM.

## Non-goals

- NPC, creature, vehicle and container sheets. Investigators only (Martin, 2026-11-22). NPCs are the likely next step.
- Importing a note back into Foundry, or keeping a note in sync. The file is a snapshot.
- A user-editable template for the note's layout.
- The portrait. The image lives in Foundry's data folder, not in the vault.
- The Development tab and the Active Effects tab.
- Item descriptions. Possessions are listed by name.
- A setting to turn the feature off. A menu entry is unobtrusive.

## Anti-goals

- Leaking Keeper content into a player's export, including by an empty "Keeper notes" heading that reveals the section exists.
- Changing actor or item data. The export only reads.
- Foundry syntax that Obsidian misreads: an inline roll `[[/roll 1d6]]` left as is becomes a link to a note called "/roll 1d6".
- A file that breaks on ordinary input: a `|` in a skill name breaking a table, a `:` or `#` in an occupation breaking the properties block.

## Approaches considered

1. **Read the actor's data, build the note from it — chosen (Martin, 2026-11-22).** One piece reads the actor into a plain object, a second turns that object into Markdown. The second never touches Foundry, so it is unit tested. Works the same on every investigator sheet variant. Cost: it reads CoC7's data model directly, so paths must hold on CoC7 8.16 and 9.x.
2. **Convert the sheet's rendered HTML.** Shows exactly what the exporter sees, but the sheet is made of form fields, the markup differs per variant and per CoC7 version, and only rendered tabs are there. Dropped.
3. **Option 1 plus an editable template file.** Lets the layout be reshaped per vault. Real extra work, and tables are awkward in templates. Not now; the plain object in option 1 is what a template would consume later.

Rich text (backstory, biography sections, Keeper notes) is stored as HTML. Foundry ships `showdown` and uses its `makeMarkdown()` for its own Markdown journal pages (v13 and v14: `client/applications/sheets/journal/journal-entry-page-text-sheet.mjs`). The export uses the same converter, so no library is vendored and no converter is hand-written.

## Behaviour

### The entry point

- An **Export to Markdown** entry in the sheet's header menu (the "⋮" in the title bar), added through the `getHeaderControlsActorSheetV2` hook. Chosen over a visible icon in the sheet body: one hook, no CSS, same place on every sheet variant.
- Shown when the actor's type is `character` and the user owns the actor (a GM owns everything). Not shown on any other actor type.
- Clicking it downloads the file through `foundry.utils.saveDataToFile` with type `text/markdown`.
- If building the note fails, the user gets a localized error notification and the error is logged with `LOG_PREFIX`. No file is downloaded.

### File name

The actor's name plus `.md`, with the characters that are illegal in file names or break Obsidian links (`\ / : * ? " < > | # ^ [ ]`) removed, and whitespace trimmed. If nothing is left, `investigator.md`.

### The note

Sections appear in this order. A section with no content is left out entirely, heading included.

```markdown
---
type: "investigator"
occupation: "Journalist"
age: "42"
sex: "Male"
residence: "Arkham"
birthplace: "Boston"
player: "Martin"
hp: 11
hp_max: 11
mp: 9
mp_max: 9
san: 45
san_max: 99
luck: 50
tags:
  - coc7/investigator
exported: 2026-11-22
---
# Harvey Walters

## Characteristics

| STR | CON | SIZ | DEX | APP | INT | POW | EDU |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 40 | 55 | 60 | 50 | 65 | 80 | 45 | 85 |

**HP** 11/11 · **MP** 9/9 · **SAN** 45/99 · **Luck** 50 · **MOV** 8 · **DB** 0 · **Build** 0

## Skills

| Skill | Regular | Hard | Extreme |
| --- | --- | --- | --- |
| Accounting | 5 | 2 | 1 |
| Art/Craft (Photography) | 45 | 22 | 9 |

## Weapons

| Weapon | Skill | Damage | Range | Attacks | Ammo | Malfunction |
| --- | --- | --- | --- | --- | --- | --- |
| .38 Revolver | Handgun 40% | 1D10 | 15 | 1 (3) | 6 | 100 |

## Possessions

### Items

- Camera
- Notebook

### Books

### Spells

### Talents

### Armor

### Statuses

### Wealth

- **Spending level:** $10
- **Cash:** $150
- **Assets:** $3750

Assets details, then the possessions notes, as paragraphs.

## Background

### Personal Description

Text of the biography section.

## Encounters

- Ghoul (3)
- Deep One (immune)

> [!danger]- Keeper notes
> Only in a GM's export.
```

**Properties**

- Keys are fixed English identifiers in every language, so a Bases or Dataview query keeps working whatever language Foundry runs in.
- `type` and the `coc7/investigator` tag are always present. `exported` is the local date, `YYYY-MM-DD`.
- From `system.infos`: `occupation`, `age`, `sex`, `residence`, `birthplace`, `archetype`, `organization`, `player` (from `playername`). A blank value drops the key.
- Three of these print what the sheet displays, which is not always the stored string (`character-sheet-v2.js`, same at 8.16):
  - `occupation` and `archetype`: when the actor holds an occupation or archetype item, the item's name (`actor.occupation?.name`, `actor.archetype?.name`); the stored string otherwise.
  - `player`: when the field is blank and CoC7's `displayPlayerNameOnSheet` setting is on, the owning user's name.
- From `system.attribs`: `hp`, `hp_max`, `mp`, `mp_max`, `san`, `san_max`, and `luck` (stored as `attribs.lck.value`), as numbers. A null value drops the key.
- String values are always written double-quoted with `"` and `\` escaped, so no input can break the block or be read as another YAML type.

**Body**

- Headings and labels are in Foundry's current language. Reuse CoC7's own keys where they exist (`CoC7.Skills`, `CoC7.Weapons`, `CHARAC.STR` and so on); add `COC7QOL.MarkdownExport.*` keys in `lang/en.json` and `lang/fr.json` for the rest.
- Characteristics: the eight values in the order above. The line under the table adds MOV, DB and Build; Armor is added when it has a value.
- Skills: every skill item the actor has, sorted by name with the locale's collation. Regular is `system.value` (the value after active effects, as the sheet shows it), Hard is `floor(value / 2)`, Extreme is `floor(value / 5)`.
- Weapons: one row per weapon item. The Skill column shows the weapon's main skill (`weapon.system.skillMain`, present at 8.16 and 9.2) as name and current value. The investigator's Combat tab does not print this; the NPC sheet does, and it is what a reader of the note needs.
- Possessions: items, books, spells, talents, armor and statuses, by name, each group under its own heading. The possessions notes come from `system.notes`.
- Wealth: the values the sheet shows. Unless `system.flags.manualCredit` is on, those are computed and currency-formatted by `system.formattedMonetaryValue('spending' | 'cash' | 'assets')` (present at 8.16 and 9.2); the stored `system.monetary` strings are blank in that default case. With `manualCredit` on, the stored strings.
- Background: CoC7 has a world setting `oneBlockBackstory`. When it is on, the sheet shows the single `system.backstory`; when off, the titled `system.biography` sections. Both are rich text (the default v3 sheet edits biography sections with a rich-text editor), so both go through the rich text clean-up and the converter below. A biography value written on the older v2 sheet is plain text with raw line breaks; its line breaks must survive as paragraphs. The export follows the setting, so it never prints text the sheet hides.
- Encounters: `system.sanityLossEvents`, each as its type and total loss, as the Background tab lists them. An entry flagged `immunity` prints a localized "immune" in place of the loss.
- Table cells have `|` escaped and line breaks turned into spaces.

**Keeper content**

- Keeper notes (`system.description.keeper`) go at the end in a folded `[!danger]` callout, only when `game.user.isGM`. For anyone else, the callout is not written at all.
- Secret blocks inside rich text (`<section class="secret">`) are kept for a GM and removed for anyone else. A block the Keeper has revealed (`class="secret revealed"`) is public in Foundry and is kept for everyone.

**Rich text clean-up**, applied to the backstory, every biography section and the Keeper notes before conversion to Markdown:

- A document link `@UUID[...]{Label}` becomes `Label`. Without a label, the document's name when it can be resolved synchronously, otherwise nothing.
- An inline roll (`[[/roll 1d6]]`, `[[1d6]]`, with or without a `{label}`) becomes its label, or its formula when it has none.
- Any `[[` left in the result is escaped so Obsidian does not read it as a link.

## Constraints

- No build step: plain ES modules, declared in `module.json` `esmodules`.
- Foundry v13 and v14. CoC7 8.16 to 9.2. Checked on 2026-11-22 by diffing tags `8.16` and `9.2` of the CoC7 checkout: `models/actor/character-system.js` and `global-system.js` are the same apart from a comment, the `oneBlockBackstory` setting exists in both, and the weapon model differs only in `price` and in labels this export does not read. Books, spells, talents and statuses are read by name only.
- Follow the module's testing rule: everything except the hook, the download and the reads of `game`, `ui` and `window.showdown` lives in modules that touch no Foundry global at import time, with a test file in `test/`. The converter, the label lookup and today's date are passed in as arguments.
- New CSS classes or IDs, if any turn out to be needed, carry the `coc7qol-` prefix.
- `test/lang-parity.test.js` and `test/manifest.test.js` must still pass.

## Left to the builder

- File and function layout under `scripts/markdown-export/`.
- How tests get a converter: a stub, or `showdown` as a dev dependency.
- `makeMarkdown()` output needs tidying (it emits `<!-- -->` separators and runs of blank lines). Check the result against a real backstory in a running Foundry and tidy what shows up.
- The header menu icon (a Font Awesome export or Markdown icon) and exact label wording, English and French.
- Whether a header-control entry needs a re-render to appear on sheets already open, and the exact hook signature on v13 and v14. Verify in the running instance.
- README section and CHANGELOG entry, in the style of the existing ones.

## Calls made by Claude, not by Martin

Martin decided: the Obsidian purpose, the GM-only rule for Keeper content, investigators only, and approach 1. The rest below is Claude's and open to correction.

- The entry sits in the header menu and shows for owners and the GM.
- Vitals (HP, MP, SAN, Luck) are also written as properties, so a Bases table can show the whole party.
- Property keys stay in English; headings follow Foundry's language.
- Unrevealed secret blocks in rich text are GM-only, although CoC7's sheet shows them to an owner. Stricter than the sheet, in the direction of Martin's rule. Revealed ones are kept for everyone, as Foundry itself treats them.
- The Weapons table has a Skill column, which the investigator's own Combat tab does not show.
- Occupation, archetype, player and wealth print what the sheet displays, not the raw stored fields.
- Document links become plain text, not `[[wikilinks]]`. Wikilinks would create unresolved links for every item or compendium entry mentioned; they can be revisited once the vault's naming is known.
- Possessions are names only, with no descriptions, which also keeps unread book contents out.
- The background follows the `oneBlockBackstory` setting instead of exporting both forms.
- No setting to disable the feature and no success notification: the browser's download is the feedback.
