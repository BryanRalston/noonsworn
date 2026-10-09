/**
 * R1a migration fixtures. Not imported by the game.
 * Run: node --experimental-strip-types scripts/r1a-fixtures.ts
 */
import { creditNoonPrint, openMeta, scoreRun, type MetaStore } from '../src/game/meta.ts'

const META = 'noonsworn.meta.v1'
const BAK = 'noonsworn.meta.v1.bak'
const MAPS = 'noonsworn.maps.v1'
const DAWN = 'noonsworn.dawn'

const fails: string[] = []

function check(name: string, cond: boolean, detail = ''): void {
  if (!cond) fails.push(detail ? `${name}: ${detail}` : name)
}

interface Store extends MetaStore {
  commits: () => number
  keys: () => string[]
  failNext: () => void
}

function memStore(seed: Record<string, string> = {}): Store {
  const data = new Map<string, string>(Object.entries(seed))
  let commits = 0
  let fail = 0
  return {
    commits: () => commits,
    keys: () => [...data.keys()],
    failNext() {
      fail += 1
    },
    get(key) {
      return data.has(key) ? (data.get(key) ?? null) : null
    },
    commit(key, value) {
      if (fail > 0) {
        fail -= 1
        return false
      }
      data.set(key, value)
      commits += 1
      return true
    },
  }
}

function maps(unlocked: string[], best: Record<string, unknown>): string {
  return JSON.stringify({ unlocked, best, last: unlocked[unlocked.length - 1] ?? 'sundial', seen: [] })
}

function clearRow(time: number): Record<string, number> {
  return { time, kills: 8, clear: time, clearKills: 8 }
}

function has(list: readonly string[], id: string): boolean {
  return list.includes(id)
}

function wheelOf(store: Store): string[] {
  const raw = store.get(META)
  if (!raw) return []
  const parsed = JSON.parse(raw) as { wheel?: string[] }
  return parsed.wheel ?? []
}

function untouched(before: Store, mapsRaw: string | null, dawnRaw: string | null): void {
  check('maps key', before.get(MAPS) === mapsRaw, `maps changed to ${before.get(MAPS)}`)
  check('dawn key', before.get(DAWN) === dawnRaw, `dawn changed to ${before.get(DAWN)}`)
}

function fixture1(): void {
  const store = memStore()
  const a = openMeta(store)
  check('1 migratedFrom', a.env.migratedFrom === 'fresh', String(a.env.migratedFrom))
  check('1 sunmarks', a.env.sunmarks === 0, String(a.env.sunmarks))
  check('1 ent', a.env.ent.length === 0, a.env.ent.join(','))
  check('1 wheel', a.env.wheel.length === 0, a.env.wheel.join(','))
  check('1 rev', a.env.rev === 1, String(a.env.rev))
  const n = store.commits()
  const b = openMeta(store)
  check('1 idempotent commits', store.commits() === n, `${n} -> ${store.commits()}`)
  check('1 idempotent marks', b.env.sunmarks === 0 && b.env.rev === 1)
  check('1 no print', a.env.sunmarks === 0 && creditNoonPrint('2000-01-01') === 10)
}

function fixture2(): void {
  const raw = maps(['sundial', 'lattice'], { sundial: clearRow(220) })
  const store = memStore({ [MAPS]: raw })
  const a = openMeta(store)
  check('2 sliver', has(a.env.ent, 'line.sliver'))
  check('2 not inferred', !has(a.env.inferred, 'line.sliver'), a.env.inferred.join(','))
  check('2 no hard', !has(a.env.ent, 'line.hard'))
  check('2 first', has(a.env.ent, 'bonus.first') && a.env.sunmarks === 15, String(a.env.sunmarks))
  check('2 weapons', has(a.env.wheel, 'mark.weaponA') && has(a.env.wheel, 'mark.weaponB'))
  check('2 kept', has(a.env.ent, 'kept.mark.weaponA') && has(a.env.ent, 'kept.mark.weaponB'))
  check('2 no temples', !has(a.env.wheel, 'mark.temples'))
  check('2 no finale', !has(a.env.wheel, 'mark.finale') && a.env.palette === 'default')
  const n = store.commits()
  const snap = store.get(META)
  const b = openMeta(store)
  check('2 twice', store.commits() === n && b.env.sunmarks === 15 && store.get(META) === snap)
  untouched(store, raw, null)
}

