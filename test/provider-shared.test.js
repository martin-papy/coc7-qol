import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readReply, postJson } from '../scripts/ai-generator/providers/shared.js'

const OBJECT = { name: 'Colt .45', damage: '1D10+2' }
const JSON_TEXT = JSON.stringify(OBJECT)

test('readReply parses a bare JSON object', () => {
  assert.deepEqual(readReply('Anthropic', { text: JSON_TEXT }), OBJECT)
})

test('readReply parses a reply wrapped in a ```json code fence', () => {
  assert.deepEqual(readReply('Anthropic', { text: '```json\n' + JSON_TEXT + '\n```' }), OBJECT)
})

test('readReply parses a reply wrapped in a bare ``` code fence', () => {
  assert.deepEqual(readReply('Anthropic', { text: '```\n' + JSON_TEXT + '\n```' }), OBJECT)
})

test('readReply parses a reply with prose before and after the JSON', () => {
  const text = `Here is the weapon you asked for:\n${JSON_TEXT}\nLet me know if you want changes.`
  assert.deepEqual(readReply('Anthropic', { text }), OBJECT)
})

test('readReply reports a truncated reply as cut off, not as invalid JSON', () => {
  assert.throws(
    () => readReply('OpenAI', { text: '{"name": "Colt', truncated: true }),
    /OpenAI reply was cut off/
  )
})

test('readReply reports a truncated reply as cut off even when nothing came back', () => {
  assert.throws(() => readReply('Gemini', { text: '', truncated: true }), /Gemini reply was cut off/)
})

test('readReply reports a refusal with the provider reason', () => {
  assert.throws(
    () => readReply('OpenAI', { text: '', refusal: 'I cannot help with that.' }),
    /OpenAI declined the request: I cannot help with that\./
  )
})

test('readReply reports a refusal without a reason', () => {
  assert.throws(() => readReply('Anthropic', { text: '', refusal: true }), /^Error: Anthropic declined the request\.?$/)
})

test('readReply reports an empty reply', () => {
  assert.throws(() => readReply('Gemini', { text: '   ' }), /Gemini returned an empty response/)
})

test('readReply reports text with no JSON object as invalid JSON', () => {
  assert.throws(() => readReply('Anthropic', { text: 'Sorry, no.' }), /Anthropic response is not valid JSON/)
})

for (const [label, text] of [['null', 'null'], ['an array', '[1, 2]'], ['a string', '"a weapon"'], ['a number', '42']]) {
  test(`readReply rejects ${label} with a clear message, not a TypeError`, () => {
    assert.throws(
      () => readReply('OpenAI', { text }),
      err => !(err instanceof TypeError) && /OpenAI response is not a JSON object/.test(err.message)
    )
  })
}

/** A fetch stand-in that records its call and answers with the given status and body. */
function fakeFetch (status, body) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
    }
  }
  return { impl, calls }
}

test('postJson POSTs the body as JSON with the given headers and returns the parsed reply', async () => {
  const { impl, calls } = fakeFetch(200, { ok: 1 })

  const data = await postJson('OpenAI', 'https://example.test/v1', { authorization: 'Bearer k' }, { model: 'm' }, { fetchImpl: impl })

  assert.deepEqual(data, { ok: 1 })
  assert.equal(calls[0].url, 'https://example.test/v1')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.equal(calls[0].init.headers.authorization, 'Bearer k')
  assert.deepEqual(JSON.parse(calls[0].init.body), { model: 'm' })
})

test('postJson turns an HTTP error into the formatted provider message', async () => {
  const { impl } = fakeFetch(401, 'unauthorized')

  await assert.rejects(
    postJson('Anthropic', 'https://example.test', {}, {}, { fetchImpl: impl }),
    /Anthropic API error 401: Invalid API key/
  )
})

test('postJson reports a timeout with the provider name', async () => {
  const hanging = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
  })

  await assert.rejects(
    postJson('Gemini', 'https://example.test', {}, {}, { fetchImpl: hanging, timeoutMs: 10 }),
    /Gemini request timed out after 0\.01 s/
  )
})
