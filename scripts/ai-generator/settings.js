const MODULE = 'coc7-qol'

/** Keys of the settings registered below, in the order the settings window lists them. */
export const AI_SETTING_KEYS = ['ai-provider', 'ai-api-key', 'ai-endpoint', 'ai-model']

export const PROVIDER_DEFAULTS = {
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-5-5'
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-6.1-terra'
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    model: 'gemini-3.8-flash'
  }
}

export function registerSettingsHooks () {
  Hooks.on('renderSettingsConfig', (_app, html) => {
    // Only GMs are shown the key (see registerApiKeySetting), so it is absent for players.
    const apiKeyInput = html.querySelector(`[name="${MODULE}.ai-api-key"]`)
    if (apiKeyInput) apiKeyInput.type = 'password'

    const providerSelect = html.querySelector(`[name="${MODULE}.ai-provider"]`)
    if (!providerSelect) return

    providerSelect.addEventListener('change', (e) => {
      const defaults = PROVIDER_DEFAULTS[e.target.value]
      if (!defaults) return

      const endpointInput = html.querySelector(`[name="${MODULE}.ai-endpoint"]`)
      const modelInput = html.querySelector(`[name="${MODULE}.ai-model"]`)
      if (endpointInput) endpointInput.value = defaults.endpoint
      if (modelInput) modelInput.value = defaults.model
    })
  })
}

export function registerSettings () {
  game.settings.register(MODULE, 'ai-provider', {
    name: 'COC7QOL.Settings.AIProvider.Name',
    hint: 'COC7QOL.Settings.AIProvider.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      anthropic: 'COC7QOL.Settings.AIProvider.Anthropic',
      openai: 'COC7QOL.Settings.AIProvider.OpenAI',
      gemini: 'COC7QOL.Settings.AIProvider.Gemini'
    },
    default: 'anthropic',
    onChange: (value) => {
      const defaults = PROVIDER_DEFAULTS[value]
      if (!defaults) return
      game.settings.set(MODULE, 'ai-endpoint', defaults.endpoint)
      game.settings.set(MODULE, 'ai-model', defaults.model)
    }
  })

  game.settings.register(MODULE, 'ai-endpoint', {
    name: 'COC7QOL.Settings.AIEndpoint.Name',
    hint: 'COC7QOL.Settings.AIEndpoint.Hint',
    scope: 'world',
    config: true,
    type: String,
    default: PROVIDER_DEFAULTS.anthropic.endpoint
  })

  game.settings.register(MODULE, 'ai-model', {
    name: 'COC7QOL.Settings.AIModel.Name',
    hint: 'COC7QOL.Settings.AIModel.Hint',
    scope: 'world',
    config: true,
    type: String,
    default: PROVIDER_DEFAULTS.anthropic.model
  })
}

/**
 * Register the API key. It is the module's only client-scoped setting, so it is the only one
 * Foundry would list for a player, who has no use for it: generation is a GM tool. Listing
 * it for GMs only keeps a player's settings window free of a page for this module.
 * Call during the 'setup' hook: `game.user` does not exist yet at 'init'.
 */
export function registerApiKeySetting () {
  game.settings.register(MODULE, 'ai-api-key', {
    name: 'COC7QOL.Settings.AIAPIKey.Name',
    hint: 'COC7QOL.Settings.AIAPIKey.Hint',
    scope: 'client',
    config: game.user.isGM,
    type: String,
    default: ''
  })
}
