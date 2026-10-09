import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const audioDir = join(root, 'public', 'assets', 'audio')
const licensePath = join(root, 'audio-src', 'LICENSES.md')
const archive = join(root, 'audio-src', 'licenses', 'music')

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ogg|m4a)$/i.test(name)) out.push(path)
  }
  return out
}

const files = walk(audioDir, [])
const text = readFileSync(licensePath, 'utf8')
const start = text.indexOf('<!-- shipped-hashes -->')
const end = text.indexOf('<!-- /shipped-hashes -->')
const missing = []
if (start < 0 || end < start) missing.push('shipped-hashes marker')
const block = start >= 0 && end > start ? text.slice(start, end) : ''

for (const path of files) {
  const rel = relative(audioDir, path).replaceAll('\\', '/')
  const buf = readFileSync(path)
  const hash = createHash('sha256').update(buf).digest('hex')
  if (!block.includes(rel) || !block.includes(hash)) missing.push(rel)
  if (rel.startsWith('music/') && !text.includes('CC0 1.0')) missing.push(`${rel} licence`)
}

if (files.some((path) => path.replaceAll('\\', '/').includes('music_desert_loop'))) missing.push('music_desert_loop still shipped')

const cues = ['menu', 'sundial', 'lattice', 'cloister', 'stair', 'boss', 'nadir', 'sunrise']
for (const cue of cues) {
  for (const name of ['oga_page.html', 'oga_page.pdf']) {
    try {
      statSync(join(archive, cue, name))
    } catch {
      missing.push(`archive ${cue}/${name}`)
    }
  }
}
try {
  statSync(join(archive, 'stair', 'oga_page_upstream_TAD.pdf'))
} catch {
  missing.push('archive stair/oga_page_upstream_TAD.pdf')
}

if (missing.length) {
  console.error(`LICENSES check failed (${missing.length})`)
  for (const row of missing) console.error(`  ${row}`)
  process.exit(1)
}

console.log(`LICENSES check ok (${files.length} audio files)`)
