import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { stashChildren, runAccept } from '../scripts/ai-generator/dialog-flow.js'

/** The Create Actor dialog as Foundry v13/v14 renders it: fields, then the footer inside the form. */
function createDialog () {
  const dom = new JSDOM(`
    <form>
      <div class="form-group"><input name="name" value=""></div>
      <div class="form-group"><select name="type"><option value="character">Investigator</option><option value="npc">NPC</option></select></div>
      <div class="form-group"><select name="folder"><option value="">-</option><option value="f1">Cultists</option></select></div>
      <footer class="form-footer"><button type="submit" data-action="ok">Create Actor</button><button type="button" class="coc7-ai-generate-btn"></button></footer>
    </form>`)
  const doc = dom.window.document
  return { dom, form: doc.querySelector('form'), footer: doc.querySelector('footer') }
}

test('stashChildren then restore gives back the original fields with their selections', () => {
  const { dom, form, footer } = createDialog()
  form.querySelector('[name="type"]').value = 'npc'
  form.querySelector('[name="folder"]').value = 'f1'
  form.querySelector('[name="name"]').value = 'Silas'

  const restore = stashChildren(form, footer)
  form.insertBefore(dom.window.document.createElement('textarea'), footer)
  restore()

  assert.equal(form.querySelector('[name="type"]').value, 'npc')
  assert.equal(form.querySelector('[name="folder"]').value, 'f1')
  assert.equal(form.querySelector('[name="name"]').value, 'Silas')
  assert.equal(form.querySelector('textarea'), null, 'content added meanwhile is gone')
  assert.equal(form.lastElementChild, footer, 'order is kept')
})

test('stashChildren leaves the kept node in place and removes the others', () => {
  const { form, footer } = createDialog()

  stashChildren(form, footer)

  assert.deepEqual([...form.children], [footer])
})

test('listeners on stashed nodes still fire after restore', () => {
  const { dom, form, footer } = createDialog()
  const typeSelect = form.querySelector('[name="type"]')
  const aiBtn = footer.querySelector('.coc7-ai-generate-btn')
  let changes = 0
  let clicks = 0
  typeSelect.addEventListener('change', () => changes++)
  aiBtn.addEventListener('click', () => clicks++)

  const restoreFields = stashChildren(form, footer)
  const restoreButtons = stashChildren(footer)
  footer.innerHTML = '<button>Generate</button>'
  restoreButtons()
  restoreFields()

  form.querySelector('[name="type"]').dispatchEvent(new dom.window.Event('change'))
  footer.querySelector('.coc7-ai-generate-btn').click()
  assert.equal(changes, 1)
  assert.equal(clicks, 1)
})

function reviewDialog () {
  const dom = new JSDOM('<div class="window-content"><button data-action="accept"></button><button data-action="regenerate"></button><button data-action="cancel"></button></div>')
  const root = dom.window.document.querySelector('.window-content')
  return { root, buttons: [...root.querySelectorAll('button')] }
}

/** A promise with its resolve/reject exposed, to hold an accept callback open. */
function deferred () {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('runAccept disables every button while the accept callback runs', async () => {
  const { root, buttons } = reviewDialog()
  const gate = deferred()

  const pending = runAccept(root, () => gate.promise)
  assert.ok(buttons.every(b => b.disabled))
  gate.resolve(true)
  await pending
})

test('runAccept returns true and leaves the buttons disabled when the callback succeeds', async () => {
  const { root, buttons } = reviewDialog()

  assert.equal(await runAccept(root, async () => true), true)
  assert.ok(buttons.every(b => b.disabled))
})

test('runAccept returns false and re-enables the buttons when the callback reports failure', async () => {
  const { root, buttons } = reviewDialog()

  assert.equal(await runAccept(root, async () => false), false)
  assert.ok(buttons.every(b => !b.disabled))
})

test('runAccept re-enables the buttons and rethrows when the callback throws', async () => {
  const { root, buttons } = reviewDialog()

  await assert.rejects(runAccept(root, async () => { throw new Error('boom') }), /boom/)
  assert.ok(buttons.every(b => !b.disabled))
})

test('a second runAccept while the first is pending does not call the callback again', async () => {
  const { root } = reviewDialog()
  const gate = deferred()
  let calls = 0
  const accept = () => { calls++; return gate.promise }

  const first = runAccept(root, accept)
  const second = await runAccept(root, accept)
  gate.resolve(true)

  assert.equal(second, false)
  assert.equal(await first, true)
  assert.equal(calls, 1)
})

test('runAccept can run again after a failed attempt', async () => {
  const { root } = reviewDialog()

  await runAccept(root, async () => false)
  assert.equal(await runAccept(root, async () => true), true)
})
