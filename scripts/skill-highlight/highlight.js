/**
 * The strong-skill rule and its row marking on actor sheets. Pure DOM — no Foundry
 * globals — so it can be unit-tested (test/skill-highlight.test.js). The Foundry
 * wiring lives in index.js.
 */

/** Marks a skill row whose value is at or above the threshold. */
export const STRONG_SKILL_CLASS = 'coc7qol-strong-skill'

export const DEFAULT_THRESHOLD = 50
export const MIN_THRESHOLD = 1
export const MAX_THRESHOLD = 99

/** Skill rows on investigator (skills and combat tabs) and NPC / Creature sheets, and the summarized sheet's top skills (CoC7 9.1). */
const SKILL_ROW_SELECTOR = '.item.skill[data-item-uuid], .skills-block:not(.icons-only) .item[data-item-uuid]'

/**
 * Read a value as a number; empty strings, null and anything non-numeric give NaN.
 * @param {unknown} raw
 * @returns {number}
 */
function toNumber (raw) {
  if (raw === null || raw === '' || typeof raw === 'object') return NaN
  return Number(raw)
}

/**
 * Coerce a stored setting into a whole number from 1 to 99.
 * @param {unknown} raw
 * @returns {number} The default threshold when `raw` is unreadable.
 */
export function normalizeThreshold (raw) {
  const number = toNumber(raw)
  if (Number.isNaN(number)) return DEFAULT_THRESHOLD
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.round(number)))
}

/**
 * Whether a skill value is at or above the threshold. Values above 99 count.
 * @param {unknown} value
 * @param {number} threshold
 * @returns {boolean}
 */
export function isStrongSkill (value, threshold) {
  const number = toNumber(value)
  return !Number.isNaN(number) && number >= threshold
}

/**
 * Toggle the strong-skill class on every skill row under `root`. Safe to call on
 * every render: a row that dropped below the threshold, or that cannot be
 * resolved, loses its class.
 * @param {Element} root
 * @param {{ threshold: number | null, valueFor: (uuid: string) => unknown }} opts
 *   `threshold: null` means the feature is off; `valueFor` gives the value of the skill a row stands for.
 * @returns {void}
 */
export function markStrongSkills (root, { threshold, valueFor }) {
  for (const row of root.querySelectorAll(SKILL_ROW_SELECTOR)) {
    const strong = threshold !== null && isStrongSkill(valueFor(row.dataset.itemUuid), threshold)
    row.classList.toggle(STRONG_SKILL_CLASS, strong)
  }
}
