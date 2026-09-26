import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Mesh,
  MeshToonMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
  type WebGLRenderer,
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

const sunPipVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const sunPipFrag = /* glsl */ `
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float ang = atan(p.y, p.x);
  float rays = pow(max(abs(cos(ang * 6.0)), 0.0), 18.0);
  rays *= smoothstep(0.28, 0.48, r) * (1.0 - smoothstep(0.72, 0.96, r));
  float ring = smoothstep(0.58, 0.68, r) * (1.0 - smoothstep(0.82, 0.94, r));
  float core = 1.0 - smoothstep(0.08, 0.5, r);
  vec3 body = mix(vec3(0.42, 0.24, 0.06), vec3(0.78, 0.52, 0.16), core);
  vec3 rim = vec3(0.93, 0.72, 0.30);
  vec3 col = mix(body, rim, clamp(ring + rays * 0.85, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`

export function createSunPip(): {
  render: (renderer: WebGLRenderer, camera: Camera, px: number, pz: number, sunX: number, sunZ: number, cssHeight: number) => void
} {
  const mesh = new Mesh(
    new CircleGeometry(1, 28),
    new ShaderMaterial({
      vertexShader: sunPipVert,
      fragmentShader: sunPipFrag,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      toneMapped: false,
      fog: false,
    }),
  )
  mesh.frustumCulled = false
  const scene = new Scene()
  scene.add(mesh)
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const pt = new Vector3()
  return {
    render(renderer, camera, px, pz, sunX, sunZ, cssHeight) {
      const len = Math.hypot(sunX, sunZ) || 1
      pt.set(px + (sunX / len) * 48, 1.4, pz + (sunZ / len) * 48)
      pt.project(camera)
      let nx = pt.x
      let ny = pt.y
      if (pt.z > 1) {
        nx = -nx
        ny = -ny
      }
      const span = Math.max(Math.abs(nx), Math.abs(ny), 1e-4)
      nx /= span
      ny /= span
      const diameter = Math.min(48 / Math.max(cssHeight, 1), 0.14)
      const inset = 1 - diameter * 0.62
      mesh.position.set(nx * inset, ny * inset, 0)
      mesh.scale.set(diameter, diameter, 1)
      const prevAuto = renderer.autoClear
      const prevTarget = renderer.getRenderTarget()
      renderer.setRenderTarget(null)
      renderer.autoClear = false
      renderer.render(scene, cam)
      renderer.setRenderTarget(prevTarget)
      renderer.autoClear = prevAuto
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
