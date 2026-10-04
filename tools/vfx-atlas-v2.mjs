/**
 * Grow public/assets/vfx/vfx_atlas.png from 4×4 to 6×6.
 * Cells 0–15 are copied 1:1 (256 px tiles). Cells 16–23 are original gold,
 * white-gold, and bronze marks. Cells 24–35 stay empty.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SRC = 1024
const TILE = 256
const DST = 1536
const INSET = 10
const BOX = 236
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'vfx', 'vfx_atlas.png')

const GOLD = [226, 176, 74, 255]
const GOLD_HOT = [240, 212, 138, 255]
const WHITE = [255, 244, 224, 255]
const BRONZE = [140, 104, 68, 255]
const SPINE = [90, 58, 22, 255]

function copyTile(src, dst, i) {
  const sc = i % 4
  const sr = (i / 4) | 0
  const dc = i % 6
  const dr = (i / 6) | 0
  for (let y = 0; y < TILE; y++) {
    const s0 = ((sr * TILE + y) * SRC + sc * TILE) * 4
    const d0 = ((dr * TILE + y) * DST + dc * TILE) * 4
    src.copy(dst, d0, s0, s0 + TILE * 4)
  }
}

function cellOrigin(i) {
  const c = i % 6
  const r = (i / 6) | 0
  return [c * TILE + INSET, r * TILE + INSET]
}

function paint(dst, i, draw) {
  const [ox, oy] = cellOrigin(i)
  const put = (x, y, rgba, a = 1) => {
    const ix = ox + Math.round(x)
    const iy = oy + Math.round(y)
    if (ix < ox || iy < oy || ix >= ox + BOX || iy >= oy + BOX) return
    const p = (iy * DST + ix) * 4
    const alpha = Math.max(0, Math.min(1, (rgba[3] / 255) * a))
    if (alpha <= 0) return
    const keep = 1 - alpha
    dst[p] = (dst[p] ?? 0) * keep + rgba[0] * alpha
    dst[p + 1] = (dst[p + 1] ?? 0) * keep + rgba[1] * alpha
    dst[p + 2] = (dst[p + 2] ?? 0) * keep + rgba[2] * alpha
    dst[p + 3] = Math.min(255, (dst[p + 3] ?? 0) * keep + 255 * alpha)
  }
  const disc = (cx, cy, r, rgba) => {
    const r2 = r * r
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r2) put(cx + x, cy + y, rgba)
      }
    }
  }
  const ring = (cx, cy, r0, r1, rgba) => {
    const a = r0 * r0
    const b = r1 * r1
    const r = r1
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y
        if (d >= a && d <= b) put(cx + x, cy + y, rgba)
      }
    }
  }
  draw({ put, disc, ring, cx: BOX / 2, cy: BOX / 2 })
}

function sunspot(d) {
  d.disc(d.cx, d.cy, 78, GOLD)
  d.ring(d.cx, d.cy, 70, 84, GOLD_HOT)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    for (let t = 88; t <= 108; t += 1) d.put(d.cx + Math.cos(a) * t, d.cy + Math.sin(a) * t, GOLD_HOT)
  }
}

function flareBand(d) {
  d.ring(d.cx, d.cy, 46, 78, GOLD)
  d.ring(d.cx, d.cy, 58, 68, GOLD_HOT)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    for (let t = 78; t <= 112; t++) {
      const w = 1 - (t - 78) / 34
      d.put(d.cx + c * t, d.cy + s * t, t > 100 ? WHITE : GOLD_HOT, w)
      d.put(d.cx + c * t + s * 2, d.cy + s * t - c * 2, GOLD, w * 0.8)
    }
  }
}

function flareCore(d) {
  d.disc(d.cx, d.cy, 70, WHITE)
  d.disc(d.cx, d.cy, 28, GOLD_HOT)
}

function shockRing(d) {
  d.ring(d.cx, d.cy, 62, 96, BRONZE)
  d.ring(d.cx, d.cy, 74, 84, GOLD)
}

function bellShadow(d) {
  d.disc(d.cx, d.cy, 90, [196, 146, 42, 180])
  d.ring(d.cx, d.cy, 78, 96, GOLD)
}

function gleam(d) {
  d.disc(d.cx, d.cy, 28, GOLD_HOT)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    for (let t = 32; t <= 100; t++) {
      const w = t < 70 ? 1 : 1 - (t - 70) / 30
      d.put(d.cx + c * t, d.cy + s * t, GOLD, w)
      d.put(d.cx + c * t + s, d.cy + s * t - c, GOLD_HOT, w)
    }
  }
}

function lanceRibbon(d) {
  for (let y = 20; y <= 216; y++) {
    const v = Math.abs(y - d.cy) / 98
    const half = 10 * (1 - v * v)
    for (let x = d.cx - half; x <= d.cx + half; x++) d.put(x, y, y % 28 < 14 ? GOLD_HOT : GOLD)
  }
  for (let y = 40; y <= 196; y++) d.put(d.cx, y, SPINE)
}

function impactStar(d) {
  d.disc(d.cx, d.cy, 16, WHITE)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const len = i % 2 === 0 ? 96 : 54
    const c = Math.cos(a)
    const s = Math.sin(a)
    for (let t = 0; t <= len; t++) {
      const w = 1 - t / len
      d.put(d.cx + c * t, d.cy + s * t, i % 2 === 0 ? GOLD_HOT : GOLD, w)
    }
  }
}

const src = await sharp(root).ensureAlpha().raw().toBuffer()
const dst = Buffer.alloc(DST * DST * 4, 0)
for (let i = 0; i < 16; i++) copyTile(src, dst, i)
const marks = [sunspot, flareBand, flareCore, shockRing, bellShadow, gleam, lanceRibbon, impactStar]
for (let k = 0; k < marks.length; k++) paint(dst, 16 + k, marks[k])

await sharp(dst, { raw: { width: DST, height: DST, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(root + '.next.png')

const written = await sharp(root + '.next.png').metadata()
const { size } = await import('node:fs/promises').then(async (fs) => {
  const st = await fs.stat(root + '.next.png')
  return { size: st.size }
})
await import('node:fs/promises').then((fs) => fs.rename(root + '.next.png', root))
console.log(JSON.stringify({ width: written.width, height: written.height, bytes: size }))