function fixture3(): void {
  const raw = maps(['sundial', 'lattice', 'cloister', 'stair', 'nadir'], {
    sundial: clearRow(200),
    lattice: clearRow(240),
    cloister: clearRow(260),
    stair: clearRow(280),
  })
  const store = memStore({ [MAPS]: raw })
  const a = openMeta(store)
  for (const id of ['line.sliver', 'line.hard', 'line.blister', 'line.quick']) {
    check(`3 ${id}`, has(a.env.ent, id))
  }
  check('3 no fewhands', !has(a.env.ent, 'line.fewhands'))
  check('3 temples', has(a.env.wheel, 'mark.temples'))
  check('3 no finale mark', !has(a.env.wheel, 'mark.finale'))
  check('3 palette', a.env.palette === 'default', a.env.palette)
  check('3 sunmarks', a.env.sunmarks === 15, String(a.env.sunmarks))
  check('3 weapons', has(a.env.wheel, 'mark.weaponA') && has(a.env.ent, 'kept.mark.weaponB'))
  untouched(store, raw, null)
}

function fixture4(): void {
  const raw = maps(['sundial', 'lattice', 'cloister', 'stair', 'nadir'], {
    sundial: clearRow(200),
    lattice: clearRow(240),
    cloister: clearRow(260),
    stair: clearRow(280),
    nadir: clearRow(300),
  })
  const store = memStore({ [MAPS]: raw, [DAWN]: '1' })
  const a = openMeta(store)
  for (const id of ['line.sliver', 'line.hard', 'line.blister', 'line.quick', 'line.fewhands']) {
    check(`4 ${id}`, has(a.env.ent, id))
  }
  check('4 finale', has(a.env.wheel, 'mark.finale') && has(a.env.ent, 'bonus.finale'))
  check('4 temples', has(a.env.wheel, 'mark.temples'))
  check('4 linen', a.env.palette === 'linen', a.env.palette)
  check('4 sunmarks', a.env.sunmarks === 40, String(a.env.sunmarks))
  check('4 no prints', !has(a.env.wheel, 'mark.prints'))
  check('4 weapons', has(a.env.ent, 'kept.mark.weaponA'))
  const n = store.commits()
  openMeta(store)
  check('4 twice', store.commits() === n && openMeta(store).env.sunmarks === 40)
  untouched(store, raw, '1')
}

function fixture5(): void {
  const raw = maps(['sundial'], { sundial: { time: 40, kills: 1 } })
  const store = memStore({ [MAPS]: raw, [DAWN]: '1' })
  const a = openMeta(store)
  check('5 finale without nadir clear', has(a.env.wheel, 'mark.finale') && has(a.env.ent, 'line.fewhands'))
  check('5 linen', a.env.palette === 'linen')
  check('5 +25 +15', a.env.sunmarks === 40, String(a.env.sunmarks))
  check('5 temples from cascade', has(a.env.wheel, 'mark.temples'))
  check('5 sliver inferred', has(a.env.inferred, 'line.sliver') && has(a.env.ent, 'line.sliver'))
  check('5 weapons from best row', has(a.env.wheel, 'mark.weaponA') && has(a.env.ent, 'kept.mark.weaponA'))
  check('5 no nadir clear in maps', !raw.includes('"clear"'))
  untouched(store, raw, '1')
  const n = store.commits()
  const again = openMeta(store)
  check('5 twice', store.commits() === n && again.env.sunmarks === 40)
}

function fixture6(): void {
  const raw = maps(['sundial', 'lattice'], { sundial: { time: 90, kills: 5 } })
  const store = memStore({ [MAPS]: raw })
  const a = openMeta(store)
  check('6 sliver granted', has(a.env.ent, 'line.sliver'))
  check('6 sliver inferred', has(a.env.inferred, 'line.sliver'), a.env.inferred.join(','))
  check('6 no hard', !has(a.env.ent, 'line.hard') && !has(a.env.inferred, 'line.hard'))
  check('6 no temples', !has(a.env.wheel, 'mark.temples'))
  check('6 first only', a.env.sunmarks === 15, String(a.env.sunmarks))
  check('6 weapons', has(a.env.ent, 'kept.mark.weaponB'))
  untouched(store, raw, null)
}

