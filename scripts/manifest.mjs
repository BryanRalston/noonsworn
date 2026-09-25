import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FIXED = [
  ['floor', /^tex_floor_sandstone\./],
  ['pillar', /^tex_pillar_carved\./],
  ['inlay', /^tex_inlay_tile\./],
  ['sky', /^sky_backdrop\./],
  ['keyart', /^title_keyart\./],
  ['logo', /^logo_noonsworn\./],
]

export function writeArtManifest(root) {
  const dir = join(root, 'public', 'assets', 'art')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const names = readdirSync(dir).filter((name) => name !== 'manifest.json')
  const slots = {}
  for (const [id, re] of FIXED) {
    const file = names.find((name) => re.test(name))
    if (file) slots[id] = file
  }
  for (const name of names) {
    const match = /^icon_([a-z0-9]+)\./.exec(name)
    if (match) slots[`card_${match[1]}`] = name
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(slots))
  return slots
}
