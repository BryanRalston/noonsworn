/** Dev-only sample points. Weapons fill this during sync. */
export interface ProbePoint {
  x: number
  y: number
  z: number
}

export interface ProbeBody {
  kind: string
  level: number
  x: number
  y: number
  z: number
  rimX: number
  rimY: number
  rimZ: number
  floorX: number
  floorY: number
  floorZ: number
  /** Eight or more points on the real rim, already scaled into the world. */
  rims: readonly ProbePoint[]
}

const bodies: ProbeBody[] = []
let solo: string | null = null

/** Evolution names share the base mesh until they grow their own part. */
const CANON: Record<string, string> = {
  meridian: 'sunspear',
  corona: 'halo',
  dayburst: 'flare',
  twelvefold: 'bell',
  solar: 'heliograph',
  grove: 'obelisk',
  mocksun: 'prism',
}

const PART_OF: Record<number, string> = {
  0: 'sunspear',
  1: 'halo',
  2: 'bell',
  3: 'bell',
  4: 'heliograph',
  5: 'scarablight',
  6: 'stakes',
  7: 'prism',
  8: 'obelisk',
  9: 'sunroller',
  10: 'chest',
  11: 'flare',
}

function canon(kind: string): string {
  return CANON[kind] ?? kind
}

export function setProbeSolo(kind: string | null): void {
  solo = kind
}

export function probeSolo(): string | null {
  return solo
}

/** Null when every element is drawn. Otherwise the mesh family to keep. */
export function probeSoloCanon(): string | null {
  if (!solo) return null
  return canon(solo)
}

export function probeAllows(kind: string): boolean {
  if (!solo) return true
  return canon(solo) === canon(kind)
}

export function probeAllowsPart(part: number): boolean {
  if (!solo) return true
  return PART_OF[part] === canon(solo)
}

export function probeReset(): void {
  bodies.length = 0
}

export function probeAdd(body: ProbeBody): void {
  if (!probeAllows(body.kind)) return
  if (bodies.length < 128) bodies.push(body)
}

export function probeBodies(): readonly ProbeBody[] {
  return bodies
}

/** Local points through the same yaw and scale as writeInstance. */
export function spinRims(
  px: number,
  py: number,
  pz: number,
  yaw: number,
  scale: number,
  local: readonly (readonly [number, number, number])[],
  sy = scale,
  sz = scale,
): ProbePoint[] {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const out: ProbePoint[] = []
  for (let i = 0; i < local.length; i++) {
    const p = local[i]
    if (!p) continue
    const lx = p[0]
    const ly = p[1]
    const lz = p[2]
    out.push({
      x: px + scale * lx * c + sz * lz * s,
      y: py + sy * ly,
      z: pz - scale * lx * s + sz * lz * c,
    })
  }
  return out
}

export function ringLocal(radius: number, y: number): [number, number, number][] {
  const local: [number, number, number][] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    local.push([Math.cos(a) * radius, y, Math.sin(a) * radius])
  }
  return local
}

export function ringRims(px: number, py: number, pz: number, radius: number): ProbePoint[] {
  return spinRims(px, py, pz, 0, 1, ringLocal(radius, 0))
}
