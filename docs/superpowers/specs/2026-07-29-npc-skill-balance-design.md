# NPC Skill Balance — Design

Date: 2026-07-29
Status: implemented on `bugfix-npc-skill-balance`
Scope: `scripts/ai-generator/prompts/npc-system-prompt.md`, `scripts/ai-generator/skill-tiers.js` (new), `scripts/ai-generator/mappers/npc.js`, `scripts/ai-generator/npc-confirmation-dialog.js`, `scripts/ai-generator/dialog-injector.js`, `styles/ai-generator.css`, `lang/en.json`

The bulk of the change is prompt text. The original draft of this spec claimed
code changes would be limited to one validation field, one constant and the
dialog's rendering; that held until Task 5 verification found that no skill value
was reaching the actor intact (see D10), which added the base/excess model and a
new ladder module.

## Problem

AI-generated NPCs come out systematically over-skilled. A beat constable was
generated with Fighting (Brawl) at 60% — Professional tier, the band that
describes someone who earns a living by fighting — alongside nine other skills
clustered between 35% and 65%.

Two distinct defects:

1. **Absolute values too high.** Skills land above the tier the occupation
   implies.
2. **No spread.** Every skill sits in one narrow band, producing a bland
   generalist rather than a character with a defining competence.

### Root causes

All balance guidance lives in one file, `npc-system-prompt.md`. The user prompt
is raw textarea text (`dialog-injector.js:250`), so nothing else contributes.

| # | Cause | Location |
|---|-------|----------|
| 1 | No expertise scale. The prompt says only `Values 1–99 as percentages`. The model has no basis for knowing 60% means "earns a living at this". | prompt line 25 |
| 2 | The only numeric anchors in the whole prompt are high: `a thug with a knife → "Fighting (Brawl)" at 30–60` and `a soldier with a rifle → "Firearms (Rifle/Shotgun)" at 50+`. This is the model's entire calibration reference and it biases upward. | prompt line 53 |
| 3 | No guidance on distribution, so the model defaults to a flat competent band. | prompt line 26 |
| 4 | No mention of CoC7 base values, so the model cannot reason about trained-above-baseline versus untrained — nothing tells it Law starts at 5% and First Aid at 30%. | `npc.js` `_resolveOneSkill` |
| 5 | **The mapper's numbers never survived to the actor.** See D10 — every skill arrived on the sheet inflated by its own base value. Discovered during Task 5 verification, after D6 had been decided on the opposite assumption. | `npc.js` `_resolveOneSkill` |

Cause 4 cuts both ways. Tightening the ceiling without stating the floor makes
the opposite error *more* likely: First Aid at 15% when its base is 30%, which
is not a legal CoC7 value.

## Reference: the rulebook ladder

