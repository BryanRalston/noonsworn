/** One id for every temple. Switches on this union stay exhaustive. */
export type MapId = 'sundial' | 'lattice' | 'cloister' | 'stair'

export function assertMap(id: never): never {
  throw new Error(`unknown map ${String(id)}`)
}
