const MODULE = 'coc7-qol'

export default class OpenAIProvider {
  async generate (systemPrompt, userPrompt) {
    const apiKey = game.settings.get(MODULE, 'ai-api-key')
    const endpoint = game.settings.get(MODULE, 'ai-endpoint')
    const model = game.settings.get(MODULE, 'ai-model')

    const response = await fetch(endpoint, {
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
