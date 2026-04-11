const MODULE = 'coc7-qol'

export const PROVIDER_DEFAULTS = {
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-6'
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o'
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    model: 'gemini-2.0-flash'
  }
}

export function registerSettingsHooks () {
  Hooks.on('renderSettingsConfig', (_app, html) => {
    const apiKeyInput = html.querySelector(`[name="${MODULE}.ai-api-key"]`)
    if (apiKeyInput) {
      if (!game.user.isGM) {
        // Non-GMs have no use for the API key field — hide the whole row
        apiKeyInput.closest('.form-group')?.remove()
      } else {
        apiKeyInput.type = 'password'
      }
    }

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
    name: 'AI Generator: Provider',
    hint: 'LLM provider used for item generation. Changing this auto-updates the endpoint and model to provider defaults.',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      anthropic: 'Anthropic (Claude)',
      openai: 'OpenAI (GPT)',
      gemini: 'Google (Gemini)'
    },
    default: 'anthropic',
    onChange: (value) => {
      const defaults = PROVIDER_DEFAULTS[value]
      if (!defaults) return
      game.settings.set(MODULE, 'ai-endpoint', defaults.endpoint)
      game.settings.set(MODULE, 'ai-model', defaults.model)
    }
  })

  game.settings.register(MODULE, 'ai-api-key', {
    name: 'AI Generator: API Key',
    hint: 'Your API key for the selected provider. Stored only in your browser (localStorage) — never sent to other players.',
    scope: 'client',
    config: true,
    type: String,
    default: ''
  })

  game.settings.register(MODULE, 'ai-endpoint', {
    name: 'AI Generator: Endpoint URL',
    hint: 'API endpoint URL. Updated automatically when changing provider. Override for custom deployments.',
    scope: 'world',
    config: true,
    type: String,
    default: PROVIDER_DEFAULTS.anthropic.endpoint
  })

  game.settings.register(MODULE, 'ai-model', {
    name: 'AI Generator: Model',
    hint: 'Model name. Updated automatically when changing provider. Override for custom or newer models.',
    scope: 'world',
    config: true,
    type: String,
    default: PROVIDER_DEFAULTS.anthropic.model
  })
}
