import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
} from 'three'
import { TUNING, type TierName } from '../../data/tuning'

const MAX = TUNING.tiers.high.sparks + TUNING.tiers.high.trails
const RESERVED = 23
const SLOT_LINE = 16
const SLOT_MOON = 17
const SLOT_MOON_B = 18
const SLOT_SHELL = 19
const SLOT_SHELL_B = 20
const SLOT_RING = 21
const SLOT_RING_B = 22
const dummy = new Object3D()
const tint = new Color()

const CELL = {
  spark: 0,
  streak: 1,
  blade: 2,
  crescent: 3,
  ring: 4,
  scorch: 5,
  ember: 6,
  shimmer: 7,
  brand: 8,
  shell: 9,
} as const

function lin(hex: number): [number, number, number] {
  const c = new Color(hex)
  return [c.r, c.g, c.b]
}

/** Saturated cores. Additive is reserved for tiny hot tips. */
export const FX = {
  orange: lin(0xe8671a),
  red: lin(0xc8401e),
  bronze: lin(0x9a6a2e),
  gold: lin(0xc4922a),
  goldBlade: lin(0xd9a441),
  goldHot: lin(0xf0d48a),
  shade: lin(0x6a6578),
  shadePuff: lin(0x8a7aa8),
} as const

const ADD_CAP = 0.55

export interface WeaponFx {
  mesh: InstancedMesh
  hot: InstancedMesh
  setTier: (tier: TierName) => void
  hit: (x: number, z: number, lit: boolean, scale?: number) => void
  streak: (x: number, y: number, z: number, yaw: number, length: number, width: number, life: number, rgb: readonly number[], upright?: boolean) => void
  blade: (slot: number, x: number, z: number, yaw: number, big: boolean) => void
  crescent: (x: number, z: number, yaw: number, big: boolean) => void
  scorch: (x: number, z: number, yaw: number, length: number, width: number, life: number, big: boolean) => void
  ring: (x: number, z: number, radius: number, rgb: readonly number[], life: number) => void
  shell: (x: number, z: number, endRadius: number, life: number) => void
  ember: (x: number, z: number, big: boolean) => void
  shimmer: (x: number, z: number, radius: number) => void
  glint: (x: number, y: number, z: number, size: number) => void
  tele: (x: number, z: number, yaw: number) => void
  update: (dt: number) => void
  clear: () => void
}

function buildAtlas(): DataTexture {
  const size = 256
  const data = new Uint8Array(size * size * 4)
  const put = (x: number, y: number, a: number, rgb = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    const prev = data[i + 3] ?? 0
    if (a < prev) return
    data[i] = rgb
    data[i + 1] = rgb
    data[i + 2] = rgb
    data[i + 3] = a
  }
  const cell = (index: number) => {
    const col = index % 4
    const row = (index / 4) | 0
    return { x0: col * 64, y0: row * 64 }
  }
  const dot = (index: number, rad: number, soft: number) => {
    const c = cell(index)
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const d = Math.hypot(x - 31.5, y - 31.5) / rad
        const a = Math.max(0, 1 - Math.max(0, d - (1 - soft)) / Math.max(0.05, soft))
        const rim = d > 0.62 && d < 0.95
        put(c.x0 + x, c.y0 + y, Math.floor(a * a * 255), rim ? 255 : 150)
      }
    }
  }
  dot(CELL.spark, 16, 0.9)
  dot(CELL.ember, 9, 0.65)
  dot(CELL.scorch, 30, 1)
  dot(CELL.shimmer, 27, 1)
  const cStreak = cell(CELL.streak)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const along = 1 - Math.abs(y - 32) / 30
      const across = Math.abs(x - 31.5) / 26
      if (along <= 0 || across > 1) continue
      const rim = across > 0.72
      const a = across > 0.84 ? (1 - across) / 0.16 : along
      put(cStreak.x0 + x, cStreak.y0 + y, Math.floor(Math.max(0, a) * 255), rim ? 255 : 150)
    }
  }
  const cBlade = cell(CELL.blade)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const along = 1 - Math.abs(y - 32) / 30
      const across = Math.abs(x - 31.5) / 24
      if (along <= 0 || across > 1) continue
      const rim = across > 0.62
      const tip = y > 54 ? Math.max(0, (62 - y) / 8) : 1
      put(cBlade.x0 + x, cBlade.y0 + y, Math.floor(Math.max(0, along) * tip * 255), rim ? 255 : 145)
    }
  }
  const cMoon = cell(CELL.crescent)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const outer = Math.hypot(x - 22, y - 32)
      const inner = Math.hypot(x - 36, y - 32)
      const band = outer < 28 && outer > 14 && inner > 12
      const rim = band && (outer > 23 || inner < 16)
      const a = band ? 1 - Math.abs(outer - 21) / 8 : 0
      put(cMoon.x0 + x, cMoon.y0 + y, Math.floor(Math.max(0, a) * 255), rim ? 255 : 150)
    }
  }
  const cRing = cell(CELL.ring)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5)
      const band = d > 16 && d < 30
      const rim = d > 25 && d < 30
      const a = band ? 1 - Math.abs(d - 24) / 10 : 0
      put(cRing.x0 + x, cRing.y0 + y, Math.floor(Math.max(0, a) * 255), rim ? 255 : 145)
    }
  }
  const cBrand = cell(CELL.brand)
  const burnHash = (n: number) => {
    let h = n | 0
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const nx = (x - 31.5) / 28
      const ny = (y - 31.5) / 30
      const edge = Math.hypot(nx, ny) + (burnHash(x * 19 + y * 131) - 0.5) * 0.38
      if (edge > 0.96) continue
      const ember = edge > 0.58
      const a = edge > 0.72 ? Math.max(0, (0.96 - edge) / 0.24) : 0.9
      put(cBrand.x0 + x, cBrand.y0 + y, Math.floor(a * 255), ember ? 255 : 42)
    }
  }
  const cShell = cell(CELL.shell)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5)
      if (d < 17.5 || d > 30.5) continue
      const rim = d > 24
      put(cShell.x0 + x, cShell.y0 + y, rim ? 255 : 220, rim ? 255 : 125)
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.needsUpdate = true
  tex.flipY = false
  tex.colorSpace = 'srgb'
  return tex
}

