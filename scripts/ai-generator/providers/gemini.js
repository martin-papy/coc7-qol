const MODULE = 'coc7-qol'

export default class GeminiProvider {
  async generate (systemPrompt, userPrompt) {
    const apiKey = game.settings.get(MODULE, 'ai-api-key')
    const endpointTemplate = game.settings.get(MODULE, 'ai-endpoint')
    const model = game.settings.get(MODULE, 'ai-model')
    const endpoint = endpointTemplate.replace('{model}', model)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60_000)

    let response
    try {
      response = await fetch(endpoint, {
        signal: controller.signal,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      })
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Gemini request timed out after 60 s')
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

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
      console.error('[coc7-qol] Gemini returned invalid JSON.\nParse error:', e, '\nFull response text:\n', text)
      throw new Error(`Gemini response is not valid JSON: ${text.slice(0, 200)}`, { cause: e })
    }
  }
}
