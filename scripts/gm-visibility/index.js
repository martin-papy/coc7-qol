// scripts/gm-visibility/index.js

import { registerGmVisibilitySettings } from './settings.js'
import { highlightChatCard } from './chat-cards.js'

Hooks.once('init', registerGmVisibilitySettings)

Hooks.on('renderChatMessageHTML', (message, html) => highlightChatCard(message, html))
