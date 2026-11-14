import { test } from 'node:test'
import assert from 'node:assert/strict'
import { systemNpcSheetClasses, makeResizable, keepInViewport, RESIZABLE_CLASS } from '../scripts/npc-sheets/sheet-window.js'

// --- systemNpcSheetClasses -------------------------------------------------

class NpcSheet {}
class CreatureSheet extends NpcSheet {}
class InvestigatorSheet {}
class ThirdPartyNpcSheet {}

/** CONFIG.Actor.sheetClasses as CoC7 9.1 fills it, plus a sheet registered by another module. */
const SHEET_CLASSES = {
  character: { 'CoC7.CoC7ModelsActorCharacterSheetV3': { cls: InvestigatorSheet } },
  npc: {
    'CoC7.CoC7ModelsActorNPCSheetV2': { cls: NpcSheet },
    'other-module.FancyNpcSheet': { cls: ThirdPartyNpcSheet }
  },
  creature: { 'CoC7.CoC7ModelsActorCreatureSheetV2': { cls: CreatureSheet } }
}

test('systemNpcSheetClasses returns the system sheets registered for NPCs and Creatures', () => {
  assert.deepEqual(systemNpcSheetClasses(SHEET_CLASSES, 'CoC7'), [NpcSheet, CreatureSheet])
})

test('systemNpcSheetClasses leaves out sheets registered by other packages and other actor types', () => {
  const classes = systemNpcSheetClasses(SHEET_CLASSES, 'CoC7')
  assert.equal(classes.includes(ThirdPartyNpcSheet), false)
  assert.equal(classes.includes(InvestigatorSheet), false)
})

test('systemNpcSheetClasses returns nothing when the registry or an actor type is missing', () => {
  assert.deepEqual(systemNpcSheetClasses(undefined, 'CoC7'), [])
  assert.deepEqual(systemNpcSheetClasses({ npc: SHEET_CLASSES.npc }, 'CoC7'), [NpcSheet])
})

// --- makeResizable ---------------------------------------------------------

test('makeResizable turns on window.resizable and keeps the class\'s other options', () => {
  class Sheet { static DEFAULT_OPTIONS = { classes: ['npc'], position: { width: 650 } } }

  makeResizable(Sheet)

  assert.deepEqual(Sheet.DEFAULT_OPTIONS, { classes: ['npc', RESIZABLE_CLASS], position: { width: 650 }, window: { resizable: true } })
})

test('makeResizable marks the window with a class of the module\'s own, not the system\'s npc class', () => {
  class Sheet { static DEFAULT_OPTIONS = {} }

  makeResizable(Sheet)

  assert.deepEqual(Sheet.DEFAULT_OPTIONS.classes, [RESIZABLE_CLASS])
  assert.notEqual(RESIZABLE_CLASS, 'npc')
})

test('makeResizable keeps existing window options and does not mutate the original object', () => {
  const original = { window: { title: 'NPC', resizable: false } }
  class Sheet { static DEFAULT_OPTIONS = original }

  makeResizable(Sheet)

  assert.deepEqual(Sheet.DEFAULT_OPTIONS.window, { title: 'NPC', resizable: true })
  assert.deepEqual(original, { window: { title: 'NPC', resizable: false } })
})

test('makeResizable on a subclass without its own options leaves the parent class untouched', () => {
  class Parent { static DEFAULT_OPTIONS = { position: { width: 650 } } }
  class Child extends Parent {}

  makeResizable(Child)

  assert.equal(Object.hasOwn(Child, 'DEFAULT_OPTIONS'), true)
  assert.deepEqual(Child.DEFAULT_OPTIONS, { classes: [RESIZABLE_CLASS], window: { resizable: true } })
  assert.deepEqual(Parent.DEFAULT_OPTIONS, { position: { width: 650 } })
})

// --- keepInViewport --------------------------------------------------------

const VIEWPORT_HEIGHT = 1080

/** Stand-ins for the browser pieces keepInViewport touches; `resize()` plays a size change. */
function setup ({ bottom, minimized = false } = {}) {
  const doc = { documentElement: { clientHeight: VIEWPORT_HEIGHT } }
  const observers = []
  class Observer {
    constructor (callback) {
      this.callback = callback
      this.observed = []
      this.disconnected = false
      observers.push(this)
    }

    observe (element) { this.observed.push(element) }
    disconnect () { this.disconnected = true }
  }
  const element = { isConnected: true, ownerDocument: doc, bottom, getBoundingClientRect () { return { bottom: this.bottom } } }
  const app = { element, minimized, repositioned: 0, setPosition () { this.repositioned++ } }
  return { app, element, observers, env: { Observer, doc }, resize: () => observers[0].callback() }
}

test('keepInViewport re-positions a sheet that has grown past the bottom of the viewport', () => {
  const { app, env, resize } = setup({ bottom: VIEWPORT_HEIGHT + 243 })
  keepInViewport(app, env)

  resize()

  assert.equal(app.repositioned, 1)
})

test('keepInViewport leaves a sheet alone while it still fits on screen', () => {
  const { app, env, resize } = setup({ bottom: VIEWPORT_HEIGHT })
  keepInViewport(app, env)

  resize()

  assert.equal(app.repositioned, 0)
})

test('keepInViewport ignores a minimized sheet', () => {
  const { app, env, resize } = setup({ bottom: VIEWPORT_HEIGHT + 100, minimized: true })
  keepInViewport(app, env)

  resize()

  assert.equal(app.repositioned, 0)
})

test('keepInViewport ignores a sheet detached into another browser window', () => {
  const { app, element, env, resize } = setup({ bottom: VIEWPORT_HEIGHT + 100 })
  element.ownerDocument = { documentElement: { clientHeight: 400 } }
  keepInViewport(app, env)

  resize()

  assert.equal(app.repositioned, 0)
})

test('keepInViewport watches a window once, however often the sheet re-renders', () => {
  const { app, element, observers, env } = setup({ bottom: 500 })

  keepInViewport(app, env)
  keepInViewport(app, env)

  assert.equal(observers.length, 1)
  assert.deepEqual(observers[0].observed, [element])
})

test('keepInViewport stops watching once the window has been closed', () => {
  const { app, element, observers, env, resize } = setup({ bottom: VIEWPORT_HEIGHT + 100 })
  keepInViewport(app, env)
  element.isConnected = false

  resize()

  assert.equal(observers[0].disconnected, true)
  assert.equal(app.repositioned, 0)
})

test('keepInViewport does nothing for a sheet that has no window yet', () => {
  const { observers, env } = setup()

  keepInViewport({ element: null }, env)

  assert.equal(observers.length, 0)
})
