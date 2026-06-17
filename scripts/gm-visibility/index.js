// scripts/gm-visibility/index.js

import { registerGmVisibilitySettings } from './settings.js'
import { highlightChatCard } from './chat-cards.js'
import { highlightItemSheet } from './item-sheets.js'

Hooks.once('init', registerGmVisibilitySettings)

Hooks.on('renderChatMessageHTML', (message, html) => highlightChatCard(message, html))

Hooks.on('renderItemSheetV2', (application, element) => highlightItemSheet(application, element))
