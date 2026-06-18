import { registerGmVisibilitySettings } from './settings.js'
import { highlightChatCard } from './chat-cards.js'
import { highlightSheetTabs } from './sheet-tabs.js'

Hooks.once('init', registerGmVisibilitySettings)

Hooks.on('renderChatMessageHTML', (message, html) => highlightChatCard(message, html))

Hooks.on('renderItemSheetV2', (application, element) => highlightSheetTabs(application, element))
