import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { stashChildren } from '../scripts/ai-generator/dialog-flow.js'

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
