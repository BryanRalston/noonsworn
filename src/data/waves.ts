import { TUNING } from './tuning'

/** Spawn pressure shared by every tier. The tier cap does not change who exists. */
export function waveAt(time: number): { rate: number; min: number; hound: number; pack: number; surge: boolean } {
  const u = time <= 0 ? 0 : Math.min(1, time / 300)
  const surge = time >= 270 && time < 300
  const ease = u * u
  // From 0:40 the rate and floor match the pre-F1 curve, including the 4:30 surge.
  // Hound rolls start at houndChanceAt so the pack shares the opening hound's floor.
  if (time >= 40) {
    const rate = 1.2 + (surge ? 18 : 12.8) * ease
    const min = Math.min(240, Math.round(8 + 232 * ease))
    const hound = time < TUNING.houndChanceAt ? 0 : time < 180 ? 0.2 : surge ? 0.35 : 0.3
    const pack = time >= 60 && time < 300 ? (surge ? 36 : 25) : 0
    return { rate, min, hound, pack, surge }
  }
  // Smooth opening. The old curve jumped from 0.7 to 2.4 at 7s.
  const k = time <= 0 ? 0 : time / 40
  const s = k * k * (3 - 2 * k)
  const rateAt40 = 1.2 + 12.8 * (40 / 300) * (40 / 300)
  return { rate: 0.35 + (rateAt40 - 0.35) * s, min: Math.round(8 * s), hound: 0, pack: 0, surge: false }
}
