import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

export interface Cast {
  gltf: GLTF
  mite: BufferGeometry
  hound: BufferGeometry
}

function triCount(geo: BufferGeometry): number {
  if (geo.index) return geo.index.count / 3
  return geo.getAttribute('position').count / 3
}

function meshesOf(root: Object3D): Mesh[] {
  const found: Mesh[] = []
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (mesh.isMesh) found.push(mesh)
  })
  return found
}

function findMesh(root: Object3D, materialName: string): Mesh {
  const meshes = meshesOf(root)
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i]
    if (!mesh) continue
    const mat = mesh.material
    const name = Array.isArray(mat) ? mat[0]?.name : mat.name
    if (name === materialName) return mesh
  }
  const names = meshes.map((mesh) => {
    const mat = mesh.material
    return Array.isArray(mat) ? mat.map((m) => m.name).join('+') : mat.name
  })
  throw new Error(`missing material ${materialName} in ${names.join(', ')}`)
}

const plumLo = new Color('#3a2a3f')
const plumHi = new Color('#4a3350')

/** Bake base or emissive colour into the vertex colours and tag glow. Legs are tagged before the facing rotation. */
function bake(mesh: Mesh, emit: number, legs: boolean, plum = false): BufferGeometry {
  const geo = mesh.geometry.clone()
  const mat = mesh.material as MeshStandardMaterial
  const src = geo.getAttribute('color')
  const pos = geo.getAttribute('position')
  const n = pos.count
  const col = new Float32Array(n * 3)
  const em = new Float32Array(n)
  const gal = new Float32Array(n)
  const glow = mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.02 ? mat.emissive : mat.color
  const tint = emit > 0 ? glow : mat.color
  const lift = emit > 0.5 ? 1 : 3.4
  for (let i = 0; i < n; i++) {
    const ao = src ? src.getX(i) : 1
    const t = ao < 0 ? 0 : ao > 1 ? 1 : ao
    if (plum && emit === 0) {
      col[i * 3] = plumLo.r + (plumHi.r - plumLo.r) * t
      col[i * 3 + 1] = plumLo.g + (plumHi.g - plumLo.g) * t
      col[i * 3 + 2] = plumLo.b + (plumHi.b - plumLo.b) * t
    } else {
      const k = (emit > 0.5 ? 1 : t) * lift
      col[i * 3] = tint.r * k
      col[i * 3 + 1] = tint.g * k
      col[i * 3 + 2] = tint.b * k
    }
    em[i] = emit
    const y = pos.getY(i)
    const z = pos.getZ(i)
    gal[i] = legs && y < 0.42 ? (z >= 0 ? 1 : -1) : 0
  }
  geo.deleteAttribute('uv')
  geo.deleteAttribute('uv1')
  geo.deleteAttribute('color')
  geo.setAttribute('color', new BufferAttribute(col, 3))
  geo.setAttribute('aEmit', new BufferAttribute(em, 1))
  geo.setAttribute('aGallop', new BufferAttribute(gal, 1))
  return geo
}

function mergeEnemy(root: Object3D, body: string, eyes: string, glow: string, legs: boolean, plum = false): BufferGeometry {
  const parts = [bake(findMesh(root, body), 0, legs, plum), bake(findMesh(root, eyes), 1, false), bake(findMesh(root, glow), 0.35, false)]
  const merged = mergeGeometries(parts, false)
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  if (!merged) throw new Error(`merge failed for ${body}`)
  // Assets face +Z. The horde yaws a local −Z front (yawFromDirection).
  merged.rotateY(Math.PI)
  if (legs) merged.scale(1.3, 1.3, 1.3)
  merged.computeBoundingSphere()
  return merged
}

async function loadGltf(loader: GLTFLoader, url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })
}

export async function loadCast(): Promise<Cast> {
  await MeshoptDecoder.ready
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const base = `${import.meta.env.BASE_URL}assets/chars/`
  const [gltf, miteGltf, houndGltf] = await Promise.all([
    loadGltf(loader, `${base}sela_rigged.glb`),
    loadGltf(loader, `${base}mite.glb`),
    loadGltf(loader, `${base}hound.glb`),
  ])
  const mite = mergeEnemy(miteGltf.scene, 'mite_body', 'mite_eyes', 'mite_cracks', false, true)
  const hound = mergeEnemy(houndGltf.scene, 'hound_body', 'hound_eyes', 'hound_seams', true)
  if (triCount(mite) < 1 || triCount(hound) < 1) throw new Error('enemy mesh is empty')
  return { gltf, mite, hound }
}
