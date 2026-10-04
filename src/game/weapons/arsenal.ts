import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  DoubleSide,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Camera,
  type WebGLRenderer,
} from 'three'
import { writeInstance } from '../../render/instancing'

/** Part ids. W2 and W3 only append. Empty ids have no vertices yet. */
export const ARSENAL_PART = {
  lance: 0,
  disc: 1,
  bell: 2,
  clapper: 3,
  mirror: 4,
  scarab: 5,
  stake: 6,
  prism: 7,
  obelisk: 8,
  sunball: 9,
} as const

const CAP = 64

export interface ArsenalItem {
  kind: number
  x: number
  y: number
  z: number
  yaw: number
  scale: number
  sy?: number
  hot: number
  swing: number
}

// Linear values chosen so ACES at exposure 1.32 lands on canvas gold.
// (1.033, 0.249, 0) → about #F8B437, hue 39, sat 78, V 97.
// A hotter core (luma ≥ 1.53) tonemaps to sat ~26, so bloom-threshold gold
// and the canvas saturation gate cannot be the same pixel under this ACES.
const GOLD = [1.033, 0.249, 0.0]
const EDGE = [1.4, 1.05, 0.42]
const SPINE = [0.045, 0.018, 0.006]
// Dark bronze above hue 26 so a rim sample is not a red telegraph.
// (0.04, 0.023, 0) → about #312000, hue 39, contrast > 4:1 on lit sandstone.
const BRONZE = [0.03, 0.016, 0.0]

function pushTri(
  part: number,
  pos: number[],
  col: number[],
  emit: number[],
  parts: number[],
  a: number[],
  b: number[],
  c: number[],
  ca: number[],
  cb: number[],
  cc: number[],
  ea: number,
  eb: number,
  ec: number,
) {
  pos.push(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0)
  col.push(...ca, ...cb, ...cc)
  emit.push(ea, eb, ec)
  parts.push(part, part, part)
}

function quad(
  part: number,
  pos: number[],
  col: number[],
  emit: number[],
  parts: number[],
  a: number[],
  b: number[],
  c: number[],
  d: number[],
  color: number[],
  edge: number,
) {
  pushTri(part, pos, col, emit, parts, a, b, c, color, color, color, edge, edge, edge)
  pushTri(part, pos, col, emit, parts, a, c, d, color, color, color, edge, edge, edge)
}

function lanceArrays(pos: number[], col: number[], emit: number[], parts: number[]) {
  const part = ARSENAL_PART.lance
  const tip = [0, 0, 1.05]
  const left = [-0.19, 0, 0.28]
  const right = [0.19, 0, 0.28]
  const tail = [0, 0, -0.95]
  const up = [0, 0.06, 0.2]
  pushTri(part, pos, col, emit, parts, tip, left, up, EDGE, GOLD, GOLD, 1, 0.85, 0.85)
  pushTri(part, pos, col, emit, parts, tip, up, right, EDGE, GOLD, GOLD, 1, 0.85, 0.85)
  pushTri(part, pos, col, emit, parts, left, tail, up, BRONZE, BRONZE, GOLD, 0, 0, 0.4)
  pushTri(part, pos, col, emit, parts, right, up, tail, BRONZE, GOLD, BRONZE, 0, 0.4, 0)
  pushTri(part, pos, col, emit, parts, tip, up, left, EDGE, GOLD, GOLD, 1, 0.85, 0.85)
  pushTri(part, pos, col, emit, parts, tip, right, up, EDGE, GOLD, GOLD, 1, 0.85, 0.85)
  quad(part, pos, col, emit, parts, [-0.07, 0.07, 0.55], [0.07, 0.07, 0.55], [0.05, 0.07, -0.7], [-0.05, 0.07, -0.7], SPINE, 0)
  quad(part, pos, col, emit, parts, [-0.12, 0.09, -0.15], [0.12, 0.09, -0.15], [0.1, 0.09, 0.62], [-0.1, 0.09, 0.62], GOLD, 1)
  quad(part, pos, col, emit, parts, [-0.16, 0.05, 0.7], [0.16, 0.05, 0.7], [0.04, 0.05, 1.02], [-0.04, 0.05, 1.02], EDGE, 1)
  quad(part, pos, col, emit, parts, [-0.22, 0.02, 0.15], [-0.16, 0.02, 0.15], [-0.14, 0.02, -0.85], [-0.2, 0.02, -0.85], BRONZE, 0)
  quad(part, pos, col, emit, parts, [0.16, 0.02, 0.15], [0.22, 0.02, 0.15], [0.2, 0.02, -0.85], [0.14, 0.02, -0.85], BRONZE, 0)
}

