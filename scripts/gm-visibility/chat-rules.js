/**
 * Chat-card regions that are GM-only by code path rather than by marker class.
 *
 * The system normally tags GM-only chat regions with .keeper-only-block, which the
 * render hook strips from the player's DOM. Some regions are instead GM-only because
 * the code that builds them never runs for a player, so no marker class ever reaches
 * the DOM and class-based detection cannot see them. Each rule below resolves one
 * such region from a rendered card.
 */

/**
 * The damage/heal buttons the system appends to a plain roll card.
 *
 * CoC7 internal coupling: CoC7ChatMessage._onRenderMessage (coc7/apps/chat-message.js)
 * renders templates/chat/parts/damage-buttons.hbs into the card, and its entire body is
 * wrapped in `if (game.user.isGM)`. Players therefore receive none of these rows, yet the
 * template only puts .keeper-only-block on the "Set as damage/heal" row — the sibling
 * apply-damage / apply-heal row carries no marker class at all.
 *
 * Anchoring on data-action="setRollAsModifier" is what makes this safe: that action exists
 * only in damage-buttons.hbs, whereas data-action="applyValue" is also used by
 * templates/chat/damage.hbs for a row players *can* see. From the anchor we return every
 * button row of the injected fragment, which covers the unmarked sibling.
 * @param {HTMLElement} html
 * @returns {HTMLElement[]}
 */
function damageHealButtons (html) {
  const anchor = html.querySelector('button[data-action="setRollAsModifier"]')
  const row = anchor?.closest('.coc7-card-buttons')
  if (!row?.parentElement) return []
  return [...row.parentElement.children].filter(el => el.classList.contains('coc7-card-buttons'))
}

const REGION_RULES = [damageHealButtons]

/**
 * Resolve every GM-only region of a rendered chat card that the system left unmarked.
 * A rule that matches nothing returns an empty list, so an unrelated card costs one
 * querySelector per rule.
 * @param {HTMLElement} html
 * @returns {HTMLElement[]}
 */
export function gmOnlyChatRegions (html) {
  return REGION_RULES.flatMap(rule => rule(html))
}
