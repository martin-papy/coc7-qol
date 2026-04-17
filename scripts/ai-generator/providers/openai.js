const MODULE = 'coc7-qol'

export default class OpenAIProvider {
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
          'authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      })
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('OpenAI request timed out after 60 s')
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${error}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content
    if (!text?.trim()) throw new Error('OpenAI returned an empty response')

    try {
      return JSON.parse(text)
    } catch (e) {
      console.error('[coc7-qol] OpenAI returned invalid JSON.\nParse error:', e, '\nFull response text:\n', text)
      throw new Error(`OpenAI response is not valid JSON: ${text.slice(0, 200)}`, { cause: e })
    }
  }
}