function discArrays(pos: number[], col: number[], emit: number[], parts: number[]) {
  const part = ARSENAL_PART.disc
  const n = 8
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const rIn = 0.36
    const y = 0.03
    pushTri(part, pos, col, emit, parts, [0, y, 0], [Math.cos(a0) * rIn, y, Math.sin(a0) * rIn], [Math.cos(a1) * rIn, y, Math.sin(a1) * rIn], GOLD, GOLD, GOLD, 1, 0.7, 0.7)
    pushTri(part, pos, col, emit, parts, [0, -y, 0], [Math.cos(a1) * rIn, -y, Math.sin(a1) * rIn], [Math.cos(a0) * rIn, -y, Math.sin(a0) * rIn], BRONZE, BRONZE, BRONZE, 0, 0, 0)
    const rOut = 0.5
    quad(
      part,
      pos,
      col,
      emit,
      parts,
      [Math.cos(a0) * rIn, y, Math.sin(a0) * rIn],
      [Math.cos(a1) * rIn, y, Math.sin(a1) * rIn],
      [Math.cos(a1) * rOut, y, Math.sin(a1) * rOut],
      [Math.cos(a0) * rOut, y, Math.sin(a0) * rOut],
      BRONZE,
      0,
    )
  }
}

function bellArrays(pos: number[], col: number[], emit: number[], parts: number[]) {
  const part = ARSENAL_PART.bell
  const n = 8
  const rings = [
    { y: 1.15, r: 0.16 },
    { y: 0.55, r: 0.34 },
    { y: 0.02, r: 0.46 },
  ]
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    for (let k = 0; k < rings.length - 1; k++) {
      const lo = rings[k]
      const hi = rings[k + 1]
      if (!lo || !hi) continue
      const color = k === 0 ? BRONZE : GOLD
      quad(
        part,
        pos,
        col,
        emit,
        parts,
        [Math.cos(a0) * lo.r, lo.y, Math.sin(a0) * lo.r],
        [Math.cos(a1) * lo.r, lo.y, Math.sin(a1) * lo.r],
        [Math.cos(a1) * hi.r, hi.y, Math.sin(a1) * hi.r],
        [Math.cos(a0) * hi.r, hi.y, Math.sin(a0) * hi.r],
        color,
        k === 1 ? 0.08 : 0,
      )
    }
  }
  pushTri(part, pos, col, emit, parts, [0, 0.72, 0.22], [-0.1, 0.58, 0.3], [0.1, 0.58, 0.3], GOLD, GOLD, GOLD, 0.1, 0.1, 0.1)
  pushTri(part, pos, col, emit, parts, [0, 0.72, 0.22], [0, 0.86, 0.3], [-0.1, 0.58, 0.3], GOLD, GOLD, GOLD, 0.1, 0.1, 0.1)
  pushTri(part, pos, col, emit, parts, [0, 0.72, 0.22], [0.1, 0.58, 0.3], [0, 0.86, 0.3], GOLD, GOLD, GOLD, 0.1, 0.1, 0.1)
  const clap = ARSENAL_PART.clapper
  pushTri(clap, pos, col, emit, parts, [0, 0.7, 0], [-0.06, 0.15, 0], [0.06, 0.15, 0], BRONZE, GOLD, GOLD, 0, 0.4, 0.4)
  pushTri(clap, pos, col, emit, parts, [0, 0.05, 0], [0.06, 0.15, 0], [-0.06, 0.15, 0], GOLD, GOLD, BRONZE, 0.5, 0.4, 0)
}