function fixture7(): void {
  const raw = maps(['sundial', 'lattice'], { sundial: clearRow(180) })
  const store = memStore({ [META]: '{', [MAPS]: raw })
  let threw = false
  try {
    const a = openMeta(store)
    check('7 bak', store.get(BAK) === '{', String(store.get(BAK)))
    check('7 maps', store.get(MAPS) === raw)
    check('7 sliver', has(a.env.ent, 'line.sliver') && a.env.sunmarks === 15, String(a.env.sunmarks))
    check('7 wheel', has(a.env.wheel, 'mark.weaponA') && !has(a.env.wheel, 'mark.finale'))
  } catch (err) {
    threw = true
    fails.push(`7 threw ${err instanceof Error ? err.message : String(err)}`)
  }
  check('7 no throw', !threw)
}

function fixture8(): void {
  const bad = '{'
  const store = memStore({ [MAPS]: bad })
  let threw = false
  try {
    const a = openMeta(store)
    check('8 bak', store.get(BAK) === bad)
    check('8 maps untouched', store.get(MAPS) === bad)
    check('8 defaults', a.env.migratedFrom === 'legacy-bad' && a.env.sunmarks === 0 && a.env.ent.length === 0 && a.env.wheel.length === 0, a.env.migratedFrom ?? '')
  } catch (err) {
    threw = true
    fails.push(`8 threw ${err instanceof Error ? err.message : String(err)}`)
  }
  check('8 no throw', !threw)
}

function fixture9(): void {
  const raw = JSON.stringify({
    v: 2,
    rev: 9,
    sunmarks: 77,
    ent: ['line.sliver'],
    wheel: ['mark.frame'],
    lines: ['line.sliver'],
    palette: 'harbor',
  })
  const store = memStore({ [META]: raw })
  const a = openMeta(store)
  check('9 readonly', a.env.readonly === true)
  const bought = a.buy('mark.reroll1', true)
  check('9 buy', !bought.ok && bought.reason === 'read-only', bought.reason)
  const credited = a.credit({ seconds: 300, bossKills: 1, cleared: true, finale: true, mapId: 'nadir', practice: false })
  check('9 credit', credited.total === 0)
  check('9 raw', store.get(META) === raw)
  check('9 no commit', store.commits() === 0, String(store.commits()))
  a.setLines(['line.sliver'])
  check('9 setLines', store.get(META) === raw)
}

function fixture10(): void {
  const seed = JSON.stringify({
    v: 1,
    rev: 1,
    sunmarks: 40,
    ent: ['bonus.first'],
    wheel: [],
    lines: [],
    palette: 'default',
    daily: {},
    migratedFrom: 'fresh',
    inferred: [],
  })
  const store = memStore({ [META]: seed })
  const a = openMeta(store)
  const b = openMeta(store)
  const bought = a.buy('mark.frame', false)
  check('10 a buy', bought.ok && bought.reason === '', bought.reason)
  check('10 a balance', a.env.sunmarks === 15 && a.env.rev === 2, `${a.env.sunmarks} rev ${a.env.rev}`)
  const again = b.buy('mark.frame', true)
  check('10 b owned', !again.ok && again.reason === 'owned', again.reason)
  check('10 disk once', wheelOf(store).filter((id) => id === 'mark.frame').length === 1)
  const disk = JSON.parse(store.get(META) ?? '{}') as { sunmarks: number; rev: number }
  check('10 disk balance', disk.sunmarks === 15 && disk.rev === 2, JSON.stringify(disk))
  check('10 b not negative', b.env.sunmarks >= 0)
  // max(sunmarks) keeps B's unspent 40 in memory. B did not write, so the disk still shows A's 15.
  check('10 b memory max', b.env.sunmarks === 40, String(b.env.sunmarks))
  const rich = JSON.stringify({
    v: 1,
    rev: 1,
    sunmarks: 200,
    ent: ['bonus.first'],
    wheel: [],
    lines: [],
    palette: 'default',
    daily: {},
    migratedFrom: 'fresh',
    inferred: [],
  })
  const store2 = memStore({ [META]: rich })
  const d = openMeta(store2)
  const e = openMeta(store2)
  check('10 d frame', d.buy('mark.frame', false).ok && d.env.sunmarks === 175)
  const reroll = e.buy('mark.reroll1', false)
  check('10 e reroll', reroll.ok, reroll.reason)
  const merged = JSON.parse(store2.get(META) ?? '{}') as { sunmarks: number; wheel: string[] }
  check('10 both marks once', merged.wheel.filter((id) => id === 'mark.frame').length === 1 && merged.wheel.includes('mark.reroll1'))
  check('10 max refund documented', merged.sunmarks === 165, String(merged.sunmarks))
  check('10 e not negative', e.env.sunmarks >= 0)
}

