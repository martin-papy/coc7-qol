// The CoC7 skill expertise ladder (Call of Cthulhu 7th Edition rulebook).
//
// A skill percentage is a claim about competence, not an arbitrary number:
// 20-49% is a hobbyist, 50-74% earns a living at it, 75%+ is a career
// specialist. The AI generator uses this both to instruct the LLM and to flag
// skills that overshoot the tier the LLM declared for an NPC.

import { t } from '../utils.js'

export const SKILL_TIERS = Object.freeze([
  Object.freeze({ key: 'novice', min: 1, max: 5 }),
  Object.freeze({ key: 'neophyte', min: 6, max: 19 }),
  Object.freeze({ key: 'amateur', min: 20, max: 49 }),
  Object.freeze({ key: 'professional', min: 50, max: 74 }),
  Object.freeze({ key: 'expert', min: 75, max: 89 }),
  Object.freeze({ key: 'master', min: 90, max: 99 })
])

export const SKILL_TIER_KEYS = Object.freeze(SKILL_TIERS.map(tier => tier.key))

const LOWEST_TIER = SKILL_TIERS[0]

/**
 * The tier a skill percentage falls in. Values below the ladder (0, as with
 * Credit Rating or Cthulhu Mythos) read as novice; values at or above 100
 * read as master. The ladder is contiguous over the integers 1-99 but not
 * over the reals, so a fractional value can land in the gap between one
 * tier's max and the next tier's min (e.g. 5.5, between novice's max of 5
 * and neophyte's min of 6). Such values resolve to the lower of the two
 * tiers, never the higher: 5.5 reads as novice, 49.5 as amateur, 89.5 as
 * expert.
 *
 * @param {number} value
 * @returns {string} tier key
 */
export function tierForValue (value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return LOWEST_TIER.key
  if (n < LOWEST_TIER.min) return LOWEST_TIER.key
  const tier = [...SKILL_TIERS].reverse().find(candidate => n >= candidate.min)
  return tier ? tier.key : LOWEST_TIER.key
}

/**
 * The highest percentage inside a tier, or null for an unrecognised key.
 *
 * @param {string} tierKey
 * @returns {number|null}
 */
export function tierCeiling (tierKey) {
  const tier = SKILL_TIERS.find(candidate => candidate.key === tierKey)
  return tier ? tier.max : null
}

/**
 * Whether a value overshoots a tier. An unrecognised tier never flags, so a
 * malformed LLM response degrades to "no warnings" rather than flagging
 * everything.
 *
 * @param {number} value
 * @param {string} tierKey
 * @returns {boolean}
 */
export function isAboveTier (value, tierKey) {
  const ceiling = tierCeiling(tierKey)
  if (ceiling === null) return false
  const n = Number(value)
  return Number.isFinite(n) && n > ceiling
}

/**
 * Whether a value's own tier sits at or above a declared tier. Unlike
 * isAboveTier (which compares the raw percentage to a ceiling), this compares
 * tier positions on the ladder, so a value anywhere inside the declared tier
 * counts as "at" it. An unrecognised tierKey never matches, degrading safely
 * to "not at or above" rather than throwing or matching everything.
 *
 * @param {number} value
 * @param {string} tierKey
 * @returns {boolean}
 */
export function isAtOrAboveTier (value, tierKey) {
  const declaredIndex = SKILL_TIER_KEYS.indexOf(tierKey)
  if (declaredIndex === -1) return false
  const valueIndex = SKILL_TIER_KEYS.indexOf(tierForValue(value))
  return valueIndex >= declaredIndex
}

/**
 * Localized tier name for display. Falls back to the raw key so an unexpected
 * value is visible rather than blank.
 *
 * @param {string} tierKey
 * @returns {string}
 */
export function tierLabel (tierKey) {
  if (!SKILL_TIER_KEYS.includes(tierKey)) return String(tierKey ?? '')
  return t(`COC7QOL.AIGenerator.Tier.${tierKey}`)
}
