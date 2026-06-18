// scripts/gm-visibility/badge.js

import { t } from '../utils.js'

const BADGE_CLASS = 'coc7qol-gm-badge'

/**
 * Build a badge element marking a GM-only element.
 * @param {string} iconClass  Font Awesome icon class, e.g. 'fa-eye-slash' or 'fa-lock'.
 * @param {string} tooltipKey i18n key for the tooltip / aria-label.
 * @returns {HTMLElement}
 */
export function createGmBadge (iconClass, tooltipKey) {
  const badge = document.createElement('i')
  badge.className = `fa-solid ${iconClass} ${BADGE_CLASS}`
  const tip = t(tooltipKey)
  badge.setAttribute('data-tooltip', tip)
  badge.setAttribute('aria-label', tip)
  badge.setAttribute('role', 'img')
  return badge
}

/**
 * Insert a badge into target unless one is already present (idempotent on re-render).
 * @param {HTMLElement} target
 * @param {object} opts
 * @param {string} opts.icon        Font Awesome icon class.
 * @param {string} opts.tooltipKey  i18n key for the tooltip.
 * @param {'append'|'prepend'} [opts.position='append']
 */
export function addBadgeOnce (target, { icon, tooltipKey, position = 'append' }) {
  if (!target || target.querySelector(`.${BADGE_CLASS}`)) return
  const badge = createGmBadge(icon, tooltipKey)
  if (position === 'prepend') target.prepend(badge)
  else target.append(badge)
}
