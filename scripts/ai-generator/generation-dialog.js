import { escapeHtml, t } from '../utils.js'
import { runAccept } from './dialog-flow.js'

export default class CoC7AIGenerationDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    window: { resizable: true },
    position: { width: 480, height: 'auto' },
    actions: {
      accept: CoC7AIGenerationDialog.#handleAccept,
      regenerate: CoC7AIGenerationDialog.#handleRegenerate,
      cancel: CoC7AIGenerationDialog.#handleCancel
    }
  }

  get title () { return t('COC7QOL.AIGenerator.WeaponDialog.Title') }

  #itemData
  #acceptCallback
  #regenerateCallback
  #cancelCallback
  // Set once Accept succeeds or Regenerate is chosen; any other close counts as Cancel.
  #settled = false
  // True while the accept callback runs; close() is refused meanwhile.
  #accepting = false

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
        <label>${t('CoC7.Name')}</label>
        <input type="text" name="ai-item-name" value="${escapeHtml(this.#itemData.name)}">
      </div>
      <dl class="ai-item-stats">
        <div><dt>${t('COC7QOL.AIGenerator.WeaponDialog.FieldDamage')}</dt><dd>${escapeHtml(s.range.normal.damage)}</dd></div>
        <div><dt>${t('COC7QOL.AIGenerator.WeaponDialog.FieldSkill')}</dt><dd>${escapeHtml(s.skill.main.name)}</dd></div>
        <div><dt>${t('COC7QOL.AIGenerator.WeaponDialog.FieldRange')}</dt><dd>${escapeHtml(s.range.normal.value || '—')}</dd></div>
        <div><dt>${t('COC7QOL.AIGenerator.WeaponDialog.FieldUsesPerRound')}</dt><dd>${escapeHtml(s.usesPerRound.normal)}</dd></div>
        <div><dt>${t('COC7QOL.AIGenerator.WeaponDialog.FieldBullets')}</dt><dd>${escapeHtml(String(s.bullets ?? '—'))}</dd></div>
        <div><dt>${t('COC7QOL.AIGenerator.WeaponDialog.FieldMalfunction')}</dt><dd>${escapeHtml(String(s.malfunction ?? '—'))}</dd></div>
      </dl>
      <div class="ai-item-description">
        <p>${s.description.value /* escaped by the weapon mapper; rendered as the item sheet will */}</p>
      </div>
      <div class="form-footer">
        <button type="button" data-action="accept" class="bright">${t('COC7QOL.AIGenerator.Button.Accept')}</button>
        <button type="button" data-action="regenerate">${t('COC7QOL.AIGenerator.Button.Regenerate')}</button>
        <button type="button" data-action="cancel">${t('COC7QOL.AIGenerator.Button.Cancel')}</button>
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

  static async #handleAccept (_event, _target) {
    this.#accepting = true
    let created
    try {
      created = await runAccept(this.element, () => this.#acceptCallback(this.itemData))
    } finally {
      this.#accepting = false
    }
    if (!created) return
    this.#settled = true
    this.close()
  }

  static async #handleRegenerate (_event, _target) {
    this.#settled = true
    this.#regenerateCallback()
    this.close()
  }

  static async #handleCancel (_event, _target) {
    this.close()
  }

  /**
   * Escape or the header close button while Accept is creating the document would cancel a
   * creation already under way, so a close is ignored until Accept settles.
   */
  close (options) {
    if (this.#accepting) return Promise.resolve(this)
    return super.close(options)
  }

  /** Closing from the header or with Escape cancels, like the Cancel button. */
  _onClose (options) {
    super._onClose(options)
    if (this.#settled) return
    this.#settled = true
    this.#cancelCallback()
  }
}
