// scripts/gm-visibility/index.js

import { registerGmVisibilitySettings } from './settings.js'

Hooks.once('init', registerGmVisibilitySettings)
