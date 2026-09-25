import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { writeArtManifest } from './manifest.mjs'

const root = process.cwd()
const srcDir = join(root, 'art-src')
const outDir = join(root, 'public', 'assets', 'art')

function find(stem) {
  if (!existsSync(srcDir)) return null
  return readdirSync(srcDir).find((name) => name.startsWith(`${stem}.`)) ?? null
}

async function keyAndSave(input, width, height, key, maxBytes) {
  let quality = 80
  const resized = sharp(input).resize(width, height, { fit: 'inside', withoutEnlargement: true }).ensureAlpha()
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    const dist = Math.abs(data[i] - key[0]) + Math.abs(data[i + 1] - key[1]) + Math.abs(data[i + 2] - key[2])
    if (dist < 70) data[i + 3] = 0
  }
  const stem = input.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'art'
  const dest = join(outDir, `${stem}.webp`)
  let last = 0
  while (quality >= 40) {
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality }).toFile(dest)
    last = (await import('node:fs')).statSync(dest).size
    if (!maxBytes || last <= maxBytes) break
    quality -= 8
  }
  return dest
}

async function plain(input, width, height, maxBytes) {
  const stem = input.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'art'
  const dest = join(outDir, `${stem}.webp`)
  let quality = 80
  while (quality >= 40) {
    await sharp(input).resize(width, height, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toFile(dest)
    const size = (await import('node:fs')).statSync(dest).size
    if (!maxBytes || size <= maxBytes) break
    quality -= 8
  }
  return dest
}

const jobs = [
  ['tex_floor_sandstone', 1024, 1024, false, 280000],
  ['tex_pillar_carved', 1024, 1024, false, 280000],
  ['tex_inlay_tile', 512, 512, false, 160000],
  ['sky_backdrop', 2048, 1024, false, 250000],
  ['title_keyart', 1920, 1080, false, 300000],
  ['logo_noonsworn', 1024, 512, true, 180000],
]
const icons = ['spear', 'halo', 'might', 'haste', 'swift', 'vitality', 'lodestone', 'wide', 'heal', 'flare', 'bell', 'longday', 'searing']

if (!existsSync(srcDir)) {
  writeArtManifest(root)
  process.exit(0)
}

for (const [stem, w, h, keyed, max] of jobs) {
  const file = find(stem)
  if (!file) continue
  const input = join(srcDir, file)
  if (keyed) await keyAndSave(input, w, h, [20, 18, 37], max)
  else await plain(input, w, h, max)
}
for (const id of icons) {
  const file = find(`icon_${id}`)
  if (!file) continue
  await keyAndSave(join(srcDir, file), 256, 256, [20, 18, 37], 40000)
}
const iconFiles = icons
  .map((id) => join(outDir, `icon_${id}.webp`))
  .filter((file) => existsSync(file))
if (iconFiles.length > 0) {
  const cell = 64
  const composites = []
  for (let i = 0; i < iconFiles.length; i++) {
    const input = await sharp(iconFiles[i]).resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    composites.push({ input, left: i * cell, top: 0 })
  }
  let quality = 72
  const dest = join(outDir, 'cards_atlas.webp')
  while (quality >= 36) {
    await sharp({
      create: { width: iconFiles.length * cell, height: cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(composites)
      .webp({ quality })
      .toFile(dest)
    const size = (await import('node:fs')).statSync(dest).size
    if (size <= 60000) break
    quality -= 8
  }
}
const slots = writeArtManifest(root)
console.log('art slots', Object.keys(slots).length)
