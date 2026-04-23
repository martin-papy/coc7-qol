import { formatApiError } from '../../utils.js'

const MODULE = 'coc7-qol'

export default class AnthropicProvider {
  async generate (systemPrompt, userPrompt) {
    const apiKey = game.settings.get(MODULE, 'ai-api-key')
    const endpoint = game.settings.get(MODULE, 'ai-endpoint')
    const model = game.settings.get(MODULE, 'ai-model')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60_000)

    let response
    try {
      response = await fetch(endpoint, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      })
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Anthropic request timed out after 60 s')
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const error = await response.text()
      throw new Error(formatApiError('Anthropic', response.status, error))
    }

    const data = await response.json()
    const text = data.content?.[0]?.text
    if (!text?.trim()) throw new Error('Anthropic returned an empty response')
    try {
      return JSON.parse(text)
    } catch (e) {
      console.error('[coc7-qol] Anthropic returned invalid JSON.\nParse error:', e, '\nFull response text:\n', text)
      throw new Error(`Anthropic response is not valid JSON: ${text.slice(0, 200)}`, { cause: e })
    }
  }
}