function buildGeometry(): BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const emit: number[] = []
  const parts: number[] = []
  lanceArrays(pos, col, emit, parts)
  discArrays(pos, col, emit, parts)
  bellArrays(pos, col, emit, parts)
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('aColor', new BufferAttribute(new Float32Array(col), 3))
  geo.setAttribute('aEmit', new BufferAttribute(new Float32Array(emit), 1))
  geo.setAttribute('aPart', new BufferAttribute(new Float32Array(parts), 1))
  return geo
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aPart;
attribute float aEmit;
attribute float iKind;
attribute float iHot;
attribute float iSwing;
varying vec3 vColor;
varying float vEmit;
varying float vHot;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  vEmit = aEmit;
  vHot = iHot;
  vec3 p = position;
  if (aPart > 2.5 && aPart < 3.5) {
    float s = sin(iSwing);
    float c = cos(iSwing);
    float y = c * p.y - s * p.z;
    float z = s * p.y + c * p.z;
    p.y = y;
    p.z = z;
  }
  if (aPart > 4.5 && aPart < 5.5 && position.y > 0.05) {
    p.y += sin(iSwing) * 0.08;
  }
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  if (abs(aPart - iKind) > 0.5) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    #ifdef USE_FOG
      vFogDepth = 0.0;
    #endif
  }
}
`

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vEmit;
varying float vHot;
#include <fog_pars_fragment>
void main() {
  // Emit used to add a hot bias that ACES crushed to pale yellow (sat ~26).
  // The vertex gold is already the tonemap target, so emit only holds that gold
  // against a darker neighbour. vHot stays a small lift so a white-hot edge can
  // still sit on EDGE vertices without repainting the core.
  vec3 col = vColor;
  col = mix(col, vec3(1.033, 0.249, 0.0), clamp(vEmit, 0.0, 1.0) * 0.35);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

export interface Arsenal {
  mesh: InstancedMesh
  clear: () => void
  add: (item: ArsenalItem) => void
  append: (part: number, position: Float32Array, color: Float32Array, emit: Float32Array) => void
  flush: () => void
  prewarm: (renderer: WebGLRenderer, camera: Camera) => void
  partVerts: () => Record<string, number>
}

export function createArsenal(): Arsenal {
  const geo = buildGeometry()
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.clone(UniformsLib.fog),
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    side: DoubleSide,
  })
  const mesh = new InstancedMesh(geo, material, CAP)
  mesh.name = 'arsenal'
  mesh.count = 0
  mesh.visible = false
  mesh.frustumCulled = false
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  const kind = new InstancedBufferAttribute(new Float32Array(CAP), 1)
  const hot = new InstancedBufferAttribute(new Float32Array(CAP), 1)
  const swing = new InstancedBufferAttribute(new Float32Array(CAP), 1)
  kind.setUsage(DynamicDrawUsage)
  hot.setUsage(DynamicDrawUsage)
  swing.setUsage(DynamicDrawUsage)
  geo.setAttribute('iKind', kind)
  geo.setAttribute('iHot', hot)
  geo.setAttribute('iSwing', swing)
  const items: ArsenalItem[] = []
  return {
    mesh,
    clear() {
      items.length = 0
    },
    add(item) {
      if (items.length < CAP) items.push(item)
    },
    append(part, position, color, emit) {
      const old = mesh.geometry
      const pos = old.getAttribute('position')
      const col = old.getAttribute('aColor')
      const em = old.getAttribute('aEmit')
      const pa = old.getAttribute('aPart')
      const base = pos.count
      const add = (position.length / 3) | 0
      const nextPos = new Float32Array(base * 3 + position.length)
      const nextCol = new Float32Array(base * 3 + color.length)
      const nextEm = new Float32Array(base + emit.length)
      const nextPart = new Float32Array(base + add)
      nextPos.set(pos.array as Float32Array)
      nextCol.set(col.array as Float32Array)
      nextEm.set(em.array as Float32Array)
      nextPart.set(pa.array as Float32Array)
      nextPos.set(position, base * 3)
      nextCol.set(color, base * 3)
      nextEm.set(emit, base)
      nextPart.fill(part, base)
      const fresh = new BufferGeometry()
      fresh.setAttribute('position', new BufferAttribute(nextPos, 3))
      fresh.setAttribute('aColor', new BufferAttribute(nextCol, 3))
      fresh.setAttribute('aEmit', new BufferAttribute(nextEm, 1))
      fresh.setAttribute('aPart', new BufferAttribute(nextPart, 1))
      const kindAttr = old.getAttribute('iKind')
      const hotAttr = old.getAttribute('iHot')
      const swingAttr = old.getAttribute('iSwing')
      if (kindAttr) fresh.setAttribute('iKind', kindAttr)
      if (hotAttr) fresh.setAttribute('iHot', hotAttr)
      if (swingAttr) fresh.setAttribute('iSwing', swingAttr)
      mesh.geometry = fresh
      old.dispose()
    },
    flush() {
      const n = items.length
      for (let i = 0; i < n; i++) {
        const it = items[i]
        if (!it) continue
        writeInstance(mesh, i, it.x, it.y, it.z, it.yaw, it.scale, it.sy)
        kind.setX(i, it.kind)
        hot.setX(i, it.hot)
        swing.setX(i, it.swing)
      }
      mesh.count = n
      mesh.visible = n > 0
      const matrices = mesh.instanceMatrix
      matrices.clearUpdateRanges()
      kind.clearUpdateRanges()
      hot.clearUpdateRanges()
      swing.clearUpdateRanges()
      if (n > 0) {
        matrices.addUpdateRange(0, n * 16)
        kind.addUpdateRange(0, n)
        hot.addUpdateRange(0, n)
        swing.addUpdateRange(0, n)
        matrices.needsUpdate = true
        kind.needsUpdate = true
        hot.needsUpdate = true
        swing.needsUpdate = true
      }
    },
    prewarm(renderer, camera) {
      mesh.count = 1
      mesh.visible = true
      writeInstance(mesh, 0, 0, -40, 0, 0, 1)
      kind.setX(0, ARSENAL_PART.lance)
      renderer.compile(mesh, camera)
      mesh.count = 0
      mesh.visible = false
    },
    partVerts() {
      const attr = mesh.geometry.getAttribute('aPart')
      const counts: Record<string, number> = {}
      const names = Object.keys(ARSENAL_PART)
      for (let i = 0; i < names.length; i++) counts[names[i] ?? ''] = 0
      for (let i = 0; i < attr.count; i++) {
        const id = attr.getX(i)
        for (let k = 0; k < names.length; k++) {
          const name = names[k]
          if (name && ARSENAL_PART[name as keyof typeof ARSENAL_PART] === id) counts[name] = (counts[name] ?? 0) + 1
        }
      }
      return counts
    },
  }
}
