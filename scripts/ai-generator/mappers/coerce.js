// Type checks and coercions for LLM output. No Foundry globals (unit-tested via the mappers).

import { tf } from '../../utils.js'

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @param {unknown} value @returns {boolean} */
export function isNonEmptyString (value) {
  return typeof value === 'string' && value.trim() !== ''
}

/** The trimmed string, or '' for anything that is not a string. */
export function text (value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * A finite number or numeric string, rounded to an integer. Null when it is neither, or
 * when it falls outside [min, max].
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
export function intInRange (value, min, max) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim() !== '')) return null
  const n = Math.round(Number(value))
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

/** A finite number rounded and clamped into [min, max]. */
export function clampInt (value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** The error the mappers throw for an unusable reply, localised, naming the offending fields. */
export function invalidFields (fields) {
  return new Error(tf('COC7QOL.AIGenerator.Error.InvalidFields', { fields: fields.join(', ') }))
}
