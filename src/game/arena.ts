import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COLOR } from '../data/palette'
import { TUNING } from '../data/tuning'

interface WallBucket {
  pos: number[]
  uv: number[]
}

function push(b: WallBucket, x: number, y: number, z: number, u: number, v: number) {
  b.pos.push(x, y, z)
  b.uv.push(u, v)
}

function addQuad(
  b: WallBucket,
  p0: readonly [number, number, number],
  p1: readonly [number, number, number],
  p2: readonly [number, number, number],
  p3: readonly [number, number, number],
  u0: number,
  u1: number,
) {
  const pts = [p0, p1, p2, p3]
  const uvs: Array<[number, number]> = [
    [u0, 0],
    [u0, 1],
    [u1, 1],
    [u1, 0],
  ]
  const order = [0, 1, 2, 0, 2, 3]
  for (let k = 0; k < order.length; k++) {
    const i = order[k] ?? 0
    const p = pts[i]
    const uv = uvs[i]
    if (!p || !uv) continue
    push(b, p[0], p[1], p[2], uv[0], uv[1])
  }
}

export function buildWalls(): BufferGeometry {
  const b: WallBucket = { pos: [], uv: [] }
  const half = TUNING.arena.size / 2
  const t = TUNING.arena.wallThick
  const h = TUNING.arena.wallHeight
  const o = half + t
  const span = TUNING.arena.size / 4
  addQuad(b, [-half, 0, half], [-half, h, half], [half, h, half], [half, 0, half], 0, span)
  addQuad(b, [half, 0, -half], [half, h, -half], [-half, h, -half], [-half, 0, -half], 0, span)
  addQuad(b, [half, 0, o], [half, h, o], [half, h, -o], [half, 0, -o], 0, span)
  addQuad(b, [-half, 0, -o], [-half, h, -o], [-half, h, o], [-half, 0, o], 0, span)
  addQuad(b, [o, 0, o], [o, h, o], [-o, h, o], [-o, 0, o], 0, span)
  addQuad(b, [-o, 0, -o], [-o, h, -o], [o, h, -o], [o, 0, -o], 0, span)
  addQuad(b, [o, 0, -o], [o, h, -o], [o, h, o], [o, 0, o], 0, span * 0.2)
  addQuad(b, [-o, 0, o], [-o, h, o], [-o, h, -o], [-o, 0, -o], 0, span * 0.2)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(b.uv, 2))
  g.computeVertexNormals()
  return g
}

export function buildWallTrim(): BufferGeometry {
  const half = TUNING.arena.size / 2
  const t = TUNING.arena.wallThick
  const h = TUNING.arena.wallHeight
  const o = half + t
  const parts: BufferGeometry[] = []
  const strips: Array<[number, number, number, number]> = [
    [-half, half, half, o],
    [-half, half, -o, -half],
    [half, o, -o, o],
    [-o, -half, -o, o],
  ]
  for (let i = 0; i < strips.length; i++) {
    const s = strips[i]
    if (!s) continue
    const dx = Math.abs(s[1] - s[0])
    const dz = Math.abs(s[3] - s[2])
    const geo = new BoxGeometry(Math.max(dx, 0.2), 0.18, Math.max(dz, 0.2))
    geo.translate((s[0] + s[1]) / 2, h + 0.08, (s[2] + s[3]) / 2)
    parts.push(geo)
  }
  const merged = mergeGeometries(parts, false)
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  if (!merged) throw new Error('trim merge failed')
  return merged
}

function paint(geo: BufferGeometry, r: number, g: number, b: number) {
  const n = geo.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = r
    col[i * 3 + 1] = g
    col[i * 3 + 2] = b
  }
  geo.setAttribute('color', new BufferAttribute(col, 3))
}

