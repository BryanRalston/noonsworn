/**
 * Procedural lattice cookie and key art.
 * White pixels are openings (coins). Black pixels are carved stone.
 * The pattern is an original 4-way screen: a circle inside a square,
 * with an 8-point star in the gaps. It is not copied from a real screen.
 */
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SIZE = 256
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'maps')

function pixel(nx, ny, star) {
  const ax = Math.abs(nx)
  const ay = Math.abs(ny)
  const r = Math.hypot(nx, ny)
  if (Math.max(ax, ay) > 0.96) return 0
  if (Math.max(ax, ay) > 0.8) return 0
  if (r < 0.5) return 255
  let ang = Math.atan2(ny, nx)
  if (ang < 0) ang += Math.PI * 2
  let best = Math.PI
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    let d = Math.abs(ang - a)
    if (d > Math.PI) d = Math.PI * 2 - d
    if (d < best) best = d
  }
  if (best < star && r > 0.22 && r < 0.8) return 255
  return 0
}

function fill(star) {
  const raw = Buffer.alloc(SIZE * SIZE)
  let white = 0
  for (let y = 0; y < SIZE; y++) {
    const ny = (y + 0.5) / SIZE * 2 - 1
    for (let x = 0; x < SIZE; x++) {
      const nx = (x + 0.5) / SIZE * 2 - 1
      const v = pixel(nx, ny, star)
      raw[y * SIZE + x] = v
      if (v > 127) white++
    }
  }
  return { raw, fraction: white / (SIZE * SIZE) }
}

function tune() {
  let lo = 0.02
  let hi = 0.55
  let best = fill(0.2)
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    const got = fill(mid)
    best = got
    if (got.fraction < 0.498) lo = mid
    else hi = mid
  }
  return { star: (lo + hi) / 2, ...fill((lo + hi) / 2), lo, hi, probe: best.fraction }
}

function keyArt() {
  const w = 384
  const h = 216
  const rgb = Buffer.alloc(w * h * 3)
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 3
    rgb[i] = r
    rgb[i + 1] = g
    rgb[i + 2] = b
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = y / h
      if (t < 0.22) put(x, y, 156, 122, 78)
      else if (t < 0.46) put(x, y, 233, 210, 166)
      else if (t < 0.7) put(x, y, 205, 174, 124)
      else put(x, y, 156, 122, 78)
      const nx = Math.abs((x / w) * 2 - 1)
      const open = nx > 0.22 && nx < 0.48 || nx < 0.12
      if (t >= 0.22 && !open && (x + y) % 7 === 0) put(x, y, 242, 182, 50)
      if (t >= 0.22 && !open && (x * 3 + y) % 11 === 0) put(x, y, 255, 214, 107)
    }
  }
  for (let x = 0; x < w; x++) {
    put(x, Math.floor(h * 0.22), 138, 90, 43)
    put(x, Math.floor(h * 0.46), 138, 90, 43)
    put(x, Math.floor(h * 0.7), 138, 90, 43)
  }
  return sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 9 })
}

const tuned = tune()
if (tuned.fraction < 0.4 || tuned.fraction > 0.5) {
  console.error(`cookie coverage ${tuned.fraction.toFixed(4)} is outside 40-50%`)
  process.exit(1)
}
await mkdir(root, { recursive: true })
await sharp(tuned.raw, { raw: { width: SIZE, height: SIZE, channels: 1 } }).png({ compressionLevel: 9 }).toFile(join(root, 'lattice-cookie.png'))
await keyArt().toFile(join(root, 'lattice-key.png'))
console.log(`cookie white ${(tuned.fraction * 100).toFixed(2)}% star ${tuned.star.toFixed(4)}`)