function fixture11(): void {
  const seed = JSON.stringify({
    v: 1,
    rev: 4,
    sunmarks: 40,
    ent: ['bonus.first'],
    wheel: [],
    lines: [],
    palette: 'default',
    daily: {},
    migratedFrom: 'fresh',
    inferred: [],
  })
  const store = memStore({ [META]: seed })
  const a = openMeta(store)
  store.failNext()
  const bought = a.buy('mark.frame', false)
  check('11 session', bought.ok && bought.reason === 'session', bought.reason)
  check('11 notice', a.notice === 'Sunmarks stayed on this tab.', a.notice)
  check('11 disk kept', store.get(META) === seed)
  check('11 session mark', a.env.session === true && has(a.env.wheel, 'mark.frame') && a.env.sunmarks === 15, String(a.env.sunmarks))
}

function fixture12(): void {
  const raw = maps(['sundial', 'lattice'], { sundial: clearRow(210) })
  const store = memStore({ [MAPS]: raw })
  const a = openMeta(store)
  const n = store.commits()
  const snap = store.get(META)
  const b = openMeta(store)
  const c = openMeta(store)
  check('12 commits', store.commits() === n, `${n} -> ${store.commits()}`)
  check('12 snap', store.get(META) === snap)
  check('12 same', a.env.sunmarks === b.env.sunmarks && b.env.rev === c.env.rev && b.env.ent.join('|') === c.env.ent.join('|'))
}

function fixture13(): void {
  const store = memStore()
  const cut = openMeta(store)
  check('13 cutoff', cut.env.sunmarks === 0)
  const earned = cut.credit({ seconds: 90, bossKills: 0, cleared: false, finale: false, mapId: 'sundial', practice: false })
  check('13 90s death', earned.total === 21 && cut.env.sunmarks === 21, `${earned.total} ${earned.line}`)
  const second = cut.credit({ seconds: 90, bossKills: 0, cleared: false, finale: false, mapId: 'sundial', practice: false })
  check('13 no second first', second.total === 6 && cut.env.sunmarks === 27, String(second.total))
  const practice = openMeta(memStore())
  const stamped = practice.credit({ seconds: 300, bossKills: 1, cleared: true, finale: true, mapId: 'nadir', practice: true })
  check('13 practice stamp', stamped.total === 0 && stamped.line.toLowerCase().includes('practice'), stamped.line)
  check('13 practice keeps first', !has(practice.env.ent, 'bonus.first') && practice.env.sunmarks === 0)
  const called = openMeta(memStore())
  called.arm('sundial')
  called.noteDev()
  const viaNw = called.credit({ seconds: 90, bossKills: 0, cleared: false, finale: false, mapId: 'sundial', practice: false })
  check('13 nw call', viaNw.total === 0 && viaNw.line.toLowerCase().includes('practice'), viaNw.line)
  check('13 nw keeps first', !has(called.env.ent, 'bonus.first'))
  called.endRun()
  called.arm('sundial')
  const after = called.credit({ seconds: 90, bossKills: 0, cleared: false, finale: false, mapId: 'sundial', practice: false })
  check('13 after end', after.total === 21, String(after.total))
  const prev = globalThis.location
  globalThis.location = { search: '?dev=1' } as Location
  try {
    const url = openMeta(memStore())
    const blocked = url.credit({ seconds: 90, bossKills: 0, cleared: false, finale: false, mapId: 'sundial', practice: false })
    check('13 ?dev', blocked.total === 0 && !has(url.env.ent, 'bonus.first'), blocked.line)
  } finally {
    globalThis.location = prev
  }
  globalThis.location = { search: '?seed=11' } as Location
  try {
    const url = openMeta(memStore())
    check('13 ?seed', url.credit({ seconds: 30, bossKills: 0, cleared: false, finale: false, mapId: 'sundial', practice: false }).total === 0)
  } finally {
    globalThis.location = prev
  }
  globalThis.location = { search: '?arsenal=l5' } as Location
  try {
    const url = openMeta(memStore())
    check('13 ?arsenal', url.credit({ seconds: 30, bossKills: 0, cleared: false, finale: false, mapId: 'sundial', practice: false }).total === 0)
  } finally {
    globalThis.location = prev
  }
  globalThis.location = { search: '?evo=all' } as Location
  try {
    const url = openMeta(memStore())
    check('13 ?evo', url.credit({ seconds: 30, bossKills: 0, cleared: false, finale: false, mapId: 'sundial', practice: false }).total === 0)
  } finally {
    globalThis.location = prev
  }
}

