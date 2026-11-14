import { postJson, readReply } from './shared.js'

const MODULE = 'coc7-qol'
const NAME = 'Gemini'

// finishReason values that mean the reply was withheld rather than completed.
const BLOCKED_FINISH_REASONS = ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']

export default class GeminiProvider {
  async generate (systemPrompt, userPrompt) {
    const model = game.settings.get(MODULE, 'ai-model')
    const endpoint = game.settings.get(MODULE, 'ai-endpoint').replace('{model}', model)
    const data = await postJson(NAME, endpoint, {
      'x-goog-api-key': game.settings.get(MODULE, 'ai-api-key')
    }, {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })

    const candidate = data.candidates?.[0]
    const blockReason = data.promptFeedback?.blockReason
    const finishReason = candidate?.finishReason
    return readReply(NAME, {
      text: candidate?.content?.parts?.[0]?.text,
      truncated: finishReason === 'MAX_TOKENS',
      refusal: blockReason || (BLOCKED_FINISH_REASONS.includes(finishReason) && finishReason)
    })
  }
}
