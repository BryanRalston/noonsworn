import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import type { FloorUniforms } from './floorShader'

export interface ArtSlots {
  [id: string]: string
}

export function loadArt(uniforms: FloorUniforms, onReady: (slots: ArtSlots) => void) {
  const base = import.meta.env.BASE_URL
  void fetch(`${base}assets/art/manifest.json`)
    .then(async (res) => (res.ok ? ((await res.json()) as ArtSlots) : ({} as ArtSlots)))
    .then((slots) => {
      const loader = new TextureLoader()
      const tiling = (tex: Texture) => {
        tex.wrapS = RepeatWrapping
        tex.wrapT = RepeatWrapping
        tex.colorSpace = SRGBColorSpace
        tex.anisotropy = 4
        return tex
      }
      if (slots.floor) {
        loader.load(`${base}assets/art/${slots.floor}`, (tex) => {
          uniforms.uAlbedo.value = tiling(tex)
          uniforms.uTexMix.value = 1
        })
      }
      onReady(slots)
    })
    .catch(() => onReady({}))
}
