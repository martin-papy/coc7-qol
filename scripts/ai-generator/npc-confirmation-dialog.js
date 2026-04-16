// scripts/ai-generator/npc-confirmation-dialog.js
// Rich read-only preview dialog for AI-generated NPC actors.

import { escapeHtml } from '../utils.js'
import { CHARACTERISTIC_FORMULAS } from './mappers/npc.js'

export default class CoC7NPCConfirmationDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    window: { title: 'CoC7 AI Generator — Review NPC' },
    position: { width: 520, height: 'auto' },
    actions: {
      accept: CoC7NPCConfirmationDialog.#handleAccept,
      regenerate: CoC7NPCConfirmationDialog.#handleRegenerate,
      cancel: CoC7NPCConfirmationDialog.#handleCancel
    }
  }

  #npcData      // { actorData, skillsRaw, llmData } from mapper.toFoundryData()
  #acceptCallback
  #regenerateCallback
  #cancelCallback

  constructor ({ npcData, onAccept, onRegenerate, onCancel } = {}, options = {}) {
    super(options)
    this.#npcData = npcData ?? {}
    this.#acceptCallback = onAccept ?? (() => {})
    this.#regenerateCallback = onRegenerate ?? (() => {})
    this.#cancelCallback = onCancel ?? (() => {})
  }

  get npcData () {
    return this.#npcData
  }

  async _renderHTML (_context, _options) {
    const llm = this.#npcData.llmData ?? {}
    const chars = llm.characteristics ?? {}
    const skills = llm.skills ?? []

    const div = document.createElement('div')
    div.className = 'coc7-ai-npc-dialog'

    // --- Identity bar ---
    const identityHtml = `
      <div class="coc7-npc-identity">
        <div class="coc7-npc-identity-name">${escapeHtml(llm.name)}</div>
        <div class="coc7-npc-identity-meta">
          ${llm.occupation ? `<span><span class="coc7-npc-identity-meta-label">Occupation</span>&nbsp;${escapeHtml(llm.occupation)}</span>` : ''}
          ${llm.age ? `<span><span class="coc7-npc-identity-meta-label">Age</span>&nbsp;${escapeHtml(String(llm.age))}</span>` : ''}
        </div>
      </div>`

    // --- Characteristics grid ---
    const charLabels = ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU']
    const charKeys = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']
    const isRandom = this.#npcData.randomCharacteristics ?? false
    const charCells = charKeys.map((k, i) => {
      const displayValue = isRandom
        ? CHARACTERISTIC_FORMULAS[k]
        : String(chars[k] ?? '—')
      return `
      <div class="coc7-npc-char-cell">
        <div class="coc7-npc-char-label">${charLabels[i]}</div>
        <div class="coc7-npc-char-value">${escapeHtml(displayValue)}</div>
      </div>`
    }).join('')

    const charsHtml = `
      <div class="coc7-npc-section">
        <div class="coc7-npc-section-label">Characteristics</div>
        <div class="coc7-npc-chars-grid">${charCells}</div>
      </div>`

    // --- Skills list ---
    const skillRows = skills.map(s => `
      <div class="coc7-npc-skill-row">
        <span class="coc7-npc-skill-name">${escapeHtml(s.name)}</span>
        <span class="coc7-npc-skill-value">${escapeHtml(String(s.value))}%</span>
      </div>`).join('')

    const skillsHtml = skills.length ? `
      <div class="coc7-npc-section">
        <div class="coc7-npc-section-label">Skills</div>
        <div class="coc7-npc-skills-grid">${skillRows}</div>
      </div>` : ''

    // --- Narrative sections ---
    const narrativeSection = (label, text) => {
      if (!text) return ''
      return `
        <div class="coc7-npc-section">
          <div class="coc7-npc-section-label">${label}</div>
          <p class="coc7-npc-narrative">${escapeHtml(text)}</p>
        </div>`
    }

    // --- Buttons ---
    const buttonsHtml = `
      <div class="form-footer">
        <button type="button" data-action="accept" class="bright">Accept</button>
        <button type="button" data-action="regenerate">Regenerate</button>
        <button type="button" data-action="cancel">Cancel</button>
      </div>`

    div.innerHTML = identityHtml + charsHtml + skillsHtml
      + narrativeSection('Appearance', llm.physicalDescription)
      + narrativeSection('Personality', llm.personalityTraits)
      + narrativeSection('Background', llm.background)
      + buttonsHtml

    return div
  }

  _replaceHTML (result, content, _options) {
    content.replaceChildren(result)
  }

  static async #handleAccept (_event, _target) {
    await this.#acceptCallback(this.#npcData)
    this.close()
  }

  static async #handleRegenerate (_event, _target) {
    this.#regenerateCallback()
    this.close()
  }

  static async #handleCancel (_event, _target) {
    this.#cancelCallback()
    this.close()
  }
}
