import { TUNING } from '../data/tuning'

const CELL = TUNING.spatialCell
const ORIGIN = -32
const CELLS = 32
const MAX = 520
const counts = new Int16Array(CELLS * CELLS)
const starts = new Int16Array(CELLS * CELLS)
const indices = new Int16Array(MAX)

function cellOf(x: number, z: number): number {
  let cx = ((x - ORIGIN) / CELL) | 0
  let cz = ((z - ORIGIN) / CELL) | 0
  if (cx < 0) cx = 0
  else if (cx >= CELLS) cx = CELLS - 1
  if (cz < 0) cz = 0
  else if (cz >= CELLS) cz = CELLS - 1
  return cz * CELLS + cx
}

export function hashBuild(xs: Float32Array, zs: Float32Array, alive: Uint8Array, count: number) {
  counts.fill(0)
  let n = 0
  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue
    counts[cellOf(xs[i] ?? 0, zs[i] ?? 0)]++
    n++
    if (n >= MAX) break
  }
  let sum = 0
  for (let i = 0; i < counts.length; i++) {
    starts[i] = sum
    sum += counts[i] ?? 0
  }
  counts.fill(0)
  let written = 0
  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue
    if (written >= MAX) break
    const c = cellOf(xs[i] ?? 0, zs[i] ?? 0)
    const at = (starts[c] ?? 0) + (counts[c] ?? 0)
    indices[at] = i
    counts[c] = (counts[c] ?? 0) + 1
    written++
  }
}

export function hashQuery(x: number, z: number, radius: number, out: Int16Array): number {
  let cx0 = (((x - radius) - ORIGIN) / CELL) | 0
  let cx1 = (((x + radius) - ORIGIN) / CELL) | 0
  let cz0 = (((z - radius) - ORIGIN) / CELL) | 0
  let cz1 = (((z + radius) - ORIGIN) / CELL) | 0
  if (cx0 < 0) cx0 = 0
  if (cz0 < 0) cz0 = 0
  if (cx1 >= CELLS) cx1 = CELLS - 1
  if (cz1 >= CELLS) cz1 = CELLS - 1
  let w = 0
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = cz * CELLS + cx
      const start = starts[c] ?? 0
      const n = counts[c] ?? 0
      for (let i = 0; i < n; i++) {
        if (w >= out.length) return w
        out[w++] = indices[start + i] ?? 0
      }
    }
  }
  return w
}
