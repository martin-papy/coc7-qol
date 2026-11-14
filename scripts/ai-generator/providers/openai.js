import { postJson, readReply } from './shared.js'
import { MODULE_ID } from '../../constants.js'

const NAME = 'OpenAI'

export default class OpenAIProvider {
  async generate (systemPrompt, userPrompt) {
    const data = await postJson(NAME, game.settings.get(MODULE_ID, 'ai-endpoint'), {
      authorization: `Bearer ${game.settings.get(MODULE_ID, 'ai-api-key')}`
    }, {
      model: game.settings.get(MODULE_ID, 'ai-model'),
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
