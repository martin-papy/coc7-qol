import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { formatApiError } from '../scripts/utils.js'
import { installEnglishI18n } from './helpers/i18n.js'

let uninstallI18n
before(() => { uninstallI18n = installEnglishI18n() })
after(() => uninstallI18n())

const MODEL_HINT = /check the Model setting under AI Generator/

/** Model-not-found bodies as each provider returns them. */
const NOT_FOUND = {
  Anthropic: '{"type":"error","error":{"type":"not_found_error","message":"model: claude-sonet-4-6"}}',
  OpenAI: '{"error":{"message":"The model `gpt-4x` does not exist or you do not have access to it.","type":"invalid_request_error","param":null,"code":"model_not_found"}}',
  Gemini: '{"error":{"code":404,"message":"models/gemini-2.0-flash is not found for API version v1beta, or is not supported for generateContent.","status":"NOT_FOUND"}}'
}

for (const [provider, body] of Object.entries(NOT_FOUND)) {
  test(`a ${provider} 404 for a retired or mistyped model names the Model setting`, () => {
    const message = formatApiError(provider, 404, body)
    assert.match(message, new RegExp(`^${provider} API error 404: Model not found`))
    assert.match(message, MODEL_HINT)
  })
}

test('a model_not_found code names the Model setting whatever the status', () => {
  const message = formatApiError('OpenAI', 400, NOT_FOUND.OpenAI)
  assert.match(message, /^OpenAI API error 400: Model not found/)
  assert.match(message, MODEL_HINT)
})

test('a 404 also points to the endpoint, which a custom URL can break', () => {
  const message = formatApiError('OpenAI', 404, '<html><body>Not Found</body></html>')
  assert.match(message, MODEL_HINT)
  assert.match(message, /Endpoint URL/)
})

test('other errors keep the provider message, stripped of HTML and truncated', () => {
  const message = formatApiError('Gemini', 400, `<p>${'x'.repeat(400)}</p>`)
  assert.equal(message, `Gemini API error 400: ${'x'.repeat(300)}`)
})

test('known statuses keep their existing messages', () => {
  assert.match(formatApiError('Anthropic', 401, ''), /Invalid API key/)
  assert.match(formatApiError('Anthropic', 429, ''), /Rate limit/)
  assert.match(formatApiError('Anthropic', 503, ''), /Provider server error/)
})
