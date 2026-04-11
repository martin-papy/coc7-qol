const MODULE = 'coc7-qol'

export default class GeminiProvider {
  async generate (systemPrompt, userPrompt) {
    const apiKey = game.settings.get(MODULE, 'ai-api-key')
    const endpointTemplate = game.settings.get(MODULE, 'ai-endpoint')
    const model = game.settings.get(MODULE, 'ai-model')
    const endpoint = endpointTemplate.replace('{model}', model)

    const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error ${response.status}: ${error}`)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text?.trim()) throw new Error('Gemini returned an empty response')

    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error(`Gemini response is not valid JSON: ${text.slice(0, 200)}`, { cause: e })
    }
  }
}
