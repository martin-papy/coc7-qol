import { postJson, readReply } from './shared.js'

const MODULE = 'coc7-qol'
const NAME = 'OpenAI'

export default class OpenAIProvider {
  async generate (systemPrompt, userPrompt) {
    const data = await postJson(NAME, game.settings.get(MODULE, 'ai-endpoint'), {
      authorization: `Bearer ${game.settings.get(MODULE, 'ai-api-key')}`
    }, {
      model: game.settings.get(MODULE, 'ai-model'),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })

    const choice = data.choices?.[0]
    return readReply(NAME, {
      text: choice?.message?.content,
      truncated: choice?.finish_reason === 'length',
      refusal: choice?.message?.refusal || choice?.finish_reason === 'content_filter'
    })
  }
}
