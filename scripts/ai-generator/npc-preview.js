// Row markup for the weapon and possession lists of the NPC review dialog. No Foundry globals
// at import, so it is unit-tested in Node (test/npc-preview.test.js).

import { escapeHtml, tf } from '../utils.js'

function rowHtml (kind, index, removed, removeTitle, name, detail) {
  return `
        <div class="coc7qol-npc-equip-row${removed ? ' coc7qol-ai-removed' : ''}" data-equip-kind="${kind}" data-equip-index="${index}">
          <span class="coc7qol-npc-equip-name">${escapeHtml(name)}</span>
          <span class="coc7qol-npc-equip-detail">${escapeHtml(detail)}</span>
          <button type="button" class="coc7qol-npc-equip-remove" title="${escapeHtml(removeTitle)}" aria-label="${escapeHtml(removeTitle)}">×</button>
        </div>`
}

/**
 * @param {object} weapon   Foundry weapon item data from the weapon mapper.
 * @param {number} index
 * @param {boolean} removed Whether the GM has struck the row out.
 * @param {string} removeTitle Localised label of the remove button.
 * @returns {string}
 */
export function weaponRowHtml (weapon, index, removed, removeTitle) {
  const damage = weapon?.system?.range?.normal?.damage ?? ''
  const skill = weapon?.system?.skill?.main?.name ?? ''
  // Not escaped here: rowHtml escapes the formatted detail once.
  const detail = tf('COC7QOL.AIGenerator.NPC.Preview.WeaponRowDamage', { damage, skill })
  return rowHtml('weapon', index, removed, removeTitle, weapon?.name ?? '', detail)
}

/**
 * @param {object} possession Foundry item data from the NPC mapper.
 * @param {number} index
 * @param {boolean} removed
 * @param {string} removeTitle
 * @returns {string}
 */
export function possessionRowHtml (possession, index, removed, removeTitle) {
  const quantity = possession?.system?.quantity ?? 1
  const detail = quantity > 1 ? tf('COC7QOL.AIGenerator.NPC.Preview.PossessionRowQuantity', { quantity }) : ''
  return rowHtml('possession', index, removed, removeTitle, possession?.name ?? '', detail)
}
