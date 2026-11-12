import { test } from 'node:test'
import assert from 'node:assert/strict'
import { systemNpcSheetClasses, makeResizable, RESIZABLE_CLASS } from '../scripts/npc-sheets/sheet-window.js'

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
