import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COLOR } from '../data/palette'
import { TUNING } from '../data/tuning'

interface Bucket {
  pos: number[]
  col: number[]
}

function addVert(b: Bucket, x: number, y: number, z: number, color: Color) {
  b.pos.push(x, y, z)
  b.col.push(color.r, color.g, color.b)
}

function addQuad(
  b: Bucket,
  p0: readonly [number, number, number],
  p1: readonly [number, number, number],
  p2: readonly [number, number, number],
  p3: readonly [number, number, number],
  color: Color,
  dark: readonly [boolean, boolean, boolean, boolean],
) {
  const pts = [p0, p1, p2, p3]
  const order = [0, 1, 2, 0, 2, 3]
  for (let k = 0; k < order.length; k++) {
    const i = order[k] ?? 0
    const p = pts[i]
    if (!p) continue
    const c = dark[i] ? COLOR.sandstoneMid.clone().lerp(COLOR.sandstoneDeep, TUNING.arena.aoMix) : color
    addVert(b, p[0], p[1], p[2], c)
  }
}

function toGeo(b: Bucket): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(b.col, 3))
  return g
}

function paint(geo: BufferGeometry, color: Color, darkenBase: boolean, top: Color | null) {
  const pos = geo.getAttribute('position')
  const norm = geo.getAttribute('normal')
  const arr = new Float32Array(pos.count * 3)
  let minY = Infinity
  for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i))
  for (let i = 0; i < pos.count; i++) {
    const ny = norm ? norm.getY(i) : 0
    let c = ny > 0.6 && top ? top : color
    if (darkenBase && pos.getY(i) < minY + 0.45 && ny <= 0.6) c = color.clone().lerp(COLOR.sandstoneDeep, TUNING.arena.aoMix)
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new BufferAttribute(arr, 3))
  if (geo.getAttribute('normal')) geo.deleteAttribute('normal')
  if (geo.getAttribute('uv')) geo.deleteAttribute('uv')
  if (geo.index) {
    const flat = geo.toNonIndexed()
    geo.dispose()
    return flat
  }
  return geo
}

function buildWalls(): BufferGeometry {
  const b: Bucket = { pos: [], col: [] }
  const half = TUNING.arena.size / 2
  const t = TUNING.arena.wallThick
  const h = TUNING.arena.wallHeight
  const o = half + t
  const side = COLOR.sandstoneMid
  const top = COLOR.sandstone
  const dark: [boolean, boolean, boolean, boolean] = [true, false, false, true]
  const none: [boolean, boolean, boolean, boolean] = [false, false, false, false]
  addQuad(b, [-half, 0, half], [-half, h, half], [half, h, half], [half, 0, half], side, dark)
  addQuad(b, [half, 0, -half], [half, h, -half], [-half, h, -half], [-half, 0, -half], side, dark)
  addQuad(b, [half, 0, o], [half, h, o], [half, h, -o], [half, 0, -o], side, dark)
  addQuad(b, [-half, 0, -o], [-half, h, -o], [-half, h, o], [-half, 0, o], side, dark)
  addQuad(b, [o, 0, o], [o, h, o], [-o, h, o], [-o, 0, o], side, dark)
  addQuad(b, [-o, 0, -o], [-o, h, -o], [o, h, -o], [o, 0, -o], side, dark)
  addQuad(b, [o, 0, -o], [o, h, -o], [o, h, o], [o, 0, o], side, dark)
  addQuad(b, [-o, 0, o], [-o, h, o], [-o, h, -o], [-o, 0, -o], side, dark)
  addQuad(b, [-half, h, half], [-half, h, o], [half, h, o], [half, h, half], top, none)
  addQuad(b, [-half, h, -o], [-half, h, -half], [half, h, -half], [half, h, -o], top, none)
  addQuad(b, [half, h, -o], [half, h, o], [o, h, o], [o, h, -o], top, none)
  addQuad(b, [-o, h, -o], [-o, h, o], [-half, h, o], [-half, h, -o], top, none)
  return toGeo(b)
}

function pillarPiece(cx: number, cz: number): BufferGeometry[] {
  const h = TUNING.arena.pillarH
  const body = new CylinderGeometry(TUNING.arena.pillarR, TUNING.arena.pillarR, h, TUNING.arena.pillarSeg)
  body.translate(cx, h / 2, cz)
  const painted = paint(body, COLOR.sandstoneMid, true, COLOR.sandstone)
  const gem = new SphereGeometry(0.38, 8, 6)
  gem.translate(cx, h + 0.38, cz)
  const gold = paint(gem, COLOR.gold, false, null)
  return [painted, gold]
}

export function buildTemple(): BufferGeometry {
  const parts: BufferGeometry[] = [buildWalls()]
  const at = TUNING.arena.pillarAt
  const centers = [
    [-at, -at],
    [-at, at],
    [at, -at],
    [at, at],
  ]
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i]
    if (!c) continue
    const pieces = pillarPiece(c[0] ?? 0, c[1] ?? 0)
    parts.push(pieces[0]!, pieces[1]!)
  }
  const merged = mergeGeometries(parts, false)
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  if (!merged) throw new Error('temple merge failed')
  return merged
}
