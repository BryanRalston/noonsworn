/**
 * Repaint W1 and W2 atlas cells. Cells 0–15 stay byte-identical.
 * Cell 28 (fence) stays empty for W3.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stat, rename } from 'node:fs/promises'
import sharp from 'sharp'

const TILE = 256
const DST = 1536
const INSET = 10
const BOX = 236
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'vfx', 'vfx_atlas.png')

const GOLD = [242, 182, 50, 255]
const HOT = [255, 214, 120, 255]
const WHITE = [255, 244, 210, 255]
const BRONZE = [90, 58, 22, 255]
const RIM = [70, 42, 16, 255]

function cellOrigin(i) {
  return [(i % 6) * TILE + INSET, ((i / 6) | 0) * TILE + INSET]
}

function paint(dst, i, draw) {
  const [ox, oy] = cellOrigin(i)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const p = ((oy - INSET + y) * DST + (ox - INSET + x)) * 4
      dst[p] = 0
      dst[p + 1] = 0
      dst[p + 2] = 0
      dst[p + 3] = 0
    }
  }
  const put = (x, y, rgba, a = 1) => {
    const ix = ox + Math.round(x)
    const iy = oy + Math.round(y)
    if (ix < ox || iy < oy || ix >= ox + BOX || iy >= oy + BOX) return
    const p = (iy * DST + ix) * 4
    const alpha = Math.max(0, Math.min(1, ((rgba[3] ?? 255) / 255) * a))
    if (alpha <= 0) return
    const keep = 1 - alpha
    dst[p] = (dst[p] ?? 0) * keep + (rgba[0] ?? 0) * alpha
    dst[p + 1] = (dst[p + 1] ?? 0) * keep + (rgba[1] ?? 0) * alpha
    dst[p + 2] = (dst[p + 2] ?? 0) * keep + (rgba[2] ?? 0) * alpha
    dst[p + 3] = Math.min(255, (dst[p + 3] ?? 0) * keep + 255 * alpha)
  }
  const disc = (cx, cy, r, rgba) => {
    const r2 = r * r
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r2) put(cx + x, cy + y, rgba)
  }
  const ring = (cx, cy, r0, r1, rgba) => {
    const a = r0 * r0
    const b = r1 * r1
    for (let y = -r1; y <= r1; y++) {
      for (let x = -r1; x <= r1; x++) {
        const d = x * x + y * y
        if (d >= a && d <= b) put(cx + x, cy + y, rgba)
      }
    }
  }
  draw({ put, disc, ring, cx: BOX / 2, cy: BOX / 2 })
}

const marks = {
  16: (d) => {
    d.disc(d.cx, d.cy, 100, GOLD)
    d.ring(d.cx, d.cy, 78, 100, HOT)
    d.ring(d.cx, d.cy, 100, 112, RIM)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      for (let t = 104; t <= 116; t++) d.put(d.cx + Math.cos(a) * t, d.cy + Math.sin(a) * t, HOT)
    }
  },
  17: (d) => {
    d.ring(d.cx, d.cy, 40, 92, GOLD)
    d.ring(d.cx, d.cy, 86, 98, RIM)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      for (let t = 92; t <= 114; t++) d.put(d.cx + c * t, d.cy + s * t, HOT, 1 - (t - 92) / 28)
    }
  },
  18: (d) => {
    d.disc(d.cx, d.cy, 108, GOLD)
    d.disc(d.cx, d.cy, 36, WHITE)
    d.ring(d.cx, d.cy, 96, 112, RIM)
  },
  19: (d) => {
    d.ring(d.cx, d.cy, 70, 108, GOLD)
    d.ring(d.cx, d.cy, 100, 114, RIM)
  },
  20: (d) => {
    d.disc(d.cx, d.cy, 96, GOLD)
    d.ring(d.cx, d.cy, 80, 100, HOT)
  },
  21: (d) => {
    d.disc(d.cx, d.cy, 34, GOLD)
    d.ring(d.cx, d.cy, 30, 40, RIM)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      for (let t = 40; t <= 100; t++) d.put(d.cx + Math.cos(a) * t, d.cy + Math.sin(a) * t, HOT, 1 - (t - 40) / 70)
    }
  },
  22: (d) => {
    for (let y = 8; y <= 228; y++) {
      const v = Math.abs(y - d.cy) / 110
      const half = 22 * (1 - v * v)
      for (let x = d.cx - half; x <= d.cx + half; x++) d.put(x, y, GOLD)
      d.put(d.cx, y, RIM)
    }
  },
  23: (d) => {
    d.disc(d.cx, d.cy, 18, HOT)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const len = i % 2 === 0 ? 100 : 58
      for (let t = 0; t <= len; t++) d.put(d.cx + Math.cos(a) * t, d.cy + Math.sin(a) * t, GOLD, 1 - t / len)
    }
  },
  24: (d) => {
    for (let y = 16; y <= 220; y++) {
      for (let x = d.cx - 28; x <= d.cx + 28; x++) d.put(x, y, Math.abs(x - d.cx) < 8 ? WHITE : GOLD)
      d.put(d.cx - 30, y, RIM)
      d.put(d.cx + 30, y, RIM)
    }
  },
  25: (d) => {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      const r = 30 + (i % 5) * 16
      d.disc(d.cx + Math.cos(a) * r, d.cy + Math.sin(a) * r, 8, GOLD)
    }
  },
  26: (d) => {
    for (let y = 8; y <= 228; y++) {
      for (let x = d.cx - 18; x <= d.cx + 18; x++) d.put(x, y, Math.abs(x - d.cx) < 5 ? GOLD : RIM)
    }
  },
  27: (d) => {
    d.disc(d.cx, d.cy, 20, WHITE)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4
      for (let t = 16; t <= 108; t++) d.put(d.cx + Math.cos(a) * t, d.cy + Math.sin(a) * t, HOT, 1 - (t - 16) / 100)
    }
  },
  29: (d) => {
    d.disc(d.cx, d.cy, 90, [255, 200, 80, 180])
    d.disc(d.cx, d.cy, 40, [255, 230, 160, 220])
  },
  30: (d) => {
    d.ring(d.cx, d.cy, 78, 108, GOLD)
    d.ring(d.cx, d.cy, 104, 114, RIM)
  },
  31: (d) => {
    for (let y = 20; y <= 216; y++) {
      const w = 6 + (1 - Math.abs(y - d.cy) / 100) * 10
      for (let x = d.cx - w; x <= d.cx + w; x++) d.put(x, y, HOT, 0.9)
    }
  },
}

const src = await sharp(root).ensureAlpha().raw().toBuffer()
const dst = Buffer.from(src)
for (const key of Object.keys(marks)) paint(dst, Number(key), marks[key])
const next = root + '.next.png'
await sharp(dst, { raw: { width: DST, height: DST, channels: 4 } }).png({ compressionLevel: 9 }).toFile(next)
const info = await sharp(next).metadata()
const size = (await stat(next)).size
await rename(next, root)
console.log(JSON.stringify({ width: info.width, height: info.height, bytes: size }))