export function buildPillars(): BufferGeometry {
  const parts: BufferGeometry[] = []
  const at = TUNING.arena.pillarAt
  const centers = [
    [-at, -at],
    [-at, at],
    [at, -at],
    [at, at],
  ]
  const h = TUNING.arena.pillarH
  const r = TUNING.arena.pillarR
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i]
    if (!c) continue
    const cx = c[0] ?? 0
    const cz = c[1] ?? 0
    const base = new CylinderGeometry(r * 1.45, r * 1.55, 0.5, 12)
    base.translate(cx, 0.25, cz)
    const shaft = new CylinderGeometry(r, r, h - 1.05, TUNING.arena.pillarSeg)
    shaft.translate(cx, 0.5 + (h - 1.05) / 2, cz)
    const capital = new CylinderGeometry(r * 1.6, r * 1.25, 0.55, 12)
    capital.translate(cx, h - 0.28, cz)
    paint(base, 1, 1, 1)
    paint(shaft, 1, 1, 1)
    paint(capital, 1, 1, 1)
    const gem = new SphereGeometry(0.34, 8, 6)
    gem.translate(cx, h + 0.28, cz)
    paint(gem, COLOR.gold.r, COLOR.gold.g, COLOR.gold.b)
    parts.push(base, shaft, capital, gem)
  }
  const merged = mergeGeometries(parts, false)
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  if (!merged) throw new Error('pillar merge failed')
  return merged
}

function flatGeo(geo: BufferGeometry): BufferGeometry {
  return geo.index ? geo.toNonIndexed() : geo
}

export function buildShell(): BufferGeometry {
  const walls = flatGeo(buildWalls())
  paint(walls, COLOR.sandstone.r, COLOR.sandstone.g, COLOR.sandstone.b)
  const trim = flatGeo(buildWallTrim())
  paint(trim, COLOR.sandstoneDeep.r, COLOR.sandstoneDeep.g, COLOR.sandstoneDeep.b)
  const merged = mergeGeometries([walls, trim], false)
  walls.dispose()
  trim.dispose()
  if (!merged) throw new Error('shell merge failed')
  return merged
}

export function createScatter(material: MeshToonMaterial): InstancedMesh {
  const column = flatGeo(new CylinderGeometry(0.38, 0.5, 3.2, 6))
  column.rotateZ(Math.PI / 2.4)
  column.translate(0, 0.42, 0)
  const rock = flatGeo(new BoxGeometry(0.9, 0.55, 0.7))
  rock.translate(1.15, 0.28, 0.15)
  const geo = mergeGeometries([column, rock], false)
  column.dispose()
  rock.dispose()
  if (!geo) throw new Error('scatter merge failed')
  const mesh = new InstancedMesh(geo, material, 16)
  mesh.count = 16
  mesh.frustumCulled = false
  const dummy = new Object3D()
  const half = TUNING.arena.size / 2 + TUNING.arena.wallThick
  const outs = [5, 8, 11, 13]
  let n = 0
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 4; i++) {
      const along = -16 + i * 11
      const out = outs[i] ?? 6
      let x = 0
      let z = 0
      let yaw = 0.35 * i
      if (s === 0) {
        x = along
        z = half + out
      } else if (s === 1) {
        x = along
        z = -(half + out)
        yaw += 1.2
      } else if (s === 2) {
        x = half + out
        z = along
        yaw += 2.1
      } else {
        x = -(half + out)
        z = along
        yaw += 0.7
      }
      dummy.position.set(x, 0, z)
      dummy.rotation.set(0, yaw, 0)
      const scale = 0.85 + (i % 3) * 0.18
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(n, dummy.matrix)
      n++
    }
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

