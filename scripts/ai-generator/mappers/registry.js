const _mappers = new Map()
export function register(type, mapper) { _mappers.set(type, mapper) }
export function get(type) { return _mappers.get(type) }