function fixture14(): void {
  const store = memStore()
  openMeta(store)
  const keys = store.keys()
  check('14 only meta', keys.length === 1 && keys[0] === META, keys.join(','))
  check('14 no origin sync', !keys.some((key) => key.includes('github') || key.includes('portal') || key.includes('sync')))
}

function earnMath(): void {
  check('score 90 death', scoreRun(90, 0, false, false, false, false, 0) === 21)
  check('score cap', scoreRun(30, 0, false, false, true, false, 0.45) === 2)
  check('score over cap', scoreRun(30, 0, false, false, true, false, 0.65) === 2)
  check('score clear boss', scoreRun(300, 1, true, false, true, false, 0) === 30)
  check('score finale first', scoreRun(300, 1, true, true, true, false, 0) === 55)
  check('score finale repeat', scoreRun(300, 1, true, true, true, true, 0) === 35)
  const store = memStore({
    [META]: JSON.stringify({
      v: 1,
      rev: 3,
      sunmarks: 0,
      ent: ['bonus.first', 'line.sliver', 'line.hard', 'line.blister'],
      wheel: [],
      lines: ['line.sliver', 'line.hard', 'line.blister'],
      palette: 'default',
      daily: {},
      migratedFrom: 'fresh',
      inferred: [],
    }),
  })
  const s = openMeta(store)
  s.arm('sundial')
  const lined = s.credit({ seconds: 90, bossKills: 0, cleared: false, finale: false, mapId: 'sundial', practice: false })
  check('score lines +40', lined.total === 8, `${lined.total} ${lined.line}`)
  const rich = openMeta(memStore({
    [META]: JSON.stringify({
      v: 1,
      rev: 2,
      sunmarks: 200,
      ent: ['bonus.first'],
      wheel: [],
      lines: [],
      palette: 'default',
      daily: {},
      migratedFrom: 'fresh',
      inferred: [],
    }),
  }))
  const confirm = rich.buy('mark.weaponB', false)
  check('confirm 100', !confirm.ok && confirm.reason === 'confirm' && rich.env.sunmarks === 200, confirm.reason)
  const yes = rich.buy('mark.weaponB', true)
  check('confirm yes', yes.ok && rich.env.sunmarks === 100 && has(rich.env.wheel, 'mark.weaponB'))
  check('next', !has(rich.env.wheel, 'mark.frame') && rich.env.sunmarks === 100, rich.env.wheel.join(','))
}

fixture1()
fixture2()
fixture3()
fixture4()
fixture5()
fixture6()
fixture7()
fixture8()
fixture9()
fixture10()
fixture11()
fixture12()
fixture13()
fixture14()
earnMath()

if (fails.length) {
  for (const line of fails) console.error(line)
  console.error(`${fails.length} failed`)
  process.exit(1)
}
console.log('r1a fixtures: 14 pass, earn math pass')
