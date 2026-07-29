# NPC Skill Balance — Design

Date: 2026-07-29
Status: approved (pending spec review)
Scope: `scripts/ai-generator/prompts/npc-system-prompt.md`, `scripts/ai-generator/mappers/npc.js`, `scripts/ai-generator/npc-confirmation-dialog.js`, `scripts/ai-generator/dialog-injector.js`, `styles/ai-generator.css`

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
| 4 | No mention of CoC7 base values. The mapper writes the LLM number to `adjustments.personal` and zeroes `adjustments.base`; CoC7 computes `value` as the sum of all adjustments (`skill-system.js:277`). The LLM's number therefore *is* the final displayed percentage, base included — but nothing tells the model that Law starts at 5% and First Aid at 30%, so it cannot reason about trained-above-baseline versus untrained. | `npc.js:147-155` |

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
| Climb | 20 | Language (Own) | = EDU |
| Dodge | = DEX ÷ 2 | Library Use | 20 |
| Drive Auto | 20 | Listen | 20 |
| Fighting (Brawl) | 25 | Spot Hidden | 25 |
| Firearms (Handgun) | 20 | Stealth | 20 |
| First Aid | 30 | Swim | 20 |
| Jump | 20 | Throw | 20 |

Era-inappropriate entries stay: an 1890s NPC keeps Drive Auto at 20 because it
is the sheet default.

### D5 — Beyond the core fourteen, list a skill only when trained above base

No padding with untrained entries. Total skill count moves from "typically 5–12"
to the 14 core plus roughly 3–8 others.

### D6 — Resolve base values in code and derive `personal` as the trained excess

Supersedes the mapper's current unconditional `adjustments.base = 0`.

The CoC7 system already ships
`CoC7Utilities.setMultipleSkillBases(parsedValues, skills)`
(`../CoC7-FoundryVTT-8.x/coc7/apps/utilities.js:991`). Given a map of
characteristic values it resolves each skill's `system.base` formula —
`1/2*@DEX`, `@EDU`, or a plain number — into `system.adjustments.base`,
including inter-skill references.

`resolveSkills()` calls it, then sets

    adjustments.personal = max(0, llmValue - adjustments.base)

so the final total is `llmValue` when the LLM respects the floor, and exactly
`base` when it undershoots. Three consequences:

- Every floor is enforced structurally, for every skill, instead of being
  trusted to the prompt.
- Dodge and Language (Own) track the actor's real DEX and EDU rather than a
  number the LLM computed by hand.
- It generalizes the approved Dodge/Language handling for less code than
  special-casing those two skills.

**Ordering.** The optional random-characteristics checkbox
(`dialog-injector.js:69`) replaces the LLM's characteristics with dice formulas,
so DEX and EDU are unknown until Foundry rolls them. `onAccept` currently calls
`resolveSkills()` *before* `Actor.create()`. It must be reordered: create the
actor, read the resolved characteristics back off it, then resolve skill bases
against those actual values. This makes both modes correct with one code path.

**Verification required at implementation time.** Confirm in a live Foundry
instance that (a) `applyRandomCharacteristics` formulas are evaluated to numbers
by the time `Actor.create()` resolves, and (b) `setMultipleSkillBases` is
reachable at the expected path and accepts plain skill-data objects rather than
documents. If (a) fails, fall back to resolving bases from `llmData`'s
characteristics and accept staleness only in random mode.

### D7 — `_ensureWeaponSkills` fallback sits at base, not 20

`WEAPON_SKILL_FALLBACK_VALUE = 20` (`npc.js:11`) is below Fighting (Brawl)'s base
of 25 — the same floor bug in code. Under D6 the auto-add passes `0`, and the
resolved base becomes the value. The warning text changes to say the skill was
added at its base value.

### D8 — Review dialog shows tiers and flags above-tier skills

`expertiseTier` becomes required in `validate()` (`npc.js:49`). The dialog shows
it in the header, labels each skill row with its tier, and marks rows above the
declared tier with a warning affordance. A stray Expert-level skill is then
visible before Accept.

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

Plus a `BASE VALUES AND MANDATORY CORE SKILLS` section carrying D3, D4 and D5,
and the `expertiseTier` field added to the required-fields list.

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
| Dodge | 35 | 25 | Amateur | = DEX ÷ 2, derived in code |
| Climb, Drive Auto, Firearms (Handgun), Jump, Library Use, Language (Own), Stealth, Swim, Throw | absent | base | — | D4 core set |

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
   compendium base — the check that D6 exists to guarantee.
3. **Derived skills, both modes.** With the random-characteristics checkbox off
   and on: assert Dodge equals ⌊DEX ÷ 2⌋ and Language (Own) equals EDU against
   the actor's *final* characteristics.
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

## Out of scope

- Editing skill values inside the confirmation dialog.
- Applying the same calibration to the weapon mapper's damage or range values.
- Any occupation → tier lookup table.
