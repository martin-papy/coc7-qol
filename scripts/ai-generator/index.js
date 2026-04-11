// scripts/ai-generator/index.js
// Entry point for the AI Generator feature.
// All other files in this directory are imported from here.
// Only this file is listed in module.json esmodules.

import { registerSettings } from './settings.js'
import * as providers from './providers/registry.js'
import AnthropicProvider from './providers/anthropic.js'
import OpenAIProvider from './providers/openai.js'
import GeminiProvider from './providers/gemini.js'
import * as mappers from './mappers/registry.js'
import WeaponMapper from './mappers/weapon.js'
import { injectAIButton } from './dialog-injector.js'

// Register providers and mappers at module load time (pure in-memory, no Foundry API needed)
providers.register('anthropic', AnthropicProvider)
providers.register('openai', OpenAIProvider)
providers.register('gemini', GeminiProvider)
mappers.register('weapon', WeaponMapper)

// Settings must be registered during the 'init' hook
Hooks.once('init', registerSettings)

// Inject the AI button whenever any dialog renders — injectAIButton checks internally
// whether the dialog is the "Create Item" dialog before doing anything.
Hooks.on('renderDialogV2', injectAIButton)
