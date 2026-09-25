import { CanvasTexture, InstancedMesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { makeCrowd, writeInstance } from '../render/instancing'

const MAX = 1500

function blobTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return new CanvasTexture(canvas)
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

export interface BlobShadows {
  mesh: InstancedMesh
  begin: () => void
  put: (x: number, z: number, scale: number) => void
  end: () => void
}

export function createBlobShadows(): BlobShadows {
  const geo = new PlaneGeometry(1, 1)
  geo.rotateX(-Math.PI / 2)
  const mesh = makeCrowd(
    geo,
    new MeshBasicMaterial({
      map: blobTexture(),
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    MAX,
  )
  mesh.renderOrder = 2
  mesh.position.y = 0.04
  let n = 0
  return {
    mesh,
    begin() {
      n = 0
    },
    put(x, z, scale) {
      if (n >= MAX) return
      writeInstance(mesh, n, x, 0, z, 0, scale)
      n++
    },
    end() {
      mesh.count = n
      mesh.visible = n > 0
      if (n > 0) mesh.instanceMatrix.needsUpdate = true
    },
  }
}
