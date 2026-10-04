import {
  Color,
  CustomBlending,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from 'three'
import { TUNING, type TierName } from '../../data/tuning'
import { probeSoloCanon } from './probe'
import { yawFromDirection } from '../../core/math'

const MAX = TUNING.tiers.high.sparks + TUNING.tiers.high.trails
const RESERVED = 25
const SLOT_LINE = 16
const SLOT_MOON = 17
const SLOT_MOON_B = 18
const SLOT_SHELL = 19
const SLOT_SHELL_B = 20
const SLOT_RING = 21
const SLOT_RING_B = 22
const SLOT_HERO = 23
const SLOT_GLOW = 24
const dummy = new Object3D()
const tint = new Color()
const RING = 0.86

const SOLO_CELLS: Record<string, readonly number[]> = {
  sunspear: [0, 1, 22],
  halo: [29, 30],
  flare: [16, 17, 18, 19, 29],
  sunspot: [16, 29],
  bell: [19, 20, 21],
  heliograph: [1, 24],
  scarablight: [15, 25],
  stakes: [19, 26],
  prism: [27],
  obelisk: [26, 28],
  sunroller: [25],
}

function soloCell(cellId: number): boolean {
  const solo = probeSoloCanon()
  if (!solo) return true
  const allow = SOLO_CELLS[solo]
  return !!allow && allow.indexOf(cellId) >= 0
}

const CELL = {
  spearTrail: 0,
  spearGlow: 1,
  haloStreak: 2,
  crescent: 3,
  afterimage: 4,
  inkA: 5,
  inkB: 6,
  inkC: 7,
  goldSpark: 8,
  ember: 9,
  ringThin: 10,
  ringThick: 11,
  hitFlash: 12,
  scorch: 13,
  sunRing: 14,
  puff: 15,
  sunspot: 16,
  flareBand: 17,
  flareCore: 18,
  shockRing: 19,
  bellShadow: 20,
  gleam: 21,
  lanceRibbon: 22,
  impactStar: 23,
  ray: 24,
  scarabDust: 25,
  stakeBlade: 26,
  prismStar: 27,
  fence: 28,
  coreGlow: 29,
  wardRing: 30,
  sparkStreak: 31,
} as const

/** u, v, width, height in three.js UV space (flipY true). */
const UV = [
  [0, 0.839844, 0.166667, 0.153646],
  [0.173177, 0.839844, 0.153646, 0.153646],
  [0.339844, 0.839844, 0.153646, 0.153646],
  [0.50651, 0.839844, 0.153646, 0.153646],
  [0.673177, 0.839844, 0.153646, 0.153646],
  [0.839844, 0.839844, 0.153646, 0.153646],
  [0.00651, 0.673177, 0.153646, 0.153646],
  [0.173177, 0.673177, 0.153646, 0.153646],
  [0.339844, 0.673177, 0.153646, 0.153646],
  [0.50651, 0.673177, 0.153646, 0.153646],
  [0.673177, 0.673177, 0.153646, 0.153646],
  [0.839844, 0.673177, 0.153646, 0.153646],
  [0.00651, 0.50651, 0.153646, 0.153646],
  [0.173177, 0.50651, 0.153646, 0.153646],
  [0.339844, 0.50651, 0.153646, 0.153646],
  [0.50651, 0.50651, 0.153646, 0.153646],
  [0.673177, 0.506511, 0.153645, 0.153645],
  [0.839844, 0.506511, 0.153645, 0.153645],
  [0.006511, 0.339844, 0.153645, 0.153645],
  [0.173177, 0.339844, 0.153645, 0.153645],
  [0.339844, 0.339844, 0.153645, 0.153645],
  [0.506511, 0.339844, 0.153645, 0.153645],
  [0.673177, 0.339844, 0.153645, 0.153645],
  [0.839844, 0.339844, 0.153645, 0.153645],
  [0.006511, 0.173177, 0.153645, 0.153645],
  [0.173177, 0.173177, 0.153645, 0.153645],
  [0.339844, 0.173177, 0.153645, 0.153645],
  [0.506511, 0.173177, 0.153645, 0.153645],
  [0.673177, 0.173177, 0.153645, 0.153645],
  [0.839844, 0.173177, 0.153645, 0.153645],
  [0.006511, 0.006511, 0.153645, 0.153645],
  [0.173177, 0.006511, 0.153645, 0.153645],
  [0.339844, 0.006511, 0.153645, 0.153645],
  [0.506511, 0.006511, 0.153645, 0.153645],
  [0.673177, 0.006511, 0.153645, 0.153645],
  [0.839844, 0.006511, 0.153645, 0.153645],
] as const

function lin(hex: number): [number, number, number] {
  const c = new Color(hex)
  return [c.r, c.g, c.b]
}

export const FX = {
  orange: lin(0xe8671a),
  red: lin(0xc8401e),
  bronze: lin(0x9a6a2e),
  gold: lin(0xf2b632),
  goldBlade: lin(0xf2b632),
  goldHot: lin(0xffe08a),
  punch: lin(0xf2b632),
  shade: lin(0x6a6578),
  shadePuff: lin(0x8a7aa8),
  white: lin(0xffffff),
} as const

export interface WeaponFx {
  mesh: InstancedMesh
  setTier: (tier: TierName) => void
  hit: (x: number, z: number, lit: boolean, scale?: number) => void
  cores: (out: { kind: string; x: number; y: number; z: number; w: number; h: number }[]) => number
  streak: (x: number, y: number, z: number, yaw: number, length: number, width: number, life: number, rgb: readonly number[], upright?: boolean) => void
  ray: (x: number, y: number, z: number, yaw: number, length: number, width: number, life: number) => void
  helioRay: (x: number, y: number, z: number, yaw: number, length: number, width: number, life: number) => void
  stakeLine: (x: number, z: number, yaw: number, length: number, width: number) => void
  scarabMote: (x: number, z: number) => void
  prismFlash: (x: number, z: number) => void
  blade: (slot: number, x: number, z: number, yaw: number, big: boolean) => void
  crescent: (x: number, z: number, yaw: number, big: boolean) => void
  afterimage: (x: number, z: number, dirX: number, dirZ: number) => void
  scorch: (x: number, z: number, yaw: number, length: number, width: number, life: number, big: boolean) => void
  ring: (x: number, z: number, radius: number, rgb: readonly number[], life: number) => void
  shell: (x: number, z: number, endRadius: number, life: number) => void
  ember: (x: number, z: number, big: boolean) => void
  shimmer: (x: number, z: number, radius: number) => void
  glint: (x: number, y: number, z: number, size: number) => void
  anchor: (x: number, y: number, z: number, yaw: number) => void
  hero: (x: number, z: number) => void
  death: (x: number, z: number, lit: boolean) => void
  ribbon: (x: number, y: number, z: number, yaw: number, length: number) => void
  star: (x: number, z: number) => void
  core: (x: number, z: number, radius: number) => void
  band: (x: number, z: number, radius: number, life: number) => void
  shock: (x: number, z: number, radius: number) => void
  shadowDisc: (x: number, z: number, radius: number, life: number) => void
  gleamMark: (slot: number, x: number, z: number) => void
  ward: (x: number, z: number, radius: number) => void
  glow: (x: number, z: number, radius: number) => void
  sunspot: (x: number, z: number, radius: number, life: number) => void
  dust: (x: number, z: number) => void
  tele: (x: number, z: number, yaw: number) => void
  setFocus: (x: number, z: number) => void
  update: (dt: number) => void
  clear: () => void
  /** Weapon-off captures keep Sela's ring. It is not a weapon. */
  maskToHero: () => void
  unmask: () => void
  ready: Promise<void>
}

function hash(n: number): number {
  let t = Math.imul(n | 0, 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function makeMaterial(map: ReturnType<TextureLoader['load']>): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uMap: { value: map } },
    vertexShader: `
      attribute vec4 iUv;
      attribute float iFlag;
      attribute float iHot;
      varying vec2 vFxUv;
      varying vec3 vCol;
      varying float vHot;
      void main() {
        vec2 tuv = iFlag > 0.5 ? vec2(uv.y, uv.x) : uv;
        vFxUv = iUv.xy + tuv * iUv.zw;
        vCol = instanceColor;
        vHot = iHot;
        vec4 world = instanceMatrix * vec4(position.xyz, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec2 vFxUv;
      varying vec3 vCol;
      varying float vHot;
      void main() {
        vec4 tex = texture2D(uMap, vFxUv);
        if (vHot > 0.5) {
          vec3 col = vCol * tex.rgb * tex.a;
          if (max(col.r, max(col.g, col.b)) < 0.02) discard;
          gl_FragColor = vec4(col, 0.0);
        } else {
          float fade = clamp(max(vCol.r, max(vCol.g, vCol.b)), 0.0, 1.0);
          float alpha = tex.a * fade;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(vCol * tex.rgb * alpha, alpha);
        }
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    toneMapped: false,
    side: DoubleSide,
    fog: false,
  })
}

export function createWeaponFx(): WeaponFx {
  let markReady = () => {}
  const ready = new Promise<void>((resolve) => {
    markReady = resolve
  })
  const map = new TextureLoader().load(
    `${import.meta.env.BASE_URL}assets/vfx/vfx_atlas.png`,
    () => markReady(),
    undefined,
    () => markReady(),
  )
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 4
  map.minFilter = LinearMipmapLinearFilter
  map.magFilter = LinearFilter
  map.generateMipmaps = true
  map.flipY = true
  const geo = new PlaneGeometry(1, 1)
  const mesh = new InstancedMesh(geo, makeMaterial(map), MAX)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 5
  const uvA = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
  const flagA = new InstancedBufferAttribute(new Float32Array(MAX), 1)
  const hotA = new InstancedBufferAttribute(new Float32Array(MAX), 1)
  mesh.geometry.setAttribute('iUv', uvA)
  mesh.geometry.setAttribute('iFlag', flagA)
  mesh.geometry.setAttribute('iHot', hotA)
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
  const fxRange = {
    matrix: { start: 0, count: 0 },
    uv: { start: 0, count: 0 },
    flag: { start: 0, count: 0 },
    hot: { start: 0, count: 0 },
    color: { start: 0, count: 0 },
  }
  function stageFx(attr: InstancedBufferAttribute, elements: number, range: { start: number; count: number }) {
    if (elements <= 0) return
    range.start = 0
    range.count = elements
    const list = attr.updateRanges
    list[0] = range
    list.length = 1
    attr.needsUpdate = true
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
  const ribbon = new Uint8Array(MAX)
  const order = new Int16Array(MAX)
  const ord = new Int16Array(MAX)
  ord.fill(-1)
  let nOrder = 0
  let cursor = RESERVED
  let heroDraw = -1
  let masked = false
  let savedCount = 0
  const savedMat = new Float32Array(16)
  const savedUv = new Float32Array(4)
  const heroMat = new Float32Array(16)
  const heroUv = new Float32Array(4)
  const savedFlag = new Float32Array(1)
  const savedHot = new Float32Array(1)
  const savedCol = new Float32Array(3)
  const heroFlag = new Float32Array(1)
  const heroHot = new Float32Array(1)
  const heroCol = new Float32Array(3)
  let tier: TierName = 'high'
  let active = 0
  let salt = 1
  const focus = new Vector2()

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
    isRibbon = 0,
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
    ribbon[i] = isRibbon
    if (!was && seconds > 0) {
      active++
      track(i)
    }
    if (was && seconds <= 0) {
      active = Math.max(0, active - 1)
      untrack(i)
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
    isRibbon = 0,
  ) {
    const pool = MAX - TUNING.gleam.glyphs
    if (active >= cap()) return
    const i = cursor
    cursor = cursor + 1 >= pool ? RESERVED : cursor + 1
    writeSlot(i, kind, px, py, pz, rot, w, h, seconds, rgb, how, rise, isHot, isRibbon)
  }

  function toward(px: number, py: number, pz: number, dist: number): [number, number, number] {
    const pitch = TUNING.camera.pitch
    const face = TUNING.camera.yaw
    const hx = Math.sin(face) * Math.cos(pitch)
    const hy = Math.sin(pitch)
    const hz = Math.cos(face) * Math.cos(pitch)
    const inv = dist / Math.hypot(hx, hy, hz)
    return [px + hx * inv, py + hy * inv, pz + hz * inv]
  }

  const fx: WeaponFx = {
    mesh,
    setTier(next) {
      tier = next
    },
    cores(out) {
      const name = [
        'spearTrail', 'spearGlow', 'haloStreak', 'crescent', 'afterimage', 'inkA', 'inkB', 'inkC',
        'goldSpark', 'ember', 'ringThin', 'ringThick', 'hitFlash', 'scorch', 'sunRing', 'puff',
        'sunspot', 'flareBand', 'flareCore', 'shockRing', 'bellShadow', 'gleam', 'lanceRibbon', 'impactStar',
        'ray', 'scarabDust', 'stakeBlade', 'prismStar', 'fence', 'coreGlow', 'wardRing', 'sparkStreak',
      ]
      out.length = 0
      for (let n = 0; n < nOrder; n++) {
        const i = order[n] ?? -1
        if (i < 0 || (life[i] ?? 0) <= 0) continue
        out.push({
          kind: name[cell[i] ?? 0] ?? 'fx',
          x: x[i] ?? 0,
          y: y[i] ?? 0,
          z: z[i] ?? 0,
          w: sx[i] ?? 0,
          h: sz[i] ?? 0,
        })
      }
      return out.length
    },
    hit(px, pz, lit, scale = 1) {
      const at = toward(px, 0.85, pz, 0.6)
      const rgb = lit ? FX.punch : FX.goldHot
      put(CELL.impactStar, at[0], at[1], at[2], TUNING.camera.yaw, 1.35 * scale, 1.35 * scale, 0.28, rgb, 5, 0, 1)
      const budget = TUNING.tiers[tier].sparkHit
      const n = tier === 'low' ? Math.min(4, budget) : Math.max(4, Math.min(6, budget))
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        put(CELL.sparkStreak, px + Math.cos(a) * 0.2, 0.7, pz + Math.sin(a) * 0.2, a, 0.16, 0.95, 0.28, rgb, 5, 0, 1)
      }
    },
    streak(px, py, pz, rot, length, width, seconds, rgb) {
      put(CELL.spearTrail, px, py, pz, rot, Math.max(0.12, width), length, seconds, rgb, 0, 0, 0, 1)
    },
    ray(px, py, pz, rot, length, width, seconds) {
      put(CELL.haloStreak, px, py, pz, rot, Math.max(0.1, width), length, seconds, FX.goldBlade, 4, 0, 0, 1)
    },
    helioRay(px, py, pz, rot, length, width, seconds) {
      put(CELL.ray, px, py, pz, rot, Math.max(0.12, width), length, seconds, FX.punch, 0, 0, 1)
    },
    stakeLine(px, pz, rot, length, width) {
      put(CELL.stakeBlade, px, 0.08, pz, rot, Math.max(0.12, width), length, 0.12, FX.punch, 0, 0, 1)
    },
    scarabMote(px, pz) {
      put(CELL.scarabDust, px, 0.2, pz, 0, 0.4, 0.4, 0.28, FX.punch, 0, 0, 1)
    },
    prismFlash(px, pz) {
      put(CELL.prismStar, px, 0.8, pz, TUNING.camera.yaw, 1.4, 1.4, 0.22, FX.punch, 0, 0, 1)
    },
    blade(slot, px, pz, rot, big) {
      if (slot < 0 || slot >= 8) return
      writeSlot(slot, CELL.haloStreak, px, 1.15, pz, rot, big ? 0.28 : 0.22, big ? 1.15 : 1, 0.4, FX.goldBlade, 4, 0, 0, 1)
      if ((life[slot + 8] ?? 0) > 0) writeSlot(slot + 8, CELL.haloStreak, px, 0, pz, rot, 0.01, 0.01, 0, FX.white, 0, 0)
    },
    crescent(px, pz, rot, big) {
      const s = big ? 3.6 : 3.2
      writeSlot(SLOT_MOON, CELL.crescent, px, 0.42, pz, rot, s, s, 0.45, FX.goldHot, 0, 0, 1)
      if (big) writeSlot(SLOT_MOON_B, CELL.crescent, px, 0.48, pz, rot + 0.4, 2.4, 2.4, 0.4, FX.gold, 0, 0, 1)
    },
    afterimage(px, pz, dirX, dirZ) {
      const mag = Math.hypot(dirX, dirZ) || 1
      const dx = dirX / mag
      const dz = dirZ / mag
      const face = yawFromDirection(dx, dz)
      for (let i = 0; i < 3; i++) {
        const back = 0.45 + i * 0.65
        put(CELL.afterimage, px - dx * back, 1.05, pz - dz * back, face, 1.1, 2.3, 0.32 - i * 0.05, FX.goldBlade, 4, 0)
      }
    },
    scorch(px, pz, rot, length, width, seconds, big) {
      const line = length >= 3.5 && length >= width * 1.45
      const rgb = big ? FX.orange : FX.red
      if (line) writeSlot(SLOT_LINE, CELL.scorch, px, 0.08, pz, rot, Math.max(width, 1.4), length, 1, FX.orange, 0, 0)
      else put(CELL.scorch, px, 0.08, pz, rot, width, length, seconds, rgb, 0, 0)
    },
    ring(px, pz, radius, rgb, seconds) {
      const slot = (life[SLOT_RING] ?? 0) <= (life[SLOT_RING_B] ?? 0) ? SLOT_RING : SLOT_RING_B
      const d = (Math.max(0.4, radius) * 2) / RING
      writeSlot(slot, CELL.ringThin, px, 0.12, pz, 0, d, d, seconds, rgb, 0, 0)
    },
    shell(px, pz, endRadius, seconds) {
      const slot = endRadius >= 6 ? SLOT_SHELL : SLOT_SHELL_B
      const d = (Math.max(0.4, endRadius) * 2) / RING
      writeSlot(slot, CELL.ringThick, px, 0.14, pz, 0, d, d, seconds, FX.gold, 3, 0)
    },
    ember(px, pz, big) {
      const n = big ? (tier === 'low' ? 3 : 5) : tier === 'low' ? 2 : 3
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        put(CELL.ember, px + Math.cos(a) * 0.25, 0.3, pz + Math.sin(a) * 0.25, a, big ? 0.32 : 0.22, big ? 0.32 : 0.22, 0.8, FX.orange, 2, 1.2 + i * 0.22)
      }
    },
    shimmer(px, pz, radius) {
      put(CELL.puff, px, 0.4, pz, 0, radius, radius * 0.62, 0.55, FX.shadePuff, 5, 0)
    },
    glint(px, py, pz, size) {
      put(CELL.spearGlow, px, py, pz, TUNING.camera.yaw, size, size, 0.12, FX.goldHot, 5, 0, 1)
    },
    anchor(px, py, pz, rot) {
      writeSlot(SLOT_GLOW, CELL.spearGlow, px, py, pz, rot, 0.62, 0.62, 0.2, FX.goldHot, 5, 0, 1)
    },
    hero(px, pz) {
      writeSlot(SLOT_HERO, CELL.sunRing, px, 0.07, pz, 0, 2.5, 2.5, 0.25, FX.goldHot, 0, 0, 1)
    },
    ribbon(px, py, pz, rot, length) {
      put(CELL.lanceRibbon, px, py, pz, rot, 0.42, length, 0.22, FX.punch, 0, 0, 0, 1)
    },
    star(px, pz) {
      const at = toward(px, 0.9, pz, 0.4)
      put(CELL.impactStar, at[0], at[1], at[2], TUNING.camera.yaw, 1.15, 1.15, 0.18, FX.goldHot, 5, 0, 1)
    },
    core(px, pz, radius) {
      const d = Math.max(0.4, radius) * 2
      put(CELL.coreGlow, px, 0.08, pz, 0, d * 1.35, d * 1.35, TUNING.flare.core, FX.punch, 0, 0, 1)
      put(CELL.flareCore, px, 0.2, pz, 0, d, d, TUNING.flare.core, FX.punch, 0, 0, 1)
    },
    band(px, pz, radius, seconds) {
      const d = Math.max(0.8, radius) * 2
      put(CELL.flareBand, px, 0.12, pz, 0, d, d, seconds, FX.punch, 3, 0, 0)
    },
    shock(px, pz, radius) {
      const d = (Math.max(0.4, radius) * 2) / RING
      put(CELL.shockRing, px, 0.14, pz, 0, d, d, 0.4, FX.gold, 3, 0)
    },
    shadowDisc(px, pz, radius, seconds) {
      const d = Math.max(0.6, radius) * 2
      put(CELL.bellShadow, px, 0.06, pz, 0, d, d, seconds, FX.gold, 0, 0)
    },
    gleamMark(slot, px, pz) {
      if (slot < 0 || slot >= TUNING.gleam.glyphs) return
      const at = toward(px, 1.35, pz, 0.35)
      const i = MAX - TUNING.gleam.glyphs + slot
      writeSlot(i, CELL.gleam, at[0], at[1], at[2], TUNING.camera.yaw, 1.25, 1.25, 0.08, FX.punch, 5, 0, 0)
    },
    sunspot(px, pz, radius, seconds) {
      const d = Math.max(0.4, radius) * 2
      put(CELL.coreGlow, px, 0.04, pz, 0, d * 1.15, d * 1.15, seconds, FX.punch, 6, 0, 1)
      put(CELL.sunspot, px, 0.05, pz, 0, d, d, seconds, FX.punch, 6, 0, 0)
    },
    ward(px, pz, radius) {
      const d = Math.max(0.8, radius) * 2
      put(CELL.wardRing, px, 0.08, pz, 0, d, d, 0.12, FX.punch, 0, 0)
    },
    glow(px, pz, radius) {
      const d = Math.max(0.4, radius) * 2
      put(CELL.coreGlow, px, 0.06, pz, 0, d, d, 0.2, FX.punch, 0, 0, 1)
    },
    dust(px, pz) {
      put(CELL.puff, px, 0.35, pz, 0, 1.4, 0.7, 0.35, FX.gold, 5, 0.4)
    },
    death(px, pz, lit) {
      salt = (salt + 17) | 0
      const n = 8
      for (let k = 0; k < n; k++) {
        const h = hash(salt * 13 + k * 97)
        const h2 = hash(salt * 29 + k * 53)
        const ang = h * Math.PI * 2
        const kind = lit ? CELL.goldSpark : CELL.inkA + (k % 3)
        const w = lit ? 0.5 : 0.42
        put(kind, px + Math.cos(ang) * 0.15, 0.45, pz + Math.sin(ang) * 0.15, ang, w, lit ? 0.22 : w, 0.36 + h2 * 0.12, FX.white, 2, 1.4 + h * 1.6)
      }
    },
    tele(px, pz, rot) {
      const fxDir = -Math.sin(rot)
      const fz = -Math.cos(rot)
      put(CELL.spearTrail, px + fxDir * 1.15, 0.08, pz + fz * 1.15, rot, 0.16, 2.1, 0.16, FX.red, 0, 0, 0, 1)
    },
    setFocus(px, pz) {
      focus.set(px, pz)
    },
    update(dt) {
      let nA = 0
      heroDraw = -1
      const limit = cap()
      let drawn = 0
      const face = TUNING.camera.yaw
      const pitch = TUNING.camera.pitch
      const horiz = Math.cos(pitch)
      for (let slot = nOrder - 1; slot >= 0; slot--) {
        const i = order[slot] ?? 0
        life[i] = (life[i] ?? 0) - dt
        if ((life[i] ?? 0) <= 0) {
          life[i] = 0
          active = Math.max(0, active - 1)
          untrack(i)
          continue
        }
        if (probeSoloCanon() && i !== SLOT_HERO && !soloCell(cell[i] ?? -1)) continue
        if (drawn >= limit) continue
        drawn++
        const k = (life[i] ?? 0) / Math.max(0.05, maxLife[i] ?? 0.2)
        const age = 1 - k
        let w = sx[i] ?? 0.2
        let h = sz[i] ?? 0.2
        if (mode[i] === 3) {
          const end = Math.max(w, 1)
          const s = end * (0.25 + 0.75 * Math.min(1, age))
          w = s
          h = s
        }
        if (mode[i] === 2) y[i] = (y[i] ?? 0) + (vy[i] ?? 0) * dt
        let fade = mode[i] === 3 ? Math.max(0.35, k) : k
        if (mode[i] === 6) {
          const left = life[i] ?? 0
          fade = left > 0.3 ? 1 : left / 0.3
        }
        const how = mode[i] ?? 0
        dummy.position.set(x[i] ?? 0, y[i] ?? 0, z[i] ?? 0)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.scale.set(Math.max(0.04, w), Math.max(0.04, h), 1)
        if (how === 5 || how === 2) {
          dummy.lookAt((x[i] ?? 0) + Math.sin(face) * horiz, (y[i] ?? 0) + Math.sin(pitch), (z[i] ?? 0) + Math.cos(face) * horiz)
        } else if (how === 4) dummy.rotation.y = yaw[i] ?? 0
        else {
          dummy.rotateX(-Math.PI / 2)
          dummy.rotateZ(yaw[i] ?? 0)
        }
        dummy.updateMatrix()
        const rect = UV[cell[i] ?? 0] ?? UV[0]
        const n = nA
        mesh.setMatrixAt(n, dummy.matrix)
        uvA.setXYZW(n, rect[0], rect[1], rect[2], rect[3])
        flagA.setX(n, ribbon[i] ? 1 : 0)
        hotA.setX(n, hotBit[i] ? 1 : 0)
        tint.setRGB((cr[i] ?? 0) * fade, (cg[i] ?? 0) * fade, (cb[i] ?? 0) * fade)
        mesh.setColorAt(n, tint)
        if (i === SLOT_HERO) heroDraw = n
        nA++
      }
      mesh.count = nA
      mesh.visible = nA > 0
      if (nA > 0) {
        stageFx(mesh.instanceMatrix, nA * 16, fxRange.matrix)
        stageFx(uvA, nA * 4, fxRange.uv)
        stageFx(flagA, nA, fxRange.flag)
        stageFx(hotA, nA, fxRange.hot)
        if (mesh.instanceColor) stageFx(mesh.instanceColor, nA * 3, fxRange.color)
      }
    },
    maskToHero() {
      if (masked) return
      masked = true
      savedCount = mesh.count
      if (heroDraw < 0 || savedCount < 1) {
        mesh.count = 0
        mesh.visible = false
        return
      }
      const mat = mesh.instanceMatrix.array as Float32Array
      const uv = uvA.array as Float32Array
      const col = mesh.instanceColor?.array as Float32Array | undefined
      if (heroDraw !== 0) {
        savedMat.set(mat.subarray(0, 16))
        savedUv.set(uv.subarray(0, 4))
        savedFlag[0] = flagA.getX(0)
        savedHot[0] = hotA.getX(0)
        if (col) savedCol.set(col.subarray(0, 3))
        heroMat.set(mat.subarray(heroDraw * 16, heroDraw * 16 + 16))
        heroUv.set(uv.subarray(heroDraw * 4, heroDraw * 4 + 4))
        heroFlag[0] = flagA.getX(heroDraw)
        heroHot[0] = hotA.getX(heroDraw)
        if (col) heroCol.set(col.subarray(heroDraw * 3, heroDraw * 3 + 3))
        mat.set(heroMat, 0)
        uv.set(heroUv, 0)
        flagA.setX(0, heroFlag[0] ?? 0)
        hotA.setX(0, heroHot[0] ?? 0)
        if (col) col.set(heroCol, 0)
      }
      mesh.count = 1
      mesh.visible = true
      stageFx(mesh.instanceMatrix, 16, fxRange.matrix)
      stageFx(uvA, 4, fxRange.uv)
      stageFx(flagA, 1, fxRange.flag)
      stageFx(hotA, 1, fxRange.hot)
      if (mesh.instanceColor) stageFx(mesh.instanceColor, 3, fxRange.color)
    },
    unmask() {
      if (!masked) return
      masked = false
      const mat = mesh.instanceMatrix.array as Float32Array
      const uv = uvA.array as Float32Array
      const col = mesh.instanceColor?.array as Float32Array | undefined
      if (heroDraw > 0) {
        mat.set(savedMat, 0)
        uv.set(savedUv, 0)
        flagA.setX(0, savedFlag[0] ?? 0)
        hotA.setX(0, savedHot[0] ?? 0)
        if (col) col.set(savedCol, 0)
      }
      mesh.count = savedCount
      mesh.visible = savedCount > 0
      if (savedCount > 0) {
        stageFx(mesh.instanceMatrix, savedCount * 16, fxRange.matrix)
        stageFx(uvA, savedCount * 4, fxRange.uv)
        stageFx(flagA, savedCount, fxRange.flag)
        stageFx(hotA, savedCount, fxRange.hot)
        if (mesh.instanceColor) stageFx(mesh.instanceColor, savedCount * 3, fxRange.color)
      }
    },
    clear() {
      masked = false
      heroDraw = -1
      life.fill(0)
      ord.fill(-1)
      nOrder = 0
      active = 0
      cursor = RESERVED
      mesh.count = 0
      mesh.visible = false
    },
    ready,
  }
  return fx
}
