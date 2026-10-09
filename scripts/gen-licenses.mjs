import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const audioDir = join(root, 'public', 'assets', 'audio')
const licensePath = join(root, 'audio-src', 'LICENSES.md')
const musicLicense = join(root, 'briefs', 'r2_audio', 'LICENSES_music.md')

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ogg|m4a)$/i.test(name)) out.push(path)
  }
  return out
}

function hashFile(path) {
  const buf = readFileSync(path)
  return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }
}

const shipped = new Map()
for (const path of walk(audioDir, [])) {
  const rel = relative(audioDir, path).replaceAll('\\', '/')
  shipped.set(rel, hashFile(path))
}

const musicText = readFileSync(musicLicense, 'utf8')
for (const line of musicText.split(/\r?\n/)) {
  const match = line.match(/^\| `([^`]+\.(?:ogg|m4a))` \| (\d+) \| `([0-9a-f]{64})` \|/)
  if (!match) continue
  const name = match[1]
  const rel = shipped.has(name) ? name : `music/${name}`
  const got = shipped.get(rel)
  if (!got) throw new Error(`music licence names a file that is not shipped: ${name}`)
  if (got.bytes !== Number(match[2]) || got.sha256 !== match[3]) {
    throw new Error(`music file drift ${rel}: disk ${got.bytes} ${got.sha256} licence ${match[2]} ${match[3]}`)
  }
}

let text = readFileSync(licensePath, 'utf8').replace(/\r\n/g, '\n')
const cut = text.indexOf('\n## R2 music')
if (cut >= 0) text = text.slice(0, cut)
text = text.replace(/\n<!-- shipped-hashes -->[\s\S]*$/, '')

const headEnd = text.indexOf('\n## M3b')
if (headEnd < 0) throw new Error('LICENSES.md is missing the M3b section')
let head = text.slice(0, headEnd)
const tail = text.slice(headEnd).replace(/\s*$/, '\n')

if (!head.includes('R2 re-encoded `amb_wind_loop`')) {
  head = head.replace(
    'Each shipped file has an AAC `.m4a` twin.',
    'Each shipped file has an AAC `.m4a` twin. R2 re-encoded `amb_wind_loop` to mono 48 kHz at the same loudness (−17.4 LUFS). `music_desert_loop` is retired.',
  )
}
head = head.replace(
  '- Music: "Desert Loop (Lo-Fi Remaster)" by iamoneabe — CC0.',
  '- Music: the R2 OpenGameArt cues listed below — CC0.',
)

const lines = []
let oggBytes = 0
let oggCount = 0
for (const line of head.split('\n')) {
  if (line.startsWith('|') && line.includes('music_desert_loop')) continue
  if (!line.startsWith('| `') || !line.includes('.ogg`')) {
    lines.push(line)
    continue
  }
  const cells = line.split('|')
  const file = cells[1]?.trim().replaceAll('`', '')
  const got = file ? shipped.get(file) : undefined
  if (!got || cells.length < 5) {
    lines.push(line)
    continue
  }
  cells[3] = ` ${got.bytes.toLocaleString('en-US')} `
  if (file === 'amb_wind_loop.ogg' && !cells[2].includes('48 kHz')) {
    cells[2] = `${cells[2].trimEnd()} Re-encoded in R2 to mono 48 kHz. `
  }
  oggBytes += got.bytes
  oggCount += 1
  lines.push(cells.join('|'))
}
head = lines.join('\n').replace(
  /\*\*Total: [\d,]+ bytes[^*]*\*\*[^\n]*/,
  `**Total: ${oggBytes.toLocaleString('en-US')} bytes** for ${oggCount} ogg files in this table.`,
)

const hashRows = [...shipped.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([rel, got]) => `| \`${rel}\` | ${got.bytes} | \`${got.sha256}\` |`)

const out = `${head.trimEnd()}
${tail.trimEnd()}

## R2 music

${musicText.trim()}

## Shipped audio hashes

Generated from the files in \`public/assets/audio/\`. The build fails when a shipped file is missing from this table or its sha256 does not match.

<!-- shipped-hashes -->
| File | Bytes | SHA-256 |
|---|---|---|
${hashRows.join('\n')}
<!-- /shipped-hashes -->
`
writeFileSync(licensePath, out.replace(/\n/g, '\n'))
console.log(`wrote ${licensePath} (${shipped.size} files)`)
