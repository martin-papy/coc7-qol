// scripts/ai-generator/npc-confirmation-dialog.js
// Rich read-only preview dialog for AI-generated NPC actors.

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
      <div class="coc7-npc-identity" style="background:var(--color-cool-5,#1a1a2e);padding:0.75rem 1rem;border-bottom:1px solid var(--color-border-dark,#333)">
        <div style="font-size:1.2rem;font-weight:bold;color:var(--color-warm-2,#e8d5b7);margin-bottom:0.2rem">${this.#esc(llm.name)}</div>
        <div style="display:flex;gap:1.5rem;font-size:0.85rem;color:var(--color-text-light-6,#aaa)">
          ${llm.occupation ? `<span><span style="color:var(--color-text-light-8,#888)">Occupation</span>&nbsp;${this.#esc(llm.occupation)}</span>` : ''}
          ${llm.age ? `<span><span style="color:var(--color-text-light-8,#888)">Age</span>&nbsp;${this.#esc(String(llm.age))}</span>` : ''}
        </div>
      </div>`

    // --- Characteristics grid ---
    const charLabels = ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU']
    const charKeys = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']
    const charCells = charKeys.map((k, i) => `
      <div style="text-align:center;background:var(--color-cool-5-75,#111);border-radius:4px;padding:0.35rem 0">
        <div style="font-size:0.65rem;color:var(--color-text-light-8,#888)">${charLabels[i]}</div>
        <div style="font-size:1rem;font-weight:bold;color:var(--color-warm-2,#c9a96e)">${this.#esc(String(chars[k] ?? '—'))}</div>
      </div>`).join('')

    const charsHtml = `
      <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--color-border-dark,#333)">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-text-light-8,#888);margin-bottom:0.5rem">Characteristics</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.4rem">${charCells}</div>
      </div>`

    // --- Skills list ---
    const skillRows = skills.map(s => `
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--color-cool-5-75,#1f1f1f);padding:0.15rem 0">
        <span style="color:var(--color-text-light-3,#ccc)">${this.#esc(s.name)}</span>
        <span style="color:var(--color-warm-2,#c9a96e);font-weight:bold">${this.#esc(String(s.value))}%</span>
      </div>`).join('')

    const skillsHtml = skills.length ? `
      <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--color-border-dark,#333)">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-text-light-8,#888);margin-bottom:0.5rem">Skills</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.25rem 1rem;font-size:0.85rem">${skillRows}</div>
      </div>` : ''

    // --- Narrative sections ---
    const narrativeSection = (label, text) => {
      if (!text) return ''
      return `
        <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--color-border-dark,#333)">
          <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-text-light-8,#888);margin-bottom:0.4rem">${label}</div>
          <p style="font-size:0.82rem;color:var(--color-text-light-5,#bbb);margin:0">${this.#esc(text)}</p>
        </div>`
    }

    // --- Buttons ---
    const buttonsHtml = `
      <div class="form-footer" style="display:flex;flex-direction:row;gap:0.5rem;padding:0.75rem 1rem">
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

  #esc (str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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
