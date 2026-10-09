import { TUNING } from '../data/tuning'
import { liveMeta } from './meta'
import { CARD } from './leveling'

export interface LineFx {
  reset: () => void
  step: (dt: number) => void
  draw: (count: number) => void
  apply: () => void
}

type Rewrite = (ids: number[], rest: number[], boon: number[], need: number) => void

/** Line rules loaded beside the run, not in the opening script. */
export function createLineFx(ctx: {
  player: { hp: number; maxHp: number; x: number; z: number }
  mode: () => string
  map: () => string
  lit: (x: number, z: number) => boolean
  banned: { has: (id: number) => boolean; size: number }
  ring: (fill: number) => void
  hurt: () => void
  setRewrite: (fn: Rewrite | null) => void
}): LineFx {
  let litRun = 0
  let tick = 0
  let drawn = 0
  return {
    reset() {
      litRun = 0
      tick = 0
      ctx.ring(0)
    },
    step(dt) {
      if (!liveMeta().lineLive('line.blister', ctx.map()) || ctx.mode() !== 'playing') {
        if (litRun !== 0) {
          litRun = 0
          tick = 0
          ctx.ring(0)
        }
        return
      }
      if (!ctx.lit(ctx.player.x, ctx.player.z)) {
        litRun = 0
        tick = 0
        ctx.ring(0)
        return
      }
      litRun += dt
      ctx.ring(Math.min(1, litRun / TUNING.lines.blisterSeconds))
      if (litRun < TUNING.lines.blisterSeconds) return
      tick += dt
      if (tick < TUNING.contactGap) return
      tick -= TUNING.contactGap
      const amount = ctx.player.maxHp * TUNING.lines.blisterRate * TUNING.contactGap
      const hp = ctx.player.hp
      if (amount <= 0 || hp <= 0) return
      ctx.player.hp = Math.max(0, hp - amount)
      ctx.hurt()
    },
    draw(count) {
      const host = document.querySelector('#line-notches')
      if (!host) return
      const n = Math.max(0, Math.min(3, count))
      if (n === drawn && host.childElementCount === n) return
      drawn = n
      host.replaceChildren()
      for (let i = 0; i < n; i++) {
        const mark = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        mark.setAttribute('class', 'line-notch')
        mark.setAttribute('r', '1.7')
        const t = 18 + i * 22
        const a = -Math.PI / 2 + (t / 300) * Math.PI * 2
        mark.setAttribute('cx', String(Math.round(36 + Math.cos(a) * 30)))
        mark.setAttribute('cy', String(Math.round(36 + Math.sin(a) * 30)))
        host.append(mark)
      }
    },
    apply() {
      const map = ctx.map()
      const sliver = liveMeta().lineLive('line.sliver', map)
      const quick = liveMeta().lineLive('line.quick', map)
      const lockHelio = !liveMeta().weaponOpen('helio')
      const lockScarab = !liveMeta().weaponOpen('scarab')
      if (!sliver && !quick && !lockHelio && !lockScarab && ctx.banned.size === 0) {
        ctx.setRewrite(null)
        return
      }
      const allow = (id: number) => {
        if (sliver && id === CARD.wide) return false
        if (quick && id === CARD.longday) return false
        if (lockHelio && id === CARD.helio) return false
        if (lockScarab && id === CARD.scarab) return false
        if (ctx.banned.has(id)) return false
        return true
      }
      ctx.setRewrite((ids, rest, boon, need) => {
        const bag: number[] = []
        for (let i = 0; i < rest.length; i++) {
          const id = rest[i] ?? CARD.heal
          if (allow(id)) bag.push(id)
        }
        for (let i = 0; i < boon.length; i++) {
          const id = boon[i] ?? CARD.heal
          if (allow(id)) bag.push(id)
        }
        let at = 0
        for (let i = 0; i < need; i++) {
          const id = ids[i] ?? CARD.heal
          if (allow(id)) continue
          let next: number = CARD.heal
          while (at < bag.length) {
            const alt = bag[at] ?? CARD.heal
            at++
            if (!ids.includes(alt)) {
              next = alt
              break
            }
          }
          ids[i] = next
        }
      })
    },
  }
}
