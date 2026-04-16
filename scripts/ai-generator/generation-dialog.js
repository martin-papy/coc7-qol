import { escapeHtml } from '../utils.js'

export default class CoC7AIGenerationDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    window: { title: 'CoC7 AI Generator — Review Weapon' },
    position: { width: 480, height: 'auto' },
    actions: {
      accept: CoC7AIGenerationDialog.#handleAccept,
      regenerate: CoC7AIGenerationDialog.#handleRegenerate,
      cancel: CoC7AIGenerationDialog.#handleCancel
    }
  }

  #itemData
  #acceptCallback
  #regenerateCallback
  #cancelCallback

  constructor ({ itemData, onAccept, onRegenerate, onCancel } = {}, options = {}) {
    super(options)
    this.#itemData = itemData ?? {}
    this.#acceptCallback = onAccept ?? (() => {})
    this.#regenerateCallback = onRegenerate ?? (() => {})
    this.#cancelCallback = onCancel ?? (() => {})
  }

  async _renderHTML (context, options) {
    const s = this.#itemData.system
    const div = document.createElement('div')
    div.className = 'coc7-ai-generation-dialog'
    div.innerHTML = `
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="ai-item-name" value="${escapeHtml(this.#itemData.name)}">
      </div>
      <dl class="ai-item-stats">
        <div><dt>Damage</dt><dd>${escapeHtml(s.range.normal.damage)}</dd></div>
        <div><dt>Skill</dt><dd>${escapeHtml(s.skill.main.name)}</dd></div>
        <div><dt>Range</dt><dd>${escapeHtml(s.range.normal.value || '—')}</dd></div>
        <div><dt>Uses/Round</dt><dd>${escapeHtml(s.usesPerRound.normal)}</dd></div>
        <div><dt>Bullets</dt><dd>${escapeHtml(String(s.bullets ?? '—'))}</dd></div>
        <div><dt>Malfunction</dt><dd>${escapeHtml(String(s.malfunction ?? '—'))}</dd></div>
      </dl>
      <div class="ai-item-description">
        <p>${escapeHtml(s.description.value)}</p>
      </div>
      <div class="form-footer">
        <button type="button" data-action="accept" class="bright">Accept</button>
        <button type="button" data-action="regenerate">Regenerate</button>
        <button type="button" data-action="cancel">Cancel</button>
      </div>
    `
    return div
  }

  _replaceHTML (result, content, options) {
    content.replaceChildren(result)
  }

  get itemData () {
    const nameInput = this.element?.querySelector('[name="ai-item-name"]')
    if (nameInput?.value?.trim()) this.#itemData.name = nameInput.value.trim()
    return this.#itemData
  }

  static async #handleAccept (event, target) {
    await this.#acceptCallback(this.itemData)
    this.close()
  }

  static async #handleRegenerate (event, target) {
    this.#regenerateCallback()
    this.close()
  }

  static async #handleCancel (event, target) {
    this.#cancelCallback()
    this.close()
  }
}
