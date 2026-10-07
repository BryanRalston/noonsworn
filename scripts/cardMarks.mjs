/** Eight level-up marks past the original 13-cell strip. Each copies an existing cell and stamps a badge. */
export const EXTRA = [
  ['mirage', 4],
  ['helio', 9],
  ['scarab', 6],
  ['stake', 0],
  ['prism', 7],
  ['multitude', 0],
  ['reach', 1],
  ['endurance', 5],
]

const GLYPH = {
  mirage: '<path d="M38 42h8M46 39l4 3-4 3M38 50h8M46 47l4 3-4 3" fill="none" stroke="#FFF3B0" stroke-width="1.6" stroke-linecap="square"/>',
  helio: '<circle cx="46" cy="46" r="3.2" fill="#FFF3B0"/><path d="M46 39v3M46 50v3M39 46h3M50 46h3M41 41l2 2M51 41l-2 2M41 51l2-2M51 51l-2-2" stroke="#F2B632" stroke-width="1.4"/>',
  scarab: '<ellipse cx="46" cy="47" rx="6" ry="4" fill="none" stroke="#FFF3B0" stroke-width="1.6"/><path d="M46 43v8M42 45h8" stroke="#F2B632" stroke-width="1.2"/>',
  stake: '<path d="M46 38v14M43 50h6" fill="none" stroke="#FFF3B0" stroke-width="1.8" stroke-linecap="square"/>',
  prism: '<path d="M46 39l6 10h-12z" fill="none" stroke="#FFF3B0" stroke-width="1.6"/>',
  multitude: '<circle cx="42" cy="46" r="1.7" fill="#FFF3B0"/><circle cx="46.5" cy="43" r="1.7" fill="#FFF3B0"/><circle cx="50" cy="47.5" r="1.7" fill="#FFF3B0"/>',
  reach: '<path d="M40 46h12M40 46l3-3M40 46l3 3M52 46l-3-3M52 46l-3 3" fill="none" stroke="#FFF3B0" stroke-width="1.6"/>',
  endurance: '<path d="M40 42h12v7c0 3-2.4 5-6 6-3.6-1-6-3-6-6z" fill="none" stroke="#FFF3B0" stroke-width="1.6"/>',
}

export function badgeSvg(mark) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="46" cy="46" r="15" fill="#141225"/><circle cx="46" cy="46" r="13.5" fill="none" stroke="#F2B632" stroke-width="2"/>${GLYPH[mark] ?? ''}</svg>`,
  )
}
