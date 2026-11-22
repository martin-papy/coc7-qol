# 📝 Export to Markdown

> Save an investigator's sheet as a note for your Obsidian vault.

An investigator's sheet has an **Export to Markdown** entry in its header menu (the **⋮** in the sheet's title bar). Clicking it downloads a `.md` file named after the investigator.

## What is in the note

- **Properties** at the top: occupation, age, sex, residence, birthplace, archetype, organization and player, then HP, MP and Sanity with their maximums, Luck, a `coc7/investigator` tag and the export date. The keys are in English whatever language Foundry uses, so a Bases or Dataview query works in every language.
- **Characteristics** in a table, with HP, MP, SAN, Luck, MOV, damage bonus, build and armor on the line below.
- **Skills** in a table, sorted by name, with the regular, hard and extreme values.
- **Weapons** in a table: skill and its value, damage, range, attacks, ammo and malfunction.
- **Possessions** by name (items, books, spells, talents, armor, statuses), then the wealth the sheet shows, the assets details and the possessions notes.
- **Background**: the single backstory or the titled biography sections, whichever the sheet shows (CoC7's one-block backstory setting decides).
- **Encounters**: each sanity loss event with its loss, or "immune".

Values are the ones the sheet shows: skill values after active effects, the occupation and archetype items' names, and the formatted wealth. A section with nothing in it is left out. Headings follow Foundry's language.

Rich text is converted to Markdown. A document link becomes its label. Without a label, a `@UUID` link becomes the linked document's name, and another document link (`@Actor[…]`, `@Compendium[…]`) is left out. An inline roll becomes its label or formula. So nothing turns into an unresolved Obsidian link. Tables and line breaks are kept, headings are moved down below the note's own, and links stay links only for web and email addresses. An image stays only when it comes from a web address; one stored in Foundry is replaced by its description. Formatting Markdown has no equivalent for is reduced to its text.

## Who sees it

- **The investigator's owners**: the player for their investigator, and the Keeper for every investigator.
- **Keeper notes** are written at the end, in a folded callout, only when the Keeper exports. In a player's export they are left out entirely, heading included.
- **Secret blocks** in the backstory or biography are kept only for the Keeper, unless the Keeper has revealed them.

## Limits

- Investigators only: NPC, Creature, vehicle and container sheets have no entry.
- No portrait, no item descriptions, no Development or Effects tab.
- The note is a snapshot. It is not kept in sync with the sheet and cannot be imported back into Foundry.

There is no setting: the entry only adds a way to read the sheet.
