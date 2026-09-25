/** Spawn pressure shared by every tier. The tier cap only limits who is simulated. */
export function waveAt(time: number): { rate: number; min: number; hound: number; pack: number; surge: boolean } {
  const u = time <= 0 ? 0 : Math.min(1, time / 300)
  const surge = time >= 270 && time < 300
  const ease = u * u
  const early = time < 35
  const rate = early ? (time < 7 ? 0.7 : 2.4 + (time - 7) * 0.07) : 1.2 + (surge ? 18 : 12.8) * ease
  const min = early ? (time < 8 ? 0 : Math.round(4 + (time - 8) * 0.4)) : Math.min(240, Math.round(8 + 232 * ease))
  const hound = time < 12 ? 0 : time < 45 ? 0.28 : time < 180 ? 0.2 : surge ? 0.35 : 0.3
  const pack = time >= 60 && time < 300 ? (surge ? 36 : 25) : 0
  return { rate, min, hound, pack, surge }
}