| Range | Tier | Meaning |
|-------|------|---------|
| 01–05% | Novice | Complete amateur; baseline or theoretical knowledge only |
| 06–19% | Neophyte | Beginner; small amount of knowledge, rare practice |
| 20–49% | Amateur | Hobby-level; rudimentary training or casual talent |
| 50–74% | Professional | Competent enough to earn a living (≈ bachelor's degree) |
| 75–89% | Expert | Advanced expertise (≈ master's or Ph.D.) |
| 90–99% | Master | Elite; among the best in the world |

## Design decisions

The sections below are not in numeric order — D9 and D10 were added during
implementation, next to the decisions they affect. Read them in this order:

| # | Decision | Status |
|---|---|---|
| D1 | Tier is the NPC's peak; only occupation skills may reach it | current |
| D2 | Combat skills are not occupation skills by default | current |
| D3 | Base values are a hard floor, stated in the prompt | current, and made structural by D10 |
| D4 | Fourteen core skills are always present | current |
| D5 | Beyond the core fourteen, list a skill only when trained above base | current |
| D6 | The LLM computes the two derived skills | prompt half current; **mapper half superseded by D10** |
| D7 | `_ensureWeaponSkills` fallback raised from 20 to 25 | current |
| D10 | `personal` holds the trained excess; the base value stands | current — supersedes D6's mapper half |
| D9 | The native language is named concretely, built from the Own template | current, with one corrected detail |
| D8 | Review dialog shows tiers and flags above-tier skills | current, revised after implementation |

Base-derived values do not count toward the declared peak — see the note at the
end of D4.

### D1 — Tier is the NPC's peak, and only occupation skills may reach it

The LLM emits a new required top-level field `expertiseTier`, one of
`novice | neophyte | amateur | professional | expert | master`. It denotes the
band of the NPC's *single best* skill, not an average.

Forcing the model to commit to a band before assigning numbers is itself the
main anchoring mechanism — it has to state "this constable peaks at
Professional" and then generate consistently with that.

Only 2–4 named occupation skills may reach the declared tier. Everything else
falls below the tier and toward base value.

**Precedence.** The base-value floor (D3) always wins over the tier-drop rule.
For a low-tier NPC these two rules would otherwise collide: an `amateur`-tier
NPC dropped "one full tier" would need First Aid below 20%, but its base is 30%.
The drop rule is therefore expressed as *toward base value*, never as fixed tier
arithmetic, and a skill resting at its base value is always correct regardless of
the declared tier.

Rejected alternative: a flat ceiling at the declared tier. It fixes cause 1 but
not cause 3 — ten skills clustered just under the cap is still a generalist.

Rejected alternative: an explicit per-tier skill budget (at most 2 at tier, at
most 3 one below, rest at base). Most precise, but LLMs comply with counting
rules unreliably and the arithmetic bloats the prompt.

### D2 — Combat skills are not occupation skills by default

The observed failure. A constable, night watchman, or security guard carries a
weapon and rarely uses it well. Combat and firearms skills reach tier level
only when the role is fundamentally about violence — soldier, prizefighter,
hitman, gangster enforcer, big-game hunter. Otherwise they stay in the Amateur
band, typically 25–40%.

This is called out as its own CRITICAL paragraph rather than folded into D1,
because it is the specific error being corrected.

### D3 — Base values are a hard floor, stated in the prompt

Never below base. The prompt carries a base-value reference for common skills so
the model can reason about the floor. Values verified against
`../CoC7-FoundryVTT-8.x/compendiums/en-skills.yaml`.

### D4 — Fourteen core skills are always present

Always emitted in `skills[]`, at base or higher (higher only when it genuinely
fits the character):

| Skill | Base | Skill | Base |
|-------|------|-------|------|
| Climb | 20 | Language (native) | = EDU |
| Dodge | = DEX ÷ 2 | Library Use | 20 |
| Drive Auto | 20 | Listen | 20 |
| Fighting (Brawl) | 25 | Spot Hidden | 25 |
| Firearms (Handgun) | 20 | Stealth | 20 |
| First Aid | 30 | Swim | 20 |
| Jump | 20 | Throw | 20 |

Era-inappropriate entries stay: an 1890s NPC keeps Drive Auto at 20 because it
is the sheet default.

**Base-derived values do not count toward the declared peak.** Added after the
final review. The native language equals EDU, which rolls 40-90, so for a
professor, doctor or librarian it is the NPC's single highest skill and lands in
the Expert band. Since D1 defines the tier as the band of the best skill, that
left two bad outcomes: declaring `professional` and having D8's callout flag a
value the prompt *required*, or declaring `expert` and thereby licensing 2-4
occupation skills at 75-89% — the over-skilling this spec exists to prevent. The
peak is therefore judged from TRAINED skills only, and the review dialog exempts
the native language from labelling, flagging and the above-tier count. Dodge
needs no exemption: at DEX 90 it is 45, inside the Amateur band, so it cannot
exceed the ceiling of any tier an NPC may declare.

### D5 — Beyond the core fourteen, list a skill only when trained above base

No padding with untrained entries. Total skill count moves from "typically 5–12"
to the 14 core plus roughly 3–8 others.

### D6 — The LLM computes the two derived skills; the mapper is left alone

Dodge and the native language are the only core skills whose base is a formula
rather than a number (`1/2*@DEX` and `@EDU` in `en-skills.yaml`). The prompt
instructs the model to compute them from the characteristics it just assigned:

    Dodge             = DEX ÷ 2, rounded down
    Language (native) = EDU exactly

The native language's *name* is covered separately by D9.

**The mapper half of this decision was WRONG and is superseded by D10.** It
assumed `adjustments.base = 0` held and that the LLM's number was therefore the
final displayed value. Task 5 measured otherwise. The *prompt* half stands — the
LLM still computes Dodge and the native language from the characteristics it
assigns, which is what gives the mapper a value to subtract the base from.

The alternative this decision rejected — `personal = max(0, llmValue - base)` —
turned out to be necessary, and is now D10. The reason it was rejected (that it
would require reordering `onAccept` to read rolled characteristics back off a
created actor) proved unfounded: resolving the base from the LLM's own
characteristics at mapping time is sufficient, because CoC7 re-resolves the
formula on the actor anyway.

### D7 — Raise `_ensureWeaponSkills` fallback from 20 to 25

`WEAPON_SKILL_FALLBACK_VALUE = 20` (`npc.js:11`) is below Fighting (Brawl)'s base
of 25, so the auto-add can produce an illegal value — the same floor bug, in
code. 25 is the highest base among weapon skills (Fighting (Brawl) 25, Firearms
(Rifle/Shotgun) 25), so a flat 25 is at or above base for every weapon skill and
is legal in all cases. A one-line constant change; no per-skill base table
needed.

### D10 — `personal` holds the trained excess; the base value stands (supersedes D6's mapper decision)

Added 2026-07-29 during Task 5 verification. **This reverses the choice made in
D6 and adopts the alternative D6 rejected.** The evidence that forced it:

D6 assumed the mapper's `adjustments.base = 0` held, so that the LLM's number
*was* the final displayed value. It does not hold. CoC7 re-resolves
`system.base` into `adjustments.base` when a skill is created on an actor, and
`value` is the sum of all adjustments (`skill-system.js:262,277`). Measured on a
real actor at DEX 54, EDU 55:

| Skill | LLM value | On the actor | `adjustments.base` | `personal` |
|---|---|---|---|---|
| Spot Hidden | 40 | **65** | 25 | 40 |
| Dodge | 27 | **54** | 27 | 27 |
| Language (English) | 55 | **110** | 55 | 55 |

Every skill arrived inflated by its base; the two formula-based ones doubled.
This predates the branch — `Spot Hidden` travels the long-standing compendium
path — and it silently defeated the entire calibration effort: a constable
reviewed at `Fighting (Brawl) 40` reached the sheet at 65.

**Decision.** Resolve each skill's base at mapping time and store only the
trained excess:

    resolvedBase = evaluate(system.base, the LLM's characteristics)   // 0 if unparseable
    adjustments.base     = resolvedBase
    adjustments.personal = max(0, llmValue - resolvedBase)

The total is then exactly the LLM's number. If CoC7 re-resolves the base it
writes the same figure, so the total is unchanged either way — the fix is robust
to whether that resolution happens or not.

`CoC7Utilities.setMultipleSkillBases()` is *not* reachable from module code —
`CoC7Utilities` is an internal ES module and is absent from `game.CoC7`
(verified). The mapper therefore resolves the formula itself, mirroring CoC7's
approach at `utilities.js:995-1021`: substitute `@term` from a lowercased
characteristics map, then evaluate with Foundry's `Roll` and floor the result.

The resolved figure is also **pinned back into `system.base`** as a plain number.
This is required, not cosmetic. CoC7 re-resolves that string at embed time and
the mapper cannot prevent it; if the string is left as a formula, an actor whose
characteristics are not yet populated resolves it to 0. That is exactly what the
random-characteristics option produces — it stores `{ formula, value: 0 }` and
the values are only rolled on token drop — so `1/2*@DEX` re-resolved against
DEX 0 and Dodge landed at **0**, worse than the stale value it replaced.
Measured, Dodge only:

| `system.base` | actor DEX | resulting value |
|---|---|---|
| `1/2*@DEX` | 0 | 0 |
| `1/2*@DEX` | 54 | 27 |
| `27` (pinned) | 0 | 27 |
| `27` (pinned) | 54 | 27 |

Pinning makes CoC7's re-resolution a no-op that writes the same figure back, so
the total is correct whatever the actor's characteristics are at embed time. It
also removes a crash when a formula base met an actor with null characteristics.

**One consequence beyond correctness:**

- **Floors become structural.** `personal` can never be negative, so the total
  can never fall below base. D3's floor no longer depends on model compliance.

**Correction.** An earlier draft of this decision claimed it also eliminated the
random-characteristics limitation, by leaving the base formula intact so a rolled
DEX would resolve Dodge on its own. That was wrong — the measurement above is
why. The limitation stands in its original form: under random characteristics the
two derived skills hold the value the model intended from the characteristics it
assigned, not one derived from the roll. Pinning is what keeps that value correct
rather than zero. The trade-off accepted with it is that Dodge no longer tracks a
later change to DEX — which it never did before this branch either, since the
mapper zeroed the base outright.

### D9 — The native language is named concretely, built from the Own template

Added 2026-07-29 after review of the first draft. The original spec said the
NPC carries a skill literally named `Language (Own)`. That is wrong: in
`en-skills.yaml` those are two different things.

| Compendium entry | base | properties |
|---|---|---|
| `Language (Own)` | `'@EDU'` | `special`, `requiresname`, `keepbasevalue`, `own` |
| `Language (English)` | `1` | `special` |

`Language (Own)` is a **template**. `requiresname: true` means it must be given
a concrete language before it is a usable skill; `keepbasevalue: true` means
that once named it retains base `@EDU` rather than adopting the named
language's base of 1; `own: true` marks it as the character's native tongue.
`Language (English)` is the *foreign*-language skill — what someone who studied
English has.

Emitting the literal `Language (Own)` therefore leaves an unnamed template on
the sheet with `requiresname` still set. Emitting a bare `Language (English)`
silently resolves to the foreign-language entry, recording a native speaker as
though they had studied their own mother tongue. `properties.own` is not
cosmetic: `character-sheet-v2.js:140` appends an "own" marker to the displayed
name, and the shared skill sort at `utilities.js:1067` groups own-languages
apart from foreign ones.

**Decision.** The LLM emits a new top-level `nativeLanguage` field holding the
plain language name (`"English"`), and lists the skill under its concrete name
(`Language (English)`) at EDU. `toFoundryData()` tags that one skill entry with
`own: true`; `resolveSkills()` then builds it from the `Language (Own)`
compendium template rather than by direct name lookup — renaming it, clearing
`requiresname` and `picknameonly`, and preserving `own: true`. This mirrors
CoC7's own naming flow at `document-class.js:645-658`.

**Superseded detail (corrected after D10).** This decision originally reasoned
that the template's `@EDU` base formula was harmless because the mapper zeroed
`adjustments.base`. Both halves of that are no longer true: D10 stopped zeroing
the base, and it pins the resolved figure into `system.base`, so the native
language ends up with a plain number there rather than `@EDU`. D9's actual
guarantees are unaffected — the concrete name, `own: true`, `requiresname:
false`, and no `Language (Own)` placeholder reaching an actor — and all four are
verified. Only the incidental claim about the formula was wrong.

A `nativeLanguage` that matches no `Language (<name>)` entry in `skills[]`
records a warning rather than failing, and the skill resolves by the ordinary
path.

Rejected alternative: keeping `Language (Own)` in `skills[]` and renaming only
during resolution. Same end state on the actor, but the review dialog reads
`llmData.skills` directly and would display the placeholder name — moving the
labelling problem rather than fixing it.

### D8 — Review dialog shows tiers and flags above-tier skills

`expertiseTier` becomes required in `validate()` (`npc.js:49`). The dialog shows
it in the header and marks rows above the declared tier with a warning
affordance, so a stray Expert-level skill is visible before Accept.

**Revised 2026-07-29 after implementation review.** The first draft printed a
tier label on *every* skill row. In practice that was 15 of 18 rows reading
"AMATEUR" on a realistic constable, and the label's column stole enough width
that `Language (English)` truncated to `Language (Eng…` — a skill's identity
sacrificed for a near-uniform label. The tier label is therefore shown only on
rows at or above the declared tier, where it carries information; lower rows
leave the space to the skill name.

Because the flag's only explanation was a hover-only `title` tooltip — useless
on touch and unreliable for assistive tech — the count of above-tier skills
also appears as one aggregate line in the dialog's existing warnings callout.
That callout is always visible and already the place a Keeper looks.

Skills stay read-only in the dialog. This is a review affordance, not an editor —
the GM adjusts on the sheet afterwards.

Rejected alternative: a hard clamp in the mapper. It would silently override
deliberately high-end NPCs and needs an occupation → tier table the module has
no authoritative source for.

Rejected alternative: a hardcoded occupation → tier table as the flag's
reference. Breaks on any occupation outside the list and fails outright for
non-English or invented occupations.

## Prompt changes

Replacing the `skills` bullet (line 22-26) and the weapon-skill guidance
(line 53) with:

```
SKILL CALIBRATION (most important section — read carefully)

CoC7 expertise ladder. A skill percentage is a claim about how good the NPC is:
  01–05%  Novice        complete amateur, baseline or theoretical knowledge only
  06–19%  Neophyte      beginner, small knowledge, rare practice
  20–49%  Amateur       hobby-level, rudimentary training or casual talent
  50–74%  Professional  competent enough to earn a living (~bachelor's degree)
  75–89%  Expert        advanced expertise (~master's degree or Ph.D.)
  90–99%  Master        elite, among the best in the world

Step 1 — Declare the tier. Emit "expertiseTier": one of novice, neophyte,
  amateur, professional, expert, master. This is the NPC's PEAK — the band of
  their single best skill, not an average. Most NPCs met in play are amateur or
  professional. Reserve expert for genuine specialists with years of formal
  training, and master for world-renowned figures — a handful across an entire
  campaign, not one per session.

Step 2 — Name 2–4 occupation skills. Only these may reach the declared tier.
  A librarian's are Library Use, Language, History. A constable's are Spot
  Hidden, Law, Listen.

  CRITICAL: combat and firearms skills are NOT occupation skills unless the
  role is fundamentally about violence (soldier, prizefighter, hitman,
  gangster enforcer, big-game hunter). A constable, night watchman, or
  security guard carries a weapon and rarely uses it well — keep their combat
  skills in the Amateur band, typically 25–40%. A weapon in possessions[] or
  weapons[] does NOT justify a tier-level combat skill.

Step 3 — Everything else falls below the declared tier and toward base value.
  Most non-occupation skills sit at, or only a little above, their base value.
  A skill resting exactly at its base value is always correct — never raise a
  skill just to avoid repeating a base number, and never lower one below base
  to widen the spread.

ANTI-PATTERN: a flat profile with every skill in the same 35–60% band. That is
  a bland generalist, not a character. The correct shape is two skills that
  define them, a few they are passably trained in, and the rest at baseline.
```

Plus a `BASE VALUES AND MANDATORY CORE SKILLS` section carrying D3, D4, D5 and
D6 — including the explicit instruction to compute `Dodge` as half the assigned
DEX rounded down and the native language as the assigned EDU — and the
`expertiseTier` and `nativeLanguage` fields added to the required-fields list.

## Worked example — the reported constable

Occupation Police Officer, age 34, DEX 50, EDU 55. Declared tier
`professional`; occupation skills Spot Hidden, Law, Listen, Intimidate.

| Skill | Before | After | Tier | Note |
|-------|--------|-------|------|------|
| Fighting (Brawl) | 60 | 40 | Amateur | D2 — the reported defect |
| Spot Hidden | 50 | 55 | Professional | occupation |
| Law | 40 | 50 | Professional | occupation |
| Intimidate | 50 | 45 | Amateur | occupation, below peak |
| Listen | 45 | 40 | Amateur | occupation, below peak |
| Psychology | 40 | 20 | Amateur | non-occupation, near base 10 |
| Persuade | 45 | 25 | Amateur | non-occupation, near base 10 |
| First Aid | 40 | 30 | Amateur | at base |
| Dodge | 35 | 25 | Amateur | = DEX ÷ 2, computed by the LLM |
| Language (English) | 55 | 55 | — | = EDU; native, per D9 |
| Climb, Drive Auto, Firearms (Handgun), Jump, Library Use, Stealth, Swim, Throw | absent | base | — | D4 core set |

Before: nine skills, every one between 35% and 60% — peak 60, median 45, spread
25. After: a peak of 55% held by two occupation skills, a middle group in the
40s, and the remainder resting at base in the 20s and 30s.

## Testing

No automated tests in this project. Manual verification in a running FoundryVTT
instance with the CoC7 system, driven through the Playwright MCP server where
possible (see CLAUDE.md).

1. **Regression on the reported case.** Generate "a police constable in 1920s
   London". Assert no combat skill above 49%, all 14 core skills present, and
   peak ≤ the declared tier's ceiling.
2. **Floor enforcement.** Assert no skill on the created actor falls below its
   compendium base. This is prompt-enforced (D3), not guaranteed by code, so it
   is the check most worth repeating across several generations and across
   providers.
3. **Derived skills.** With the random-characteristics checkbox **off**, assert
   Dodge equals ⌊DEX ÷ 2⌋ and the native language equals EDU. With it **on**,
   confirm the known limitation below is the only discrepancy — no crash, no
   validation error.
3b. **Native language (D9).** On the created actor, assert the language skill is
   named for a real language (never `Language (Own)`), and that its
   `system.properties` has `own: true` and `requiresname: false`. Assert a
   foreign language the NPC also speaks does *not* carry `own: true`.
4. **Tier spread.** Across roughly five varied prompts (librarian, dockworker,
   professor, gangster enforcer, doctor), confirm profiles are not flat and that
   only genuine combat roles carry tier-level combat skills.
5. **Expert and master are rare.** Confirm ordinary prompts do not self-declare
   `expert`.
6. **Dialog rendering.** Tier labels and above-tier flags render correctly; the
   longer skill list (17–22 rows) still scrolls inside its own region rather
   than overflowing the window — issue #8 territory.
7. **Non-English prompts.** A French prompt still emits English skill names and
   a valid `expertiseTier`, per the existing LANGUAGE RULES.
8. **Missing-field handling.** An LLM response without `expertiseTier` surfaces
   a clear validation error rather than throwing deep in the dialog.

## Known limitations

**Floors depending on model compliance — resolved by D10.** `personal` can never
be negative, so no skill can land below its base. A response returning First Aid
at 5% now produces exactly 30 on the actor.

**Derived skills still go stale under random characteristics.** The opt-in
checkbox (`dialog-injector.js:69`) replaces the LLM's characteristics with dice
formulas rolled on token drop, so Dodge and the native language hold the values
the model computed from the characteristics it assigned. A rolled DEX of 80
leaves Dodge at the model's figure rather than 40. D10's base pinning is what
keeps those values correct rather than zero; see the correction note in D10 for
why the alternative was worse. The mode is opt-in, both values are visible in the
review dialog, and the Keeper can adjust them on the sheet.

**The review dialog's numbers are the actor's totals.** With D10 the dialog and
the sheet agree, since the total is `base + excess = llmValue`. Before D10 they
disagreed silently, by the size of each skill's base value.

## Out of scope

- Editing skill values inside the confirmation dialog.
- Applying the same calibration to the weapon mapper's damage or range values.
- Any occupation → tier lookup table.
