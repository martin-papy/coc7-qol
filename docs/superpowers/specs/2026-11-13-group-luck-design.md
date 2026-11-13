# Group Luck Roll Request — Design Spec

Issue: [#28](https://github.com/martin-papy/coc7-qol/issues/28) · Upstream request: [CoC7 #1984](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/1984)

## Problem

A Keeper often asks for a **Group Luck** roll: the investigator with the lowest Luck among those present in the scene rolls for everyone. Today the players compare sheets to work out who that is, which breaks the pace of a tense scene. CoC7 has no Group Luck feature (Know and Idea rolls from the same upstream request are now in the system and are out of scope).

## Goals

- From the Keeper's toolbar, find who rolls and send that player a clickable Luck roll request in two clicks.
- The Keeper decides who is present: split parties, offline players and spare investigators are handled in one place.
- The request says who rolls and why.
- The roll itself is the system's own Luck roll.

## Non-goals

- Know and Idea rolls (now in CoC7).
- Detecting who is present from tokens or scenes. Theatre-of-mind tables have no tokens, so the Keeper ticks who is present.
- A module setting. The feature is a toolbar button and costs nothing when unused.

## Anti-goals

- Sending the request to the wrong investigator's player, or to nobody.
- New roll logic. The module never computes a roll or a result.

## Approaches considered

1. **CoC7's whisper method as is** (`CoC7Link.toWhisperMessage`). Least code, but the wording is fixed to "Your keeper has requested {name} make a {check} roll", with no room for the reason or the Luck value.
2. **Our own whispered message carrying a CoC7 link — chosen.** The module writes the message and embeds the documented link text `@coc7.check[subtype:attribute,name:lck]`; CoC7's enricher turns it into the clickable link. We control the wording, and we depend only on the link syntax Keepers type into journals (identical in CoC7 8.16 and 9.1).
3. **Our own message with our own button** calling `actor.attributeCheck('lck')`. Always rolls for the exact investigator, but needs a chat render hook and button handling, and bypasses the link mechanism the issue asks to reuse.

Option 2 was picked: it gives the "names who rolls and why" message for a few lines more than option 1, without the moving parts of option 3.

A second choice was made earlier: a **confirm dialog** rather than an instant post, because Group Luck applies to the investigators present in the scene and Foundry cannot know who that is. This costs a second click against the issue's "one click" criterion.

## Behaviour

### Toolbar

A **Group Luck** button in the Keeper's tools (`coc7menu`), after Close All Cards. The menu is already Keeper-only.

If the world has no investigator owned by a player, the click shows a notification and opens nothing.

### Who is listed

Every actor of type `character` that has at least one non-GM owner and a numeric Luck (`system.attribs.lck.value`).

### Who is ticked by default

For each connected player:

- if the player has an assigned character that is in the list, that investigator is ticked;
- otherwise every listed investigator the player owns is ticked.

Everything else starts unticked: investigators of offline players, and spare, retired or dead investigators that a connected player still owns. *(My call: without the assigned-character rule, a dead investigator with low Luck would be picked.)*

### Dialog

```
┌ Group Luck ─────────────────────────────────────┐
│ Tick the investigators present in the scene.    │
│                                                 │
│ [x] Harvey Walters                 35   🎲 rolls │
│ [x] Ada Marsh                      50           │
│ [x] Thomas Kimball                 65           │
│ ─ Others ────────────────────────────────────── │
│ [ ] Edith Crane        offline     30           │
│ [ ] Old Pete                       20           │
│                                                 │
│ [ Request Luck roll from Harvey Walters ] [Cancel] │
└─────────────────────────────────────────────────┘
```

- Two groups: investigators ticked by default, then the others. Each group is sorted by Luck, lowest first, then by name. The order does not change when boxes are ticked.
- A row whose owners are all offline carries an *offline* tag.
- The lowest Luck among the ticked rows is marked as the roller. The marker and the button label update as boxes are ticked.
- **Tie:** when several ticked rows share the lowest Luck, each shows a radio button and the Keeper picks who rolls. The first one listed is preselected. *(My call: the odds are identical, so a pick is enough; sending to everyone tied risks two rolls.)*

  ```
  │ [x] (•) Ada Marsh                35   tied    │
  │ [x] ( ) Harvey Walters           35   tied    │
  ```

- With nothing ticked, the button is disabled.

### Sending the request

Pressing the button closes the dialog and posts one chat message:

- **Whispered** to the roller's non-GM owners, as CoC7's own targeted requests are. The Keeper sees it as its author. The rest of the table sees the roll card that follows. *(My call: a public link could be clicked by any player, who would then roll their own Luck.)*
- **Speaker:** the Keeper's user name, as CoC7's requests do.
- **Content:** "**Group Luck** — Harvey Walters has the lowest Luck (35) of the 4 investigators present and rolls for the group." followed by the link `@coc7.check[subtype:attribute,name:lck]`.
- The sentence is written in the Keeper's language, like the system's own requests. The link has no label, so each player's client renders it in their own language ("Luck check").
- With a single investigator ticked, the sentence drops the comparison: "Harvey Walters rolls Luck for the group."
- The investigator's name is escaped before it goes into the message.

The player clicks the link and gets CoC7's usual roll dialog (Shift skips it), exactly as for any requested roll. A player who owns several investigators gets the system's actor picker, with their assigned character preselected.

### Roller with no connected player

If none of the roller's owners is connected, a whisper would reach nobody. The button then reads **Roll Luck for {name}** and rolls that investigator's Luck on the Keeper's side at once, through the system's entry point for module-triggered rolls (`actor.runRoll({ attribute: 'lck', fastForward: true })`); no request message is posted. *(My call: this is what makes "include an offline player" usable.)*

Revised after review of PR #38. The first version called `actor.attributeCheck('lck')`, which opens the roll dialog and then, with CoC7's *Standby Keeper rolls* setting on (the default), posts a pending card with a roll button instead of rolling. `runRoll` skips that card. It is called with `fastForward` because `runRoll` throws when its roll dialog is closed without rolling, so the Keeper does not get the difficulty and bonus-dice dialog on this path: the roll uses the world's default difficulty, with no bonus or penalty dice.

## Structure

Feature folder `scripts/group-luck/`, following `spell-cast/` and `rest-targets/`: Foundry access in `index.js`, rules in pure modules covered by `node --test`.

| File | Role |
|---|---|
| `scripts/group-luck/candidates.js` | Pure. Builds the rows and default ticks from plain investigator and player data; resolves the roller and ties from the ticked set. |
| `scripts/group-luck/request.js` | Pure. Builds the message content and the whisper recipient list. |
| `scripts/group-luck/dialog.js` | `ApplicationV2` dialog, in the style of `CloseAllCardsDialog`. |
| `scripts/group-luck/index.js` | `getSceneControlButtons` hook; reads `game.actors` / `game.users`; posts the message or starts the Keeper-side roll. |
| `styles/group-luck.css` | Dialog styles. |
| `test/group-luck.test.js` | Tests for the two pure modules. |

Also touched: `module.json` (script and style), `lang/en.json` and `lang/fr.json`, `README.md`, a new `docs/features/group-luck.md`, `CHANGELOG.md` (Unreleased).

## Error handling

- Posting the message or starting the Keeper-side roll is wrapped in `try/catch`: the error is logged with the `[coc7-qol]` prefix and shown as a notification, as `spell-cast` does.
- An investigator deleted while the dialog is open: the action re-resolves the actor by id and shows a notification if it is gone.

## Verification

- `npm test` for the pure modules: default ticks (assigned character, no assigned character, offline, spare), sorting, roller resolution, ties, single investigator, empty selection, name escaping, whisper recipients.
- Manual check with Playwright against a running Foundry, as Keeper and as a player: toolbar button, dialog states (tie, offline, nothing ticked), the whispered message, the link rolling the right investigator's Luck, and the Keeper-side roll. Both CoC7 9.1 on Foundry v14 and the v13 pairing if available.

## Left to the builder

- Icon for the toolbar button and the roller marker.
- Exact wording of the strings and their French translations.
- Whether the toolbar registration shared with `close-all-cards.js` is worth extracting into a helper.
- Whether to add a README screenshot.