function makeMaterial(map: DataTexture, additive: boolean): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uMap: { value: map } },
    vertexShader: `
      attribute vec4 iUv;
      attribute float iFlag;
      varying vec2 vFxUv;
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vFlag;
      varying float vRadius;
      varying vec2 vLocalXZ;
      void main() {
        vFxUv = iUv.xy + uv * iUv.zw;
        vUv = uv;
        vCol = instanceColor;
        vFlag = iFlag;
        vec4 world = instanceMatrix * vec4(position.xyz, 1.0);
        vec4 origin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vRadius = 0.5 * length(instanceMatrix[0].xyz);
        vLocalXZ = world.xz - origin.xz;
        gl_Position = projectionMatrix * modelViewMatrix * world;
      }
    `,
    fragmentShader: additive
      ? `
      uniform sampler2D uMap;
      varying vec2 vFxUv;
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vFlag;
      varying float vRadius;
      varying vec2 vLocalXZ;
      void main() {
        float a = texture2D(uMap, vFxUv).a;
        vec3 col = min(vCol * a, vec3(${ADD_CAP.toFixed(2)}));
        if (vFlag > 3.5) {
          float y = vUv.y;
          float halfW = mix(0.12, 0.0, smoothstep(0.05, 0.92, y));
          float inside = 1.0 - smoothstep(halfW - 0.02, halfW, abs(vUv.x - 0.5));
          col = min(vec3(0.95, 0.78, 0.35) * inside * max(vCol.r, 0.35), vec3(${ADD_CAP.toFixed(2)}));
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `
      : `
      uniform sampler2D uMap;
      varying vec2 vFxUv;
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vFlag;
      varying float vRadius;
      varying vec2 vLocalXZ;
      void main() {
        vec4 tex = texture2D(uMap, vFxUv);
        float rim = smoothstep(0.72, 0.98, tex.r);
        vec3 col = mix(vCol * 0.78, min(vCol * 1.65, vec3(0.95)), rim);
        float alpha = tex.a * mix(0.8, 0.95, rim);
        float d = length(vUv - 0.5) * 2.0;
        if (vFlag > 3.5) {
          float y = vUv.y;
          float halfW = mix(0.46, 0.0, smoothstep(0.12, 1.0, y));
          float edgeDist = abs(vUv.x - 0.5);
          float fw = clamp(fwidth(vUv.x), 0.008, 0.06);
          float inside = 1.0 - smoothstep(halfW - fw, halfW, edgeDist);
          float outline = smoothstep(halfW - fw * 2.4, halfW - fw * 0.35, edgeDist);
          vec3 tipCol = vec3(0.887, 0.552, 0.102);
          vec3 baseCol = vec3(0.479, 0.238, 0.027);
          vec3 bronze = vec3(0.09, 0.04, 0.015);
          col = mix(mix(baseCol, tipCol, y), bronze, outline);
          alpha = inside * clamp(max(vCol.r, vCol.g), 0.0, 1.0);
        } else if (vFlag > 2.5) {
          float ember = smoothstep(0.78, 0.96, tex.r);
          float body = 1.0 - smoothstep(0.32, 0.5, length((vUv - 0.5) * vec2(0.85, 0.7)));
          float fade = clamp(max(vCol.r, vCol.g) / 0.45, 0.0, 1.0);
          col = mix(vec3(0.042, 0.018, 0.009), vCol, ember);
          alpha = max(body * 0.7, ember * tex.a * 0.9) * fade;
        } else if (vFlag > 1.5) {
          float band = smoothstep(0.82, 0.86, d) * (1.0 - smoothstep(0.955, 0.995, d));
          float edge = smoothstep(0.945, 0.99, d);
          col = mix(vCol, vec3(0.72, 0.42, 0.12), edge);
          alpha = band * mix(0.20, 0.95, edge);
        } else if (vFlag > 0.5) {
          float rad = max(vRadius, 0.5);
          float dist = length(vLocalXZ);
          float inner = rad - 0.35;
          float band = smoothstep(inner - 0.03, inner + 0.02, dist) * (1.0 - smoothstep(rad - 0.02, rad + 0.02, dist));
          float edge = smoothstep(rad - 0.09, rad, dist);
          float life = clamp(max(vCol.r, vCol.g) / 0.28, 0.0, 1.0);
          col = mix(vCol, vec3(0.055, 0.028, 0.012), clamp(edge, 0.0, 1.0));
          alpha = band * 0.75 * life;
        }
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    blending: additive ? AdditiveBlending : NormalBlending,
    toneMapped: false,
    side: DoubleSide,
    fog: false,
  })
}

export function createWeaponFx(): WeaponFx {
  const map = buildAtlas()
  const geo = new PlaneGeometry(1, 1)
  const mesh = new InstancedMesh(geo, makeMaterial(map, false), MAX)
  const hot = new InstancedMesh(geo, makeMaterial(map, true), MAX)
  for (const m of [mesh, hot]) {
    m.count = 0
    m.frustumCulled = false
    m.renderOrder = m === hot ? 5 : 5
    m.geometry.setAttribute('iUv', new InstancedBufferAttribute(new Float32Array(MAX * 4), 4))
    m.geometry.setAttribute('iFlag', new InstancedBufferAttribute(new Float32Array(MAX), 1))
    m.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
  }

  const x = new Float32Array(MAX)
  const y = new Float32Array(MAX)
  const z = new Float32Array(MAX)
  const yaw = new Float32Array(MAX)
  const sx = new Float32Array(MAX)
  const sz = new Float32Array(MAX)
  const life = new Float32Array(MAX)
  const maxLife = new Float32Array(MAX)
  const cr = new Float32Array(MAX)
  const cg = new Float32Array(MAX)
  const cb = new Float32Array(MAX)
  const cell = new Uint8Array(MAX)
  const mode = new Uint8Array(MAX)
  const vy = new Float32Array(MAX)
  const hotBit = new Uint8Array(MAX)
  const shellBit = new Uint8Array(MAX)
  const order = new Int16Array(MAX)
  const ord = new Int16Array(MAX)
  ord.fill(-1)
  let nOrder = 0
  let cursor = RESERVED
  let tier: TierName = 'high'
  let active = 0
  const uvTable = new Float32Array(16 * 4)
  for (let i = 0; i < 16; i++) {
    const col = i % 4
    const row = (i / 4) | 0
    uvTable[i * 4] = col / 4
    uvTable[i * 4 + 1] = row / 4
    uvTable[i * 4 + 2] = 0.25
    uvTable[i * 4 + 3] = 0.25
  }

  function track(i: number) {
    if ((ord[i] ?? -1) >= 0) return
    ord[i] = nOrder
    order[nOrder] = i
    nOrder++
  }

  function untrack(i: number) {
    const at = ord[i] ?? -1
    if (at < 0) return
    const last = nOrder - 1
    const moved = order[last] ?? i
    order[at] = moved
    ord[moved] = at
    ord[i] = -1
    nOrder = last
  }

  function cap(): number {
    const row = TUNING.tiers[tier]
    return Math.min(MAX, row.sparks + row.trails)
  }

  function writeSlot(
    i: number,
    kind: number,
    px: number,
    py: number,
    pz: number,
    rot: number,
    w: number,
    h: number,
    seconds: number,
    rgb: readonly number[],
    how: number,
    rise: number,
    isHot = 0,
    shell = 0,
  ) {
    const was = (life[i] ?? 0) > 0
    x[i] = px
    y[i] = py
    z[i] = pz
    yaw[i] = rot
    sx[i] = w
    sz[i] = h
    life[i] = seconds
    maxLife[i] = seconds
    cr[i] = rgb[0] ?? 0
    cg[i] = rgb[1] ?? 0
    cb[i] = rgb[2] ?? 0
    cell[i] = kind
    mode[i] = how
    vy[i] = rise
    hotBit[i] = isHot
    shellBit[i] = shell
    if (!was && seconds > 0) {
      active++
      track(i)
    }
  }

  function put(
    kind: number,
    px: number,
    py: number,
    pz: number,
    rot: number,
    w: number,
    h: number,
    seconds: number,
    rgb: readonly number[],
    how: number,
    rise: number,
    isHot = 0,
    shell = 0,
  ) {
    if (active >= cap()) return
    const i = cursor
    cursor = cursor + 1 >= MAX ? RESERVED : cursor + 1
    writeSlot(i, kind, px, py, pz, rot, w, h, seconds, rgb, how, rise, isHot, shell)
  }

  const face = TUNING.camera.yaw
  const fx: WeaponFx = {
    mesh,
    hot,
    setTier(next) {
      tier = next
    },
    hit(px, pz, lit, scale = 1) {
      const n = scale > 1 ? 12 : 10
      if (lit) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          const ox = Math.cos(a)
          const oz = Math.sin(a)
          put(CELL.streak, px + ox * 0.2, 0.9, pz + oz * 0.2, face, 0.05, 0.15, 0.3, FX.goldHot, 4, 0, 1)
        }
      } else {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          put(CELL.spark, px + Math.cos(a) * 0.22, 0.7, pz + Math.sin(a) * 0.22, face, 0.15, 0.15, 0.3, FX.shadePuff, 0, 0)
        }
      }
    },
    streak(px, py, pz, rot, length, width, seconds, rgb, upright = false) {
      put(CELL.streak, px, py, pz, rot, width, length, seconds, rgb, upright ? 4 : 0, 0)
    },
    blade(slot, px, pz, rot, big) {
      if (slot < 0 || slot >= 8) return
      const length = big ? 1 : 1
      const width = 0.25
      const white = [1, 1, 1] as const
      writeSlot(slot, CELL.blade, px, 1.15, pz, rot, width, length, 0.4, white, 0, 0, 0, 4)
      writeSlot(slot + 8, CELL.blade, px, 1.15, pz, rot, width, length, 0.4, white, 0, 0, 1, 4)
    },
    crescent(px, pz, rot, big) {
      writeSlot(SLOT_MOON, CELL.crescent, px, 1.55, pz, rot, big ? 4.2 : 3.6, big ? 2.8 : 2.4, 0.95, FX.orange, 0, 0)
      if (big) writeSlot(SLOT_MOON_B, CELL.crescent, px, 2.15, pz, rot + 0.4, 2.6, 1.7, 0.95, FX.gold, 0, 0)
    },
    scorch(px, pz, rot, length, width, seconds, big) {
      const line = length >= 3.5 && length >= width * 1.45
      const rgb = big ? FX.orange : FX.red
      if (line) writeSlot(SLOT_LINE, CELL.brand, px, 0.34, pz, rot, Math.max(width, 1.4), length, 1, FX.orange, 0, 0, 0, 3)
      else put(CELL.scorch, px, 0.28, pz, rot, width, length, seconds, rgb, 0, 0)
    },
    ring(px, pz, radius, rgb, seconds) {
      const slot = (life[SLOT_RING] ?? 0) <= (life[SLOT_RING_B] ?? 0) ? SLOT_RING : SLOT_RING_B
      writeSlot(slot, CELL.ring, px, 0.2, pz, 0, radius * 2, radius * 2, seconds, rgb, 0, 0, 0, 2)
    },
    shell(px, pz, endRadius, seconds) {
      const endD = Math.max(endRadius * 2, 8.2)
      const slot = endRadius >= 6 ? SLOT_SHELL : SLOT_SHELL_B
      writeSlot(slot, CELL.shell, px, 0.22, pz, 0, endD, endD, seconds, FX.bronze, 3, 0, 0, 1)
    },
    ember(px, pz, big) {
      const n = big ? (tier === 'low' ? 3 : 5) : tier === 'low' ? 2 : 3
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        put(CELL.ember, px + Math.cos(a) * 0.25, 0.3, pz + Math.sin(a) * 0.25, face, big ? 0.32 : 0.22, big ? 0.32 : 0.22, 0.8, FX.orange, 2, 1.2 + i * 0.22)
      }
    },
    shimmer(px, pz, radius) {
      put(CELL.shimmer, px, 0.24, pz, 0, radius, radius * 0.62, 0.55, FX.red, 0, 0)
    },
    glint(px, py, pz, size) {
      put(CELL.spark, px, py, pz, face, size, size, 0.1, FX.goldHot, 0, 0, 1)
    },
    tele(px, pz, rot) {
      const fx = -Math.sin(rot)
      const fz = -Math.cos(rot)
      put(CELL.streak, px + fx * 1.15, 0.08, pz + fz * 1.15, rot, 0.1, 2.1, 0.16, FX.red, 0, 0)
    },
    update(dt) {
      const uvA = mesh.geometry.getAttribute('iUv') as InstancedBufferAttribute
      const uvH = hot.geometry.getAttribute('iUv') as InstancedBufferAttribute
      const flagA = mesh.geometry.getAttribute('iFlag') as InstancedBufferAttribute
      const flagH = hot.geometry.getAttribute('iFlag') as InstancedBufferAttribute
      let nA = 0
      let nH = 0
      const limit = cap()
      let drawn = 0
      for (let slot = nOrder - 1; slot >= 0; slot--) {
        const i = order[slot] ?? 0
        life[i] = (life[i] ?? 0) - dt
        if ((life[i] ?? 0) <= 0) {
          life[i] = 0
          active = Math.max(0, active - 1)
          untrack(i)
          continue
        }
        if (drawn >= limit) continue
        drawn++
        const k = (life[i] ?? 0) / Math.max(0.05, maxLife[i] ?? 0.2)
        const age = 1 - k
        let w = sx[i] ?? 0.2
        let h = sz[i] ?? 0.2
        if (mode[i] === 1) {
          const grow = 0.4 + age * 0.95
          w *= grow
          h *= grow
        } else if (mode[i] === 3) {
          const end = Math.max(w, 6.5)
          const start = 3.4
          const s = start + (end - start) * Math.min(1, age)
          w = s
          h = s
        }
        if (mode[i] === 2) y[i] = (y[i] ?? 0) + (vy[i] ?? 0) * dt
        const kind = cell[i] ?? 0
        const held = kind === CELL.crescent
        const fade = kind === CELL.shell ? (k > 0.32 ? 1 : k / 0.32) : kind === CELL.brand || kind === CELL.ring ? k : held ? (k > 0.18 ? 1 : k / 0.18) : mode[i] === 3 ? Math.max(0.35, k) : k
        const upright = kind === CELL.blade || kind === CELL.spark || kind === CELL.ember || kind === CELL.crescent || mode[i] === 4
        dummy.position.set(x[i] ?? 0, y[i] ?? 0, z[i] ?? 0)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(Math.max(0.04, w), Math.max(0.04, h), 1)
        if (kind === CELL.crescent) {
          dummy.rotation.y = face
          dummy.rotateZ((yaw[i] ?? 0) * 0.15)
        } else if (upright) dummy.rotation.y = yaw[i] ?? 0
        else {
          dummy.rotateX(-Math.PI / 2)
          dummy.rotateZ(yaw[i] ?? 0)
        }
        dummy.updateMatrix()
        const rectAt = kind * 4
        const target = hotBit[i] ? hot : mesh
        const uv = hotBit[i] ? uvH : uvA
        const n = hotBit[i] ? nH : nA
        target.setMatrixAt(n, dummy.matrix)
        uv.setXYZW(n, uvTable[rectAt] ?? 0, uvTable[rectAt + 1] ?? 0, uvTable[rectAt + 2] ?? 0.25, uvTable[rectAt + 3] ?? 0.25)
        if (hotBit[i]) flagH.setX(n, shellBit[i] ?? 0)
        else flagA.setX(n, shellBit[i] ?? 0)
        tint.setRGB((cr[i] ?? 0) * fade, (cg[i] ?? 0) * fade, (cb[i] ?? 0) * fade)
        target.setColorAt(n, tint)
        if (hotBit[i]) nH++
        else nA++
      }
      mesh.count = nA
      hot.count = nH
      mesh.visible = nA > 0
      hot.visible = nH > 0
      if (nA > 0) {
        mesh.instanceMatrix.needsUpdate = true
        uvA.needsUpdate = true
        flagA.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
      if (nH > 0) {
        hot.instanceMatrix.needsUpdate = true
        uvH.needsUpdate = true
        flagH.needsUpdate = true
        if (hot.instanceColor) hot.instanceColor.needsUpdate = true
      }
    },
    clear() {
      life.fill(0)
      ord.fill(-1)
      nOrder = 0
      active = 0
      cursor = RESERVED
      mesh.count = 0
      hot.count = 0
      mesh.visible = false
      hot.visible = false
    },
  }
  return fx
}
