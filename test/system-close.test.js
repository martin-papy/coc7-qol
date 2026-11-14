import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { closeWithSystemButton } from '../scripts/close-all-cards/system-close.js'

// A stand-in for the two things closeWithSystemButton leans on: Foundry's Hooks
// and a chat message CoC7 has registered its render hook for. The fake system
// behaves like coc7/hooks/render-chat-message-html.js and coc7/apps/check.js: it
// binds the card's click handler only after an await, and that handler reads
// event.currentTarget after an await of its own before it writes the closed
// card back through an update (which fires updateChatMessage).

const CLOSE_CARD = '<div class="keeper-only-block"><button data-action="toggleValue" data-set="cardOpen">Close card</button></div>'
const TIMEOUTS = { bindTimeoutMs: 40, closeTimeoutMs: 40 }

let dom
let hooks

function installHooks () {
  const handlers = new Map()
  let nextId = 1
  return {
    on (name, fn) {
      const id = nextId++
      handlers.set(id, { name, fn })
      return id
    },
    off (name, id) { handlers.delete(id) },
    callAll (name, ...args) {
      for (const handler of [...handlers.values()]) if (handler.name === name) handler.fn(...args)
    },
    count: name => [...handlers.values()].filter(handler => handler.name === name).length
  }
}

/**
 * A chat message whose render goes through the fake system.
 * @param {object} [options]
 * @param {string} [options.content]
 * @param {boolean} [options.binds]  Whether the system binds a click handler at all
 * @param {boolean} [options.closes]  Whether a click ends in an update that closes the card
 */
function makeMessage ({ content = CLOSE_CARD, binds = true, closes = true } = {}) {
  const message = {
    id: 'm1',
    flags: { CoC7: { load: { as: 'CoC7Check', cardOpen: true } } },
    clicks: 0,
    async renderHTML (context = {}) {
      const html = dom.window.document.createElement('li')
      html.innerHTML = content
      hooks.callAll('renderChatMessageHTML', message, html, context)
      return html
    }
  }
  // CoC7's render hook, registered before the module's (systems load first).
  hooks.on('renderChatMessageHTML', async (rendered, html) => {
    await Promise.resolve() // CoC7 resolves the card's actors before binding
    if (!binds) return
    html.querySelectorAll('button[data-action]').forEach(button => {
      button.addEventListener('click', async event => {
        rendered.clicks++
        await Promise.resolve()
        // Like check.js: the handler looks at the button only after an await. A plain
        // button.click() from script has reset currentTarget to null by then.
        if (event.currentTarget.dataset.set !== 'cardOpen') return
        if (!closes) return
        rendered.flags.CoC7.load.cardOpen = false
        hooks.callAll('updateChatMessage', rendered, {}, {}, 'u1')
      })
      button.addEventListener('click', () => {}) // the system's generic [data-action] listener
    })
  })
  return message
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><body></body>')
  hooks = installHooks()
  globalThis.Hooks = hooks
  globalThis.EventTarget = dom.window.EventTarget
})

afterEach(() => {
  delete globalThis.Hooks
  delete globalThis.EventTarget
})

test('closeWithSystemButton clicks the Close card button once the system has bound it', async () => {
  const message = makeMessage()

  assert.equal(await closeWithSystemButton(message, TIMEOUTS), true)
  assert.equal(message.clicks, 1)
  assert.equal(message.flags.CoC7.load.cardOpen, false)
})

test('closeWithSystemButton leaves no hook behind, whatever the outcome', async () => {
  for (const options of [{}, { binds: false }, { closes: false }, { content: '<p>no button</p>' }]) {
    hooks = installHooks()
    globalThis.Hooks = hooks
    await closeWithSystemButton(makeMessage(options), TIMEOUTS)

    assert.equal(hooks.count('renderChatMessageHTML'), 1, 'only the system hook is left')
    assert.equal(hooks.count('updateChatMessage'), 0)
  }
})

test('closeWithSystemButton gives up on a card without a Close card button', async () => {
  const message = makeMessage({ content: '<button data-action="rollNoPlayers">Start rolls</button>' })

  assert.equal(await closeWithSystemButton(message, TIMEOUTS), false)
  assert.equal(message.clicks, 0)
})

test('closeWithSystemButton does not click a button the system never bound', async () => {
  const message = makeMessage({ binds: false })

  assert.equal(await closeWithSystemButton(message, TIMEOUTS), false)
  assert.equal(message.clicks, 0)
})

test('closeWithSystemButton reports a click the system did not answer with a closed card', async () => {
  const message = makeMessage({ closes: false })

  assert.equal(await closeWithSystemButton(message, TIMEOUTS), false)
  assert.equal(message.clicks, 1)
})

test('closeWithSystemButton ignores an update that leaves the card open', async () => {
  const message = makeMessage({ closes: false })
  const closing = closeWithSystemButton(message, TIMEOUTS)
  setTimeout(() => hooks.callAll('updateChatMessage', message, {}, {}, 'u1'), 10)

  assert.equal(await closing, false)
})

test('closeWithSystemButton is not confused by another render of the same message', async () => {
  const message = makeMessage()
  const render = message.renderHTML
  // While the card is being closed, the chat log re-renders it (no mark in the context).
  message.renderHTML = async context => {
    await render({})
    return render(context)
  }

  assert.equal(await closeWithSystemButton(message, TIMEOUTS), true)
  assert.equal(message.clicks, 1)
})

test('closeWithSystemButton skips a missing or already closed message', async () => {
  const closed = makeMessage()
  closed.flags.CoC7.load.cardOpen = false

  assert.equal(await closeWithSystemButton(undefined, TIMEOUTS), false)
  assert.equal(await closeWithSystemButton(closed, TIMEOUTS), false)
  assert.equal(closed.clicks, 0)
})
