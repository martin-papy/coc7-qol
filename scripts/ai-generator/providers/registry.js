const _providers = new Map()
export function register(id, cls) { _providers.set(id, cls) }
export function get(id) { return _providers.get(id) }
