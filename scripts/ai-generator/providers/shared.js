// Request and reply handling shared by the LLM providers. No Foundry globals, so it is
// unit-tested in Node (test/provider-shared.test.js).

import { formatApiError, tf } from '../../utils.js'
import { LOG_PREFIX } from '../../constants.js'

const DEFAULT_TIMEOUT_MS = 60_000
const PREVIEW_LENGTH = 200
const FENCE_PATTERN = /^```[a-z]*\s*\n?([\s\S]*?)\n?```$/i

/**
 * POST a JSON body to a provider and return its parsed JSON reply.
 * @param {string} provider     Display name used in error messages.
 * @param {string} endpoint
 * @param {Record<string, string>} headers  Provider-specific headers; content-type is added.
 * @param {object} body
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<any>}
 */
export async function postJson (provider, endpoint, headers, body, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(endpoint, {
      signal: controller.signal,
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    }).catch(err => {
      if (err.name === 'AbortError') throw err
      // fetch rejects with the browser's own, unlocalised text (e.g. "Failed to fetch").
      throw new Error(tf('COC7QOL.AIGenerator.Error.NetworkError', { provider, error: err.message }), { cause: err })
    })
    // The body is read inside the try so the timeout also covers a reply that stalls mid-stream.
    if (!response.ok) {
      throw new Error(formatApiError(provider, response.status, await response.text()))
    }
    return await response.json()
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(tf('COC7QOL.AIGenerator.Error.Timeout', { provider, seconds: timeoutMs / 1000 }))
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Turn a provider's reply into the JSON object the mappers expect.
 * Refusals and truncation are reported as such before any parsing. The text may be wrapped
 * in a code fence or surrounded by prose: the object is taken from the first `{` to the last `}`.
 * @param {string} provider
 * @param {{ text?: string, truncated?: boolean, refusal?: string | boolean }} reply
 * @returns {object} a plain object (never null, an array or a primitive)
 */
export function readReply (provider, { text, truncated = false, refusal = false }) {
  if (refusal) {
    const reason = typeof refusal === 'string' ? refusal.trim() : ''
    throw new Error(reason
      ? tf('COC7QOL.AIGenerator.Error.RefusedWithReason', { provider, reason })
      : tf('COC7QOL.AIGenerator.Error.Refused', { provider }))
  }
  if (truncated) {
    throw new Error(tf('COC7QOL.AIGenerator.Error.Truncated', { provider }))
  }
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) throw new Error(tf('COC7QOL.AIGenerator.Error.EmptyResponse', { provider }))

  const parsed = parseJson(provider, extractJson(trimmed))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(tf('COC7QOL.AIGenerator.Error.NotAnObject', { provider, preview: trimmed.slice(0, PREVIEW_LENGTH) }))
  }
  return parsed
}

/** Strip a surrounding code fence, then keep the span from the first `{` to the last `}` if there is one. */
function extractJson (text) {
  const unfenced = text.match(FENCE_PATTERN)?.[1]?.trim() ?? text
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  return start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced
}

function parseJson (provider, text) {
  try {
    return JSON.parse(text)
  } catch (e) {
    console.error(LOG_PREFIX, `${provider} returned invalid JSON.\nParse error:`, e, '\nFull response text:\n', text)
    throw new Error(tf('COC7QOL.AIGenerator.Error.InvalidJson', { provider, preview: text.slice(0, PREVIEW_LENGTH) }), { cause: e })
  }
}
