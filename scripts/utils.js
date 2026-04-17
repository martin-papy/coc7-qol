// scripts/utils.js

/**
 * Escapes a value for safe HTML interpolation.
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml (str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Localise a static string by i18n key.
 * @param {string} key
 * @returns {string}
 */
export const t = key => game.i18n.localize(key)

/**
 * Localise a string with runtime data substitutions.
 * @param {string} key
 * @param {object} data
 * @returns {string}
 */
export const tf = (key, data) => game.i18n.format(key, data)
