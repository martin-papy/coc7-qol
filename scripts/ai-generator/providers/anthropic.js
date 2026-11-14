import { postJson, readReply } from './shared.js'
import { MODULE_ID } from '../../constants.js'

const NAME = 'Anthropic'

export default class AnthropicProvider {
  async generate (systemPrompt, userPrompt) {
    const data = await postJson(NAME, game.settings.get(MODULE_ID, 'ai-endpoint'), {
      'x-api-key': game.settings.get(MODULE_ID, 'ai-api-key'),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    }, {
      model: game.settings.get(MODULE_ID, 'ai-model'),
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })

    return readReply(NAME, {
      text: data.content?.find(block => block?.type === 'text')?.text,
      truncated: data.stop_reason === 'max_tokens',
      refusal: data.stop_reason === 'refusal'
    })
  }
}
