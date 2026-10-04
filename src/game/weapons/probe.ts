/** Dev-only sample points for the punch pass. Weapons fill this during sync. */
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
}

const bodies: ProbeBody[] = []

export function probeReset(): void {
  bodies.length = 0
}

export function probeAdd(body: ProbeBody): void {
  if (bodies.length < 64) bodies.push(body)
}

export function probeBodies(): readonly ProbeBody[] {
  return bodies
}
