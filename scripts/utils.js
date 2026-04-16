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
}
