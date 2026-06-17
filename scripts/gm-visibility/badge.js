// scripts/gm-visibility/badge.js

import { t } from '../utils.js'

const BADGE_CLASS = 'coc7qol-gm-badge'

/**
 * Build the eye-slash badge element marking a GM-only element.
 * @returns {HTMLElement}
 */
export function createGmBadge () {
  const badge = document.createElement('i')
  badge.className = `fa-solid fa-eye-slash ${BADGE_CLASS}`
  const tip = t('COC7QOL.GmVisibility.BadgeTooltip')
  badge.setAttribute('data-tooltip', tip)
  badge.setAttribute('aria-label', tip)
  return badge
}

/**
 * Insert a badge into target unless one is already present (idempotent on re-render).
 * @param {HTMLElement} target
 * @param {'append'|'prepend'} [position='append']
 */
export function addBadgeOnce (target, position = 'append') {
  if (!target || target.querySelector(`.${BADGE_CLASS}`)) return
  const badge = createGmBadge()
  if (position === 'prepend') target.prepend(badge)
  else target.append(badge)
}
