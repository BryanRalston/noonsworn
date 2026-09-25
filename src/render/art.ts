import { MeshBasicMaterial, MeshToonMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import type { FloorUniforms } from './floorShader'

export interface ArtSlots {
  [id: string]: string
}

export interface ArtBind {
  pillar: MeshToonMaterial
  walls: MeshToonMaterial
  outer: MeshToonMaterial
  sky: MeshBasicMaterial
  inlay: MeshBasicMaterial
}

export function loadArt(uniforms: FloorUniforms, bind: ArtBind, onReady: (slots: ArtSlots) => void) {
  const base = import.meta.env.BASE_URL
  void fetch(`${base}assets/art/manifest.json`)
    .then(async (res) => (res.ok ? ((await res.json()) as ArtSlots) : ({} as ArtSlots)))
    .then((slots) => {
      const loader = new TextureLoader()
      const tiling = (tex: Texture, repeatX: number, repeatY: number) => {
        tex.wrapS = RepeatWrapping
        tex.wrapT = RepeatWrapping
        tex.colorSpace = SRGBColorSpace
        tex.anisotropy = 4
        tex.repeat.set(repeatX, repeatY)
        return tex
      }
      if (slots.floor) {
        loader.load(`${base}assets/art/${slots.floor}`, (tex) => {
          uniforms.uAlbedo.value = tiling(tex, 1, 1)
          uniforms.uTexMix.value = 1
          const wall = tex.clone()
          wall.needsUpdate = true
          bind.walls.map = tiling(wall, 0.35, 0.55)
          bind.walls.needsUpdate = true
          const dune = tex.clone()
          dune.needsUpdate = true
          bind.outer.map = tiling(dune, 8, 8)
          bind.outer.needsUpdate = true
        })
      }
      if (slots.pillar) {
        loader.load(`${base}assets/art/${slots.pillar}`, (tex) => {
          bind.pillar.map = tiling(tex, 1, 1.6)
          bind.pillar.needsUpdate = true
        })
      }
      if (slots.sky) {
        loader.load(`${base}assets/art/${slots.sky}`, (tex) => {
          tex.colorSpace = SRGBColorSpace
          tex.anisotropy = 4
          bind.sky.map = tex
          bind.sky.needsUpdate = true
        })
      }
      if (slots.inlay) {
        loader.load(`${base}assets/art/${slots.inlay}`, (tex) => {
          tex.colorSpace = SRGBColorSpace
          tex.anisotropy = 4
          bind.inlay.map = tex
          bind.inlay.needsUpdate = true
        })
      }
      onReady(slots)
    })
    .catch(() => onReady({}))
}
