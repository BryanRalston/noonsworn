import { Color } from 'three'

export const HEX = {
  sky: '#F6E7C8',
  sandstone: '#E9D2A6',
  sandstoneMid: '#CDAE7C',
  sandstoneDeep: '#9C7A4E',
  sunlit: '#FFD66B',
  gold: '#F2B632',
  goldHot: '#FFF3B0',
  bronze: '#8A5A2B',
  shade: '#3C4F9A',
  shadeDeep: '#232C5E',
  umbral: '#2A1838',
  umbralRim: '#6B4FA0',
  telegraph: '#FF3D8B',
  xp: '#35D6C4',
  linen: '#FBF6EC',
  ink: '#141225',
} as const

function c(hex: string): Color {
  return new Color(hex)
}

export const COLOR = {
  sky: c(HEX.sky),
  sandstone: c(HEX.sandstone),
  sandstoneMid: c(HEX.sandstoneMid),
  sandstoneDeep: c(HEX.sandstoneDeep),
  sunlit: c(HEX.sunlit),
  gold: c(HEX.gold),
  goldHot: c(HEX.goldHot),
  bronze: c(HEX.bronze),
  shade: c(HEX.shade),
  shadeDeep: c(HEX.shadeDeep),
  umbral: c(HEX.umbral),
  umbralRim: c(HEX.umbralRim),
  telegraph: c(HEX.telegraph),
  xp: c(HEX.xp),
  linen: c(HEX.linen),
  ink: c(HEX.ink),
}

export function mountPalette(target: HTMLElement) {
  const style = target.style
  const keys = Object.keys(HEX) as (keyof typeof HEX)[]
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (!key) continue
    style.setProperty('--' + key, HEX[key])
  }
}
