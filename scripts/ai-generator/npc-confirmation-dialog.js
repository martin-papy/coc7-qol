// scripts/ai-generator/npc-confirmation-dialog.js
// Rich read-only preview dialog for AI-generated NPC actors.

import { escapeHtml, t } from '../utils.js'
import { CHARACTERISTIC_FORMULAS } from './mappers/npc.js'

export default class CoC7NPCConfirmationDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    window: {},
    position: { width: 520, height: 'auto' },
    actions: {
      accept: CoC7NPCConfirmationDialog.#handleAccept,
      regenerate: CoC7NPCConfirmationDialog.#handleRegenerate,
      cancel: CoC7NPCConfirmationDialog.#handleCancel
    }
  }

  get title () { return t('COC7QOL.AIGenerator.NPCDialog.Title') }

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
          ${llm.occupation ? `<span><span class="coc7-npc-identity-meta-label">${t('CoC7.Occupation')}</span>&nbsp;${escapeHtml(llm.occupation)}</span>` : ''}
          ${llm.age ? `<span><span class="coc7-npc-identity-meta-label">${t('CoC7.Age')}</span>&nbsp;${escapeHtml(String(llm.age))}</span>` : ''}
        </div>
      </div>`

    // --- Characteristics grid ---
    const charLabels = ['CHARAC.STR', 'CHARAC.CON', 'CHARAC.SIZ', 'CHARAC.DEX', 'CHARAC.APP', 'CHARAC.INT', 'CHARAC.POW', 'CHARAC.EDU'].map(k => t(k))
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
        <div class="coc7-npc-section-label">${t('COC7QOL.AIGenerator.NPCDialog.SectionCharacteristics')}</div>
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
        <div class="coc7-npc-section-label">${t('COC7QOL.AIGenerator.NPCDialog.SectionSkills')}</div>
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
        <button type="button" data-action="accept" class="bright">${t('COC7QOL.AIGenerator.Button.Accept')}</button>
        <button type="button" data-action="regenerate">${t('COC7QOL.AIGenerator.Button.Regenerate')}</button>
        <button type="button" data-action="cancel">${t('COC7QOL.AIGenerator.Button.Cancel')}</button>
      </div>`

    div.innerHTML = identityHtml + charsHtml + skillsHtml
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionAppearance'), llm.physicalDescription)
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionPersonality'), llm.personalityTraits)
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionBackground'), llm.background)
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
