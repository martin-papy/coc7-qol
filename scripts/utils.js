const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#96;' }

/**
 * Escapes a value for safe HTML interpolation (OWASP set + backtick).
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml (str) {
  return String(str ?? '').replace(/[&<>"'`/]/g, c => HTML_ESC[c])
}

/**
 * Formats an LLM provider API error into a GM-readable message.
 * Strips HTML (proxy/CDN error pages), truncates, and maps common status codes.
 * A 404 is treated as a retired or mistyped model: all three providers answer an unknown model
 * with 404 (OpenAI also tags it `model_not_found`), and Gemini puts the model in the URL path.
 * @param {string} provider
 * @param {number} status
 * @param {string} body
 * @returns {string}
 */
export function formatApiError (provider, status, body) {
  if (status === 404 || body.includes('model_not_found')) {
    return `${provider} API error ${status}: Model not found — check the Model setting under AI Generator in the module settings (and the Endpoint URL, if you changed it).`
  }
  if (status === 401) return `${provider} API error 401: Invalid API key — check your settings.`
  if (status === 429) return `${provider} API error 429: Rate limit reached — please wait before trying again.`
  if (status >= 500) return `${provider} API error ${status}: Provider server error — try again later.`
  const stripped = body.replace(/<[^>]*>/g, '').trim().slice(0, 300)
  return `${provider} API error ${status}: ${stripped}`
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
