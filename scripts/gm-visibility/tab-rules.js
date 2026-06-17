// scripts/gm-visibility/tab-rules.js

/**
 * A book's Content/Spells tabs are GM-only only while the owning actor has not
 * read the book. World items (no actor) and any lookup failure are treated as
 * unread — understating (not flagging) is safer than wrongly flagging.
 * @param {Item} doc
 * @returns {boolean}
 */
function bookUnread (doc) {
  try {
    const known = doc.actor?.system?.getBook?.(doc)
    return !(known?.initialReading ?? false)
  } catch (_) {
    return true
  }
}

// Applied to every item type.
const DEFAULT_RULES = [{ key: 'keeper', always: true }]

// Additional GM-only tab rules per item.type.
const TYPE_RULES = {
  book: [
    { key: 'details', always: true },
    { key: 'content', when: bookUnread },
    { key: 'spells', when: bookUnread }
  ],
  spell: [{ key: 'details', always: true }]
}

/**
 * Resolve the tab keys that are GM-only for this item document.
 * @param {Item} doc
 * @returns {string[]}
 */
export function gmOnlyTabKeys (doc) {
  const rules = [...DEFAULT_RULES, ...(TYPE_RULES[doc?.type] ?? [])]
  return rules
    .filter(rule => rule.always === true || (typeof rule.when === 'function' && rule.when(doc)))
    .map(rule => rule.key)
}
