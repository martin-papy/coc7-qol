// scripts/ai-generator/npc-confirmation-dialog.js
// Rich read-only preview dialog for AI-generated NPC actors.

import { escapeHtml, t, tf } from '../utils.js'
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

  #npcData      // { actorData, skillsRaw, weaponsData, possessionsData, warnings, llmData }
  #acceptCallback
  #regenerateCallback
  #cancelCallback
  #removedWeaponIndexes = new Set()
  #removedPossessionIndexes = new Set()

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

    // --- Weapons section ---
    const weaponsData = this.#npcData.weaponsData ?? []
    const weaponsHtml = this.#renderWeaponsSection(weaponsData)

    // --- Possessions section ---
    const possessionsData = this.#npcData.possessionsData ?? []
    const possessionsHtml = this.#renderPossessionsSection(possessionsData)

    // --- Narrative sections ---
    const narrativeSection = (label, text) => {
      if (!text) return ''
      return `
        <div class="coc7-npc-section">
          <div class="coc7-npc-section-label">${label}</div>
          <p class="coc7-npc-narrative">${escapeHtml(text)}</p>
        </div>`
    }

    // --- Warnings ---
    const warnings = this.#npcData.warnings ?? []
    const warningsHtml = this.#renderWarningsSection(warnings)

    // --- Buttons ---
    const buttonsHtml = `
      <div class="form-footer">
        <button type="button" data-action="accept" class="bright">${t('COC7QOL.AIGenerator.Button.Accept')}</button>
        <button type="button" data-action="regenerate">${t('COC7QOL.AIGenerator.Button.Regenerate')}</button>
        <button type="button" data-action="cancel">${t('COC7QOL.AIGenerator.Button.Cancel')}</button>
      </div>`

    div.innerHTML = identityHtml + charsHtml + skillsHtml + weaponsHtml + possessionsHtml
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionAppearance'), llm.physicalDescription)
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionPersonality'), llm.personalityTraits)
      + narrativeSection(t('COC7QOL.AIGenerator.NPCDialog.SectionBackground'), llm.background)
      + warningsHtml
      + buttonsHtml

    return div
  }

  _replaceHTML (result, content, _options) {
    content.replaceChildren(result)
  }

  async _onRender (_context, _options) {
    await super._onRender(_context, _options)
    const root = this.element
    if (!root) return
    this.#attachEquipRemoveListeners(root)
  }

  #attachEquipRemoveListeners (scope) {
    scope.querySelectorAll('.coc7-npc-equip-remove').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.preventDefault()
        const row = btn.closest('.coc7-npc-equip-row')
        if (!row) return
        const kind = row.dataset.equipKind
        const idx = Number(row.dataset.equipIndex)
        if (!Number.isInteger(idx)) return
        this.#toggleRemoved(kind, idx)
      })
    })
  }

  #toggleRemoved (kind, index) {
    const set = kind === 'weapon' ? this.#removedWeaponIndexes : this.#removedPossessionIndexes
    if (set.has(index)) set.delete(index)
    else set.add(index)
    this.#refreshEquipSection(kind)
  }

  #refreshEquipSection (kind) {
    const root = this.element
    if (!root) return
    const selector = `[data-section="${kind === 'weapon' ? 'weapons' : 'possessions'}"]`
    const oldSection = root.querySelector(selector)
    if (!oldSection) return
    const data = kind === 'weapon'
      ? (this.#npcData.weaponsData ?? [])
      : (this.#npcData.possessionsData ?? [])
    const html = kind === 'weapon'
      ? this.#renderWeaponsSection(data)
      : this.#renderPossessionsSection(data)
    const template = document.createElement('template')
    template.innerHTML = html.trim()
    const newSection = template.content.firstElementChild
    if (!newSection) return
    oldSection.replaceWith(newSection)
    this.#attachEquipRemoveListeners(newSection)
  }

  #renderWeaponsSection (weaponsData) {
    if (!weaponsData.length) return ''
    const total = weaponsData.length
    const kept = total - this.#removedWeaponIndexes.size
    const headerLabel = this.#removedWeaponIndexes.size > 0
      ? tf('COC7QOL.AIGenerator.NPC.Preview.WeaponsHeaderPartial', { kept, count: total })
      : tf('COC7QOL.AIGenerator.NPC.Preview.WeaponsHeader', { count: total })
    const removeTitle = t('COC7QOL.AIGenerator.NPC.Button.RemoveItem')

    const rows = weaponsData.map((w, i) => {
      const name = w?.name ?? ''
      const damage = w?.system?.range?.normal?.damage ?? ''
      const skill = w?.system?.skill?.main?.name ?? ''
      const detail = tf('COC7QOL.AIGenerator.NPC.Preview.WeaponRowDamage', {
        damage: escapeHtml(damage),
        skill: escapeHtml(skill)
      })
      const removed = this.#removedWeaponIndexes.has(i) ? ' coc7-ai-removed' : ''
      return `
        <div class="coc7-npc-equip-row${removed}" data-equip-kind="weapon" data-equip-index="${i}">
          <span class="coc7-npc-equip-name">${escapeHtml(name)}</span>
          <span class="coc7-npc-equip-detail">${detail}</span>
          <button type="button" class="coc7-npc-equip-remove" title="${escapeHtml(removeTitle)}" aria-label="${escapeHtml(removeTitle)}">×</button>
        </div>`
    }).join('')

    return `
      <div class="coc7-npc-section" data-section="weapons">
        <div class="coc7-npc-section-label">${escapeHtml(headerLabel)}</div>
        <div class="coc7-npc-equip-list">${rows}</div>
      </div>`
  }

  #renderPossessionsSection (possessionsData) {
    if (!possessionsData.length) return ''
    const total = possessionsData.length
    const kept = total - this.#removedPossessionIndexes.size
    const headerLabel = this.#removedPossessionIndexes.size > 0
      ? tf('COC7QOL.AIGenerator.NPC.Preview.PossessionsHeaderPartial', { kept, count: total })
      : tf('COC7QOL.AIGenerator.NPC.Preview.PossessionsHeader', { count: total })
    const removeTitle = t('COC7QOL.AIGenerator.NPC.Button.RemoveItem')

    const rows = possessionsData.map((p, i) => {
      const name = p?.name ?? ''
      const quantity = p?.system?.quantity ?? 1
      const qtyText = quantity > 1
        ? tf('COC7QOL.AIGenerator.NPC.Preview.PossessionRowQuantity', { quantity })
        : ''
      const removed = this.#removedPossessionIndexes.has(i) ? ' coc7-ai-removed' : ''
      return `
        <div class="coc7-npc-equip-row${removed}" data-equip-kind="possession" data-equip-index="${i}">
          <span class="coc7-npc-equip-name">${escapeHtml(name)}</span>
          <span class="coc7-npc-equip-detail">${escapeHtml(qtyText)}</span>
          <button type="button" class="coc7-npc-equip-remove" title="${escapeHtml(removeTitle)}" aria-label="${escapeHtml(removeTitle)}">×</button>
        </div>`
    }).join('')

    return `
      <div class="coc7-npc-section" data-section="possessions">
        <div class="coc7-npc-section-label">${escapeHtml(headerLabel)}</div>
        <div class="coc7-npc-equip-list">${rows}</div>
      </div>`
  }

  #renderWarningsSection (warnings) {
    if (!warnings.length) return ''
    const items = warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')
    return `
      <div class="coc7-npc-section coc7-ai-warnings">
        <div class="coc7-npc-section-label">${escapeHtml(t('COC7QOL.AIGenerator.NPC.Preview.WarningsHeader'))}</div>
        <ul class="coc7-ai-warnings-list">${items}</ul>
      </div>`
  }

  static async #handleAccept (_event, _target) {
    const data = this.#npcData
    const filteredWeapons = (data.weaponsData ?? [])
      .filter((_, i) => !this.#removedWeaponIndexes.has(i))
    const filteredPossessions = (data.possessionsData ?? [])
      .filter((_, i) => !this.#removedPossessionIndexes.has(i))
    await this.#acceptCallback({
      ...data,
      weaponsData: filteredWeapons,
      possessionsData: filteredPossessions
    })
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
