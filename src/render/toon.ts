import { DataTexture, NearestFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from 'three'

let map: DataTexture | null = null

/** 3-step ramp. Darkest texel stays near 0.7 so umbral bodies do not fall to black. */
export function toonMap(): DataTexture {
  if (map) return map
  const data = new Uint8Array([
    184, 184, 184, 255,
    220, 220, 220, 255,
    255, 255, 255, 255,
  ])
  map = new DataTexture(data, 3, 1, RGBAFormat, UnsignedByteType)
  map.minFilter = NearestFilter
  map.magFilter = NearestFilter
  map.generateMipmaps = false
  map.colorSpace = NoColorSpace
  map.needsUpdate = true
  return map
}
