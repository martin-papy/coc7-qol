import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { escapeHtml, formatApiError } from '../scripts/utils.js'
import { installEnglishI18n } from './helpers/i18n.js'

let uninstallI18n
before(() => { uninstallI18n = installEnglishI18n() })
after(() => uninstallI18n())

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

test('escapeHtml escapes every character of its set', () => {
  const cases = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#96;'
  }
  for (const [char, entity] of Object.entries(cases)) {
    assert.equal(escapeHtml(char), entity, `escapes ${char}`)
  }
})

test('escapeHtml escapes every occurrence, not just the first', () => {
  assert.equal(escapeHtml('a<b<c'), 'a&lt;b&lt;c')
})

test('escapeHtml escapes an ampersand once, not an already-escaped entity twice over', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;')
})

test('escapeHtml leaves ordinary text untouched', () => {
  assert.equal(escapeHtml('Shrivelling (1D6) — Élise, 50%'), 'Shrivelling (1D6) — Élise, 50%')
})

test('escapeHtml turns null and undefined into an empty string', () => {
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
})

test('escapeHtml stringifies numbers and other values', () => {
  assert.equal(escapeHtml(42), '42')
  assert.equal(escapeHtml(0), '0')
  assert.equal(escapeHtml(false), 'false')
})

test('escaped markup renders as inert text', () => {
  const payload = '<img src=x onerror="alert(1)"><script>alert(`x`)</script>'
  const { window } = new JSDOM('<!doctype html><body><div id="t"></div></body>')
  const target = window.document.getElementById('t')
  target.innerHTML = `<span title="${escapeHtml(payload)}">${escapeHtml(payload)}</span>`
  assert.equal(target.querySelectorAll('img, script').length, 0)
  const span = target.querySelector('span')
  assert.equal(span.textContent, payload)
  assert.equal(span.getAttribute('title'), payload, 'attribute value cannot be broken out of')
  assert.equal(span.attributes.length, 1)
})

// ---------------------------------------------------------------------------
// formatApiError — branches beyond test/format-api-error.test.js
// ---------------------------------------------------------------------------

test('a 401 reports an invalid API key, ignoring the body', () => {
  assert.equal(
    formatApiError('OpenAI', 401, '{"error":{"message":"Incorrect API key provided: sk-..."}}'),
    'OpenAI API error 401: Invalid API key — check your settings.'
  )
})

test('a 429 reports the rate limit, ignoring the body', () => {
  assert.equal(
    formatApiError('Gemini', 429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}'),
    'Gemini API error 429: Rate limit reached — please wait before trying again.'
  )
})

test('every 5xx status reports a provider server error with its own status code', () => {
  for (const status of [500, 502, 503, 529]) {
    assert.equal(
      formatApiError('Anthropic', status, '<html><body>Bad gateway</body></html>'),
      `Anthropic API error ${status}: Provider server error — try again later.`
    )
  }
})

test('a status just below 500 is not treated as a server error', () => {
  assert.equal(formatApiError('Anthropic', 499, 'client closed'), 'Anthropic API error 499: client closed')
})

test('a plain 400 body passes through unchanged', () => {
  const body = '{"type":"error","error":{"type":"invalid_request_error","message":"max_tokens: too large"}}'
  assert.equal(formatApiError('Anthropic', 400, body), `Anthropic API error 400: ${body}`)
})

test('an HTML error page is stripped of tags and surrounding whitespace', () => {
  const body = '  <html><head><title>400 Bad Request</title></head><body><h1>Bad Request</h1></body></html>\n'
  assert.equal(formatApiError('OpenAI', 400, body), 'OpenAI API error 400: 400 Bad RequestBad Request')
})

test('the stripped body is truncated to 300 characters after tags are removed', () => {
  // Tags do not count against the limit: 300 text chars survive even with long markup around them.
  const body = `<div class="${'c'.repeat(500)}">${'a'.repeat(150)}<br/>${'b'.repeat(250)}</div>`
  const message = formatApiError('Gemini', 400, body)
  const detail = message.replace(/^Gemini API error 400: /, '')
  assert.equal(detail.length, 300)
  assert.equal(detail, 'a'.repeat(150) + 'b'.repeat(150))
})

test('an empty 400 body yields just the prefix', () => {
  assert.equal(formatApiError('OpenAI', 400, ''), 'OpenAI API error 400: ')
})

test('formatApiError messages go through game.i18n', () => {
  const saved = globalThis.game
  globalThis.game = { i18n: { localize: key => key, format: (key, data) => `${key} ${JSON.stringify(data)}` } }
  try {
    assert.match(formatApiError('OpenAI', 404, ''), /^COC7QOL\.AIGenerator\.Error\.ApiModelNotFound/)
    assert.match(formatApiError('OpenAI', 401, ''), /^COC7QOL\.AIGenerator\.Error\.ApiInvalidKey/)
    assert.match(formatApiError('OpenAI', 503, ''), /^COC7QOL\.AIGenerator\.Error\.ApiServer/)
    assert.match(formatApiError('OpenAI', 400, 'bad'), /^COC7QOL\.AIGenerator\.Error\.ApiOther/)
  } finally {
    globalThis.game = saved
  }
})
