let reachRank = 0
let endureRank = 0

export function setWeaponPassives(reach: number, endurance: number): void {
  reachRank = reach > 0 ? reach : 0
  endureRank = endurance > 0 ? endurance : 0
}

export function reachMul(): number {
  const n = reachRank > 5 ? 5 : reachRank
  return 1 + 0.1 * n
}

export function endureMul(): number {
  const n = endureRank > 5 ? 5 : endureRank
  return 1 + 0.15 * n
}
