// scripts/gm-visibility/tab-rules.js

/**
 * A book's Content/Spells tabs are GM-only only while the owning actor has not
 * read the book. World items (no actor) and any lookup failure are treated as
 * unread — overstating GM-only here is the safe direction: a false positive only
 * over-warns the GM, whereas a false negative would mislead them into thinking a
 * player cannot see something they actually can.
 *
 * CoC7 internal coupling: actor.system.getBook(item) -> { initialReading, ... } | undefined
 * (defined on the CoC7 actor system model). The optional chaining degrades safely
 * to "unread" if that method ever moves or is removed.
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

/**
 * The Spells tab only exists on mythos/occult books, and only counts as GM-only
 * while the book is unread — mirrors the system's own gate in book-sheet.js.
 * @param {Item} doc
 * @returns {boolean}
 */
function bookHasGmSpells (doc) {
  const type = doc.system?.type
  return (type?.mythos === true || type?.occult === true) && bookUnread(doc)
}

// Applied to every item type.
const DEFAULT_RULES = [{ key: 'keeper', always: true }]

// Additional GM-only tab rules per item.type.
const TYPE_RULES = {
  book: [
    { key: 'details', always: true },
    { key: 'content', when: bookUnread },
    { key: 'spells', when: bookHasGmSpells }
  ],
  spell: [{ key: 'details', always: true }]
}

/**
 * Resolve the tab keys that are GM-only for this item document.
 * Returned keys are GM-only candidates; consumers must confirm the tab node
 * actually exists in the rendered sheet before acting on it.
 * @param {Item} doc
 * @returns {string[]}
 */
export function gmOnlyTabKeys (doc) {
  const rules = [...DEFAULT_RULES, ...(TYPE_RULES[doc?.type] ?? [])]
  return rules
    .filter(rule => rule.always === true || (typeof rule.when === 'function' && rule.when(doc)))
    .map(rule => rule.key)
}
