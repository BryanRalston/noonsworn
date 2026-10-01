import {
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type Material,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

export interface MorphLut {
  weights: Float32Array
  cols: number
}

export interface EnemyMesh {
  geometry: BufferGeometry
  material: Material
  hop: MorphLut | null
  gallop: MorphLut | null
  lunge: MorphLut | null
}

export interface Cast {
  gltf: GLTF
  mite: EnemyMesh
  hound: EnemyMesh
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

function packLut(rows: number[][]): MorphLut {
  const cols = rows[0]?.length ?? 0
  const weights = new Float32Array(rows.length * cols)
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? []
    for (let c = 0; c < cols; c++) weights[r * cols + c] = row[c] ?? 0
  }
  return { weights, cols }
}

function dressEnemy(root: Object3D, nodeName: string): { geometry: BufferGeometry; material: Material } {
  const node = root.getObjectByName(nodeName) as Mesh | undefined
  const mesh = node?.isMesh ? node : meshesOf(root)[0]
  if (!mesh) throw new Error(`${nodeName} mesh missing`)
  const geo = mesh.geometry
  // Assets face +Z. The horde yaws a local −Z front (yawFromDirection).
  geo.rotateY(Math.PI)
  geo.computeBoundingSphere()
  if (geo.boundingSphere) geo.boundingSphere.radius += 0.45
  const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial
  const material = source.clone()
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iFlash;\nattribute float iLit;\nvarying float vFlash;\nvarying float vLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlash = iFlash;\nvLit = iLit;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;\nvarying float vLit;')
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight = mix(outgoingLight, vec3(1.0, 0.93, 0.75), clamp(vFlash, 0.0, 1.0));
        if (vLit < 0.5) outgoingLight *= 0.72;
        #include <opaque_fragment>`,
      )
  }
  return { geometry: geo, material }
}

async function loadGltf(loader: GLTFLoader, url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })
}

interface LutFile {
  lut: Record<string, { weights: number[][] }>
}

export async function loadCast(): Promise<Cast> {
  await MeshoptDecoder.ready
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const base = `${import.meta.env.BASE_URL}assets/chars/`
  const [gltf, miteGltf, houndGltf, lutRes] = await Promise.all([
    loadGltf(loader, `${base}sela_v7.glb`),
    loadGltf(loader, `${base}mite_v2.glb`),
    loadGltf(loader, `${base}hound_v2.glb`),
    fetch(`${base}enemies_v2.json`),
  ])
  if (!lutRes.ok) throw new Error('enemies_v2.json missing')
  const lut = (await lutRes.json()) as LutFile
  const mite = dressEnemy(miteGltf.scene, 'mite')
  const hound = dressEnemy(houndGltf.scene, 'hound')
  if (triCount(mite.geometry) < 1 || triCount(hound.geometry) < 1) throw new Error('enemy mesh is empty')
  const hop = packLut(lut.lut['mite.hop']?.weights ?? [])
  const gallop = packLut(lut.lut['hound.gallop']?.weights ?? [])
  const lunge = packLut(lut.lut['hound.lunge']?.weights ?? [])
  return {
    gltf,
    mite: { ...mite, hop, gallop: null, lunge: null },
    hound: { ...hound, hop: null, gallop, lunge },
  }
}
