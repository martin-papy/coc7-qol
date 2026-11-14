import { t, tf } from '../utils.js'
import { resolveRoller } from './candidates.js'
import { buildGroupLuckView } from './dialog-view.js'

/**
 * Dialog where the Keeper ticks the investigators present and confirms who rolls Luck.
 */
export default class GroupLuckDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'coc7-group-luck',
    tag: 'div',
    window: {},
    position: { width: 420, height: 'auto' },
    actions: {
      confirm: GroupLuckDialog.#handleConfirm,
      cancel: GroupLuckDialog.#handleCancel
    }
  }

  get title () { return t('COC7QOL.GroupLuck.Title') }

  #candidates
  #tickedIds
  #preferredId = null
  #isConfirmed = false
  #onConfirm

  /**
   * @param {{ candidates: import('./candidates.js').Candidate[], onConfirm: (result: { roller: import('./candidates.js').Candidate, presentCount: number }) => Promise<void> }} config
   * @param {object} [options]
   */
  constructor ({ candidates, onConfirm }, options = {}) {
    super(options)
    this.#candidates = candidates
    this.#onConfirm = onConfirm
    this.#tickedIds = new Set(candidates.filter(candidate => candidate.isDefault).map(candidate => candidate.id))
  }

  #resolve () {
    return resolveRoller(this.#candidates, this.#tickedIds, this.#preferredId)
  }

  async _renderHTML (context, options) {
    const root = buildGroupLuckView(document, {
      candidates: this.#candidates,
      tickedIds: this.#tickedIds,
      resolution: this.#resolve()
    }, { t, tf })
    root.addEventListener('change', event => this.#handleChange(event))
    return root
  }

  _replaceHTML (result, content, options) {
    const focused = content.contains(document.activeElement) ? document.activeElement : null
    const focusKey = focused?.matches?.('input') ? { name: focused.name, value: focused.value } : null
    const scrollTop = content.querySelector('.coc7qol-group-luck-list')?.scrollTop
    content.replaceChildren(result)
    const list = result.querySelector('.coc7qol-group-luck-list')
    if (list && scrollTop) list.scrollTop = scrollTop
    if (!focusKey) return
    const inputs = result.querySelectorAll('input')
    Array.from(inputs)
      .find(node => node.name === focusKey.name && node.value === focusKey.value)
      ?.focus({ preventScroll: true })
  }

  #handleChange (event) {
    const target = event.target
    if (target.name === 'present') {
      const next = new Set(this.#tickedIds)
      if (target.checked) next.add(target.value)
      else next.delete(target.value)
      this.#tickedIds = next
    } else if (target.name === 'roller') {
      this.#preferredId = target.value
    } else {
      return
    }
    this.render()
  }

  static async #handleConfirm (event, target) {
    const { roller, presentCount } = this.#resolve()
    if (!roller || this.#isConfirmed) return
    this.#isConfirmed = true
    await this.close()
    await this.#onConfirm({ roller, presentCount })
  }

  static #handleCancel (event, target) {
    this.close()
  }
}
