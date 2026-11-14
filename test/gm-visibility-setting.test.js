import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { registerGmVisibilitySettings, SETTING_KEY } from '../scripts/gm-visibility/settings.js'

afterEach(() => {
  delete globalThis.game
  delete globalThis.ui
  delete globalThis.foundry
})

/**
 * Stand-ins for the Foundry globals the setting touches: two messages shown in the chat log
 * (one more exists but is not shown), an open item sheet, a closed one, and an actor sheet.
 */
function setUp ({ isGM }) {
  const configs = new Map()
  const updated = []
  const rendered = []
  const log = new JSDOM(`<ol>
    <li class="message" data-message-id="m1"></li>
    <li class="message" data-message-id="m2"></li>
  </ol>`).window.document.querySelector('ol')
  const messages = new Map(['m1', 'm2', 'm3'].map(id => [id, { id }]))
  const sheet = (name, documentName, isRendered) => ({ rendered: isRendered, document: { documentName }, render: () => rendered.push(name) })

  globalThis.game = {
    user: { isGM },
    messages,
    settings: { register: (_module, key, config) => configs.set(key, config) }
  }
  globalThis.ui = { chat: { element: log, updateMessage: message => updated.push(message.id) } }
  globalThis.foundry = {
    applications: {
      instances: new Map([
        ['a', sheet('open item', 'Item', true)],
        ['b', sheet('closed item', 'Item', false)],
        ['c', sheet('open actor', 'Actor', true)]
      ])
    }
  }

  registerGmVisibilitySettings()
  return { config: configs.get(SETTING_KEY), updated, rendered }
}

test('toggling Keeper-only highlights reloads no client', () => {
  const { config } = setUp({ isGM: true })

  assert.equal(config.requiresReload ?? false, false)
})

test('on a GM client, toggling re-renders the shown chat messages and open item sheets only', () => {
  const { config, updated, rendered } = setUp({ isGM: true })

  config.onChange(false)

  assert.deepEqual(updated, ['m1', 'm2'])
  assert.deepEqual(rendered, ['open item'])
})

test('on a player client, toggling re-renders nothing', () => {
  const { config, updated, rendered } = setUp({ isGM: false })

  config.onChange(true)

  assert.deepEqual(updated, [])
  assert.deepEqual(rendered, [])
})