export function createSunMark(): {
  mesh: Mesh
  place: (right: ArrayLike<number>, up: ArrayLike<number>, mx: number, my: number, mz: number, px: number, pz: number, yaw: number) => void
} {
  const disc = flatGeo(new CircleGeometry(2.4, 20))
  const beam = flatGeo(new BoxGeometry(0.18, 0.06, 2.4))
  const discAttr = disc.getAttribute('position')
  const beamAttr = beam.getAttribute('position')
  const discN = discAttr.count
  const beamN = beamAttr.count
  const discLocal = new Float32Array(discN * 3)
  const beamLocal = new Float32Array(beamN * 3)
  for (let i = 0; i < discN; i++) {
    discLocal[i * 3] = discAttr.getX(i)
    discLocal[i * 3 + 1] = discAttr.getY(i)
    discLocal[i * 3 + 2] = discAttr.getZ(i)
  }
  for (let i = 0; i < beamN; i++) {
    beamLocal[i * 3] = beamAttr.getX(i)
    beamLocal[i * 3 + 1] = beamAttr.getY(i)
    beamLocal[i * 3 + 2] = beamAttr.getZ(i)
  }
  const merged = mergeGeometries([disc, beam], false)
  disc.dispose()
  beam.dispose()
  if (!merged) throw new Error('sun mark merge failed')
  const pos = merged.getAttribute('position')
  const mesh = new Mesh(
    merged,
    new MeshBasicMaterial({ color: COLOR.goldHot, toneMapped: false, side: DoubleSide }),
  )
  mesh.frustumCulled = false
  return {
    mesh,
    place(right, up, mx, my, mz, px, pz, yaw) {
      const cy = Math.cos(yaw)
      const sy = Math.sin(yaw)
      for (let i = 0; i < discN; i++) {
        const lx = discLocal[i * 3] ?? 0
        const ly = discLocal[i * 3 + 1] ?? 0
        pos.setXYZ(
          i,
          mx + (right[0] ?? 0) * lx + (up[0] ?? 0) * ly,
          my + (right[1] ?? 0) * lx + (up[1] ?? 0) * ly,
          mz + (right[2] ?? 0) * lx + (up[2] ?? 0) * ly,
        )
      }
      for (let i = 0; i < beamN; i++) {
        const lx = beamLocal[i * 3] ?? 0
        const ly = beamLocal[i * 3 + 1] ?? 0
        const lz = beamLocal[i * 3 + 2] ?? 0
        const rx = lx * cy + lz * sy
        const rz = -lx * sy + lz * cy
        pos.setXYZ(discN + i, px + rx, 0.08 + ly, pz + rz)
      }
      pos.needsUpdate = true
    },
  }
}

export function buildRubble(): BufferGeometry {
  const spots: Array<[number, number, number]> = [
    [58, 12, 0.6],
    [-62, 28, 1.1],
    [18, -64, 0.3],
    [-54, -36, 0.9],
    [70, -22, 0.2],
    [-24, 68, 1.4],
    [40, 70, 0.5],
    [-72, 8, 0.8],
  ]
  const parts: BufferGeometry[] = []
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i]
    if (!s) continue
    const shaft = new CylinderGeometry(0.85, 1.25, 5.4, 6)
    shaft.rotateZ(0.7 + s[2] * 0.35)
    shaft.translate(s[0], 1.15, s[1])
    parts.push(shaft)
  }
  const merged = mergeGeometries(parts, false)
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  if (!merged) throw new Error('rubble merge failed')
  return merged
}

export function buildInlay(): BufferGeometry {
  const medallion = new CircleGeometry(7.5, 40)
  medallion.rotateX(-Math.PI / 2)
  medallion.translate(0, 0.03, 0)
  const half = TUNING.arena.size / 2 - 0.15
  const bands: BufferGeometry[] = [medallion]
  const specs: Array<[number, number, number, number]> = [
    [0, half - 0.7, half * 2, 1.3],
    [0, -half + 0.7, half * 2, 1.3],
    [half - 0.7, 0, 1.3, half * 2],
    [-half + 0.7, 0, 1.3, half * 2],
  ]
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]
    if (!s) continue
    const band = new PlaneGeometry(s[2], s[3])
    band.rotateX(-Math.PI / 2)
    band.translate(s[0], 0.03, s[1])
    bands.push(band)
  }
  const merged = mergeGeometries(bands, false)
  for (let i = 0; i < bands.length; i++) bands[i]?.dispose()
  if (!merged) throw new Error('inlay merge failed')
  return merged
}
