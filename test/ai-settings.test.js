import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerSettings } from '../scripts/ai-generator/settings.js'

/**
 * Registers the AI settings against a stand-in for game.settings, then plays a provider change
 * the way Foundry does: the setting's onChange runs on every connected client.
 */
function changeProviderOnEveryClient (value) {
  const configs = new Map()
  const writes = []
  globalThis.game = {
    settings: {
      register: (_module, key, config) => configs.set(key, config),
      set: (_module, key, val) => { writes.push({ key, val }); return Promise.resolve(val) }
    }
  }
  try {
    registerSettings()
    configs.get('ai-provider').onChange?.(value)
  } finally {
    delete globalThis.game
  }
  return writes
}

test('changing the AI provider writes no other setting from the clients that receive the change', () => {
  const writes = changeProviderOnEveryClient('openai')

  assert.deepEqual(writes, [])
})
