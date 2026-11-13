/**
 * Pure DOM view of the Group Luck dialog. The `doc` argument is the only DOM entry point;
 * actor names only ever reach the tree through `textContent` or attribute values.
 */

const KEY = 'COC7QOL.GroupLuck.'

/**
 * Create an element with an optional class name and text.
 * @param {Document} doc
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el (doc, tag, className, text) {
  const node = doc.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * Create an input with the given type, name and value.
 * @param {Document} doc
 * @param {string} type
 * @param {string} name
 * @param {string} value
 * @returns {HTMLInputElement}
 */
function input (doc, type, name, value) {
  const node = doc.createElement('input')
  node.type = type
  node.name = name
  node.value = value
  return node
}

/**
 * Marker span for a row: the roller, another tied row, or null when it needs none.
 * @param {Document} doc
 * @param {boolean} isRoller
 * @param {boolean} isTiedRow
 * @param {(key: string) => string} t
 * @returns {HTMLElement|null}
 */
function buildMarker (doc, isRoller, isTiedRow, t) {
  if (!isRoller && !isTiedRow) return null
  const marker = el(doc, 'span', 'group-luck-marker')
  if (isRoller) {
    const icon = el(doc, 'i', 'fa-solid fa-dice-d20')
    icon.setAttribute('aria-hidden', 'true')
    marker.append(icon, ' ', t(`${KEY}Rolls`))
  } else {
    marker.textContent = t(`${KEY}Tied`)
  }
  return marker
}

/**
 * Build one candidate row.
 * @param {Document} doc
 * @param {import('./candidates.js').Candidate} candidate
 * @param {{ tickedIds: Set<string>, resolution: import('./candidates.js').Resolution }} state
 * @param {(key: string) => string} t
 * @returns {HTMLElement}
 */
function buildRow (doc, candidate, { tickedIds, resolution }, t) {
  const { roller, tied } = resolution
  const hasTie = tied.length > 1
  const isTiedRow = hasTie && tied.some(entry => entry.id === candidate.id)
  const isRoller = roller?.id === candidate.id
  const li = el(doc, 'li', 'group-luck-row')
  li.dataset.candidateId = candidate.id
  li.classList.toggle('is-roller', isRoller)
  li.classList.toggle('is-tied', isTiedRow)

  const label = el(doc, 'label', 'group-luck-present')
  const present = input(doc, 'checkbox', 'present', candidate.id)
  present.checked = tickedIds.has(candidate.id)
  label.append(present, el(doc, 'span', 'group-luck-name', candidate.name))
  li.append(label)

  if (isTiedRow) {
    const radio = input(doc, 'radio', 'roller', candidate.id)
    radio.checked = isRoller
    radio.setAttribute('aria-label', `${t(`${KEY}RollerChoice`)}: ${candidate.name}`)
    li.append(radio)
  }
  const described = []
  const offline = candidate.isOnline ? null : el(doc, 'span', 'group-luck-offline', t(`${KEY}Offline`))
  const value = el(doc, 'span', 'group-luck-value', String(candidate.luck))
  const marker = buildMarker(doc, isRoller, isTiedRow, t)
  for (const [suffix, node] of [['luck', value], ['offline', offline], ['marker', marker]]) {
    if (!node) continue
    node.setAttribute('id', `group-luck-${candidate.id}-${suffix}`)
    described.push(node.id)
  }
  present.setAttribute('aria-describedby', described.join(' '))
  if (offline) li.append(offline)
  li.append(value)
  if (marker) li.append(marker)
  return li
}

/**
 * Build the list of rows, with a divider between the default and the other candidates.
 * @param {Document} doc
 * @param {import('./candidates.js').Candidate[]} candidates
 * @param {{ tickedIds: Set<string>, resolution: import('./candidates.js').Resolution }} state
 * @param {(key: string) => string} t
 * @returns {HTMLElement}
 */
function buildList (doc, candidates, state, t) {
  const list = el(doc, 'ul', 'group-luck-list')
  const hasDefaults = candidates.some(candidate => candidate.isDefault)
  let dividerDone = false
  for (const candidate of candidates) {
    if (hasDefaults && !candidate.isDefault && !dividerDone) {
      list.append(el(doc, 'li', 'group-luck-divider', t(`${KEY}Others`)))
    }
    if (!candidate.isDefault) dividerDone = true
    list.append(buildRow(doc, candidate, state, t))
  }
  return list
}

/**
 * Build the footer with the confirm and cancel buttons.
 * @param {Document} doc
 * @param {import('./candidates.js').Resolution} resolution
 * @param {{ t: (key: string) => string, tf: (key: string, data: object) => string }} i18n
 * @returns {HTMLElement}
 */
function buildFooter (doc, { roller }, { t, tf }) {
  const footer = el(doc, 'footer', 'group-luck-footer')
  const confirm = el(doc, 'button', 'bright')
  confirm.type = 'button'
  confirm.dataset.action = 'confirm'
  if (!roller) {
    confirm.textContent = t(`${KEY}Button.Request`)
    confirm.disabled = true
  } else {
    const key = roller.isOnline ? 'Button.RequestFrom' : 'Button.KeeperRoll'
    confirm.textContent = tf(`${KEY}${key}`, { name: roller.name })
  }
  const cancel = el(doc, 'button', undefined, t(`${KEY}Button.Cancel`))
  cancel.type = 'button'
  cancel.dataset.action = 'cancel'
  footer.append(confirm, cancel)
  return footer
}

/**
 * Render the Group Luck dialog content from its state.
 * @param {Document} doc
 * @param {{ candidates: import('./candidates.js').Candidate[], tickedIds: Set<string>, resolution: import('./candidates.js').Resolution }} state
 * @param {{ t: (key: string) => string, tf: (key: string, data: object) => string }} i18n
 * @returns {HTMLElement}
 */
export function buildGroupLuckView (doc, { candidates, tickedIds, resolution }, { t, tf }) {
  const root = el(doc, 'div', 'coc7-qol-group-luck')
  root.append(
    el(doc, 'p', 'group-luck-hint', t(`${KEY}Hint`)),
    buildList(doc, candidates, { tickedIds, resolution }, t),
    buildFooter(doc, resolution, { t, tf })
  )
  return root
}
