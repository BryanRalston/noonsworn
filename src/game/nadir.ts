import {
  AdditiveBlending,
  AnimationMixer,
  Bone,
  CanvasTexture,
  Color,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  type AnimationAction,
  type Camera,
  type WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { COLOR, HEX } from '../data/palette'
import { TUNING } from '../data/tuning'
import { CARD } from './leveling'

/**
 * Nadir Court. Beams use the Sundial cone (17° half-angle) with the origin at Matins.
 * bossLock is true while she can be hit, so every weapon path reaches soak(); the
 * multiplier is Sela's beam membership, never litAt(boss).
 * Asset front is +z (m7 README). Parent yaw uses atan2(vx, vz) so that front follows travel.
 */

const N = TUNING.nadir
const BETA = (N.halfDeg * Math.PI) / 180
const COS_BETA = Math.cos(BETA)
const LIMIT = (70 * Math.PI) / 180
const PILLAR = TUNING.arena.pillarAt
const PILLAR_R = TUNING.arena.pillarR
const PILLARS: readonly [number, number][] = [
  [PILLAR, PILLAR],
  [PILLAR, -PILLAR],
  [-PILLAR, PILLAR],
  [-PILLAR, -PILLAR],
]
const CLIP = ['idle', 'walk', 'intro', 'lash', 'bell', 'shutter', 'chains', 'open', 'idle_open', 'sweep', 'hit', 'hit_open', 'death'] as const
const RAYS: readonly { id: number; name: string; text: string }[][] = [
  [
    { id: CARD.spear, name: 'Sunspear', text: 'Throws on its own.' },
    { id: CARD.halo, name: 'Halo Discs', text: 'Discs orbit and bite.' },
  ],
  [
    { id: CARD.flare, name: 'Solar Flare', text: 'A nova on the pack.' },
    { id: CARD.bell, name: 'Noon Bell', text: 'A toll on the densest pack.' },
  ],
  [
    { id: CARD.might, name: 'Might', text: 'Hits land harder.' },
    { id: CARD.haste, name: 'Haste', text: 'Weapons cycle faster.' },
  ],
  [
    { id: CARD.vitality, name: 'Vitality', text: 'A deeper pool of health.' },
    { id: CARD.swift, name: 'Swiftness', text: 'Longer steps.' },
  ],
  [
    { id: CARD.wide, name: 'Wide Noon', text: 'Your light opens wider.' },
    { id: CARD.searing, name: 'Searing Light', text: 'Lit foes keep burning.' },
  ],
]
const ROW_NAME = ['Weapon', 'Second', 'Power', 'Step', 'Light']

const vert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const frag = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec2 uBoss;
uniform vec4 uAng;
uniform vec4 uLen;
uniform vec4 uOn;
uniform float uCos;
uniform vec3 uPillar[4];
uniform vec3 uFloor;
uniform vec3 uBeam;
uniform vec3 uGold;
uniform vec3 uRim;
uniform vec3 uInk;
uniform float uTide;
uniform float uTideOn;
uniform float uGhost;
uniform float uInkAmt;
uniform float uPool;
uniform float uNotch;
uniform vec4 uShut;
uniform float uSeam;
uniform float uScar;
uniform vec4 uMark0;
uniform vec4 uMark1;
uniform vec4 uSafe;
uniform float uDawn;
uniform vec2 uDawnSun;
uniform vec2 uDawnDir;
uniform float uDawnCos;
uniform vec3 uDawnCol;
uniform vec3 uFog;

float clearance(vec2 s, vec2 p, vec2 c, float r) {
  vec2 d = p - s;
  float len2 = dot(d, d);
  if (len2 < 1e-6) return length(s - c) - r;
  float t = clamp(dot(c - s, d) / len2, 0.0, 1.0);
  return length(s + d * t - c) - r;
}

float coneAt(vec2 p, vec2 origin, vec2 dir, float cosBeta) {
  vec2 toP = p - origin;
  float along = dot(toP, dir);
  if (along <= 0.05) return 0.0;
  float side = abs(toP.x * dir.y - toP.y * dir.x);
  float s = sqrt(max(0.0, 1.0 - cosBeta * cosBeta));
  float halfW = along * s / max(cosBeta, 0.05);
  return smoothstep(0.0, 0.4, halfW - side);
}

float oneBeam(vec2 p, float ang, float len, float onFlag) {
  if (onFlag < 0.5) return 0.0;
  vec2 d = p - uBoss;
  float dist = length(d);
  if (dist > len || dist < 1e-3) return 0.0;
  return coneAt(p, uBoss, vec2(cos(ang), sin(ang)), uCos);
}

float occ(vec2 p) {
  float clearN = 40.0;
  for (int i = 0; i < 4; i++) clearN = min(clearN, clearance(uBoss, p, uPillar[i].xy, uPillar[i].z));
  return smoothstep(-0.4, 0.4, clearN);
}

float disc(vec2 p, vec4 m) {
  if (m.w < 0.01 || m.z < 0.01) return 0.0;
  float d = length(p - m.xy);
  float fill = (1.0 - smoothstep(m.z - 0.16, m.z, d)) * m.w;
  float rim = (1.0 - smoothstep(0.0, 0.16, abs(d - m.z))) * m.w;
  return max(fill * 0.78, rim);
}

void main() {
  vec2 p = vWorld.xz;
  float b0 = oneBeam(p, uAng.x, uLen.x, uOn.x);
  float b1 = oneBeam(p, uAng.y, uLen.y, uOn.y);
  float b2 = oneBeam(p, uAng.z, uLen.z, uOn.z);
  float b3 = oneBeam(p, uAng.w, uLen.w, uOn.w);
  float beam = max(max(b0, b1), max(b2, b3));
  float lit = beam > 0.001 ? beam * occ(p) : 0.0;
  vec3 col = mix(uFloor, uBeam, clamp(lit, 0.0, 1.0));
  float edge = 0.0;
  if (b0 > 0.2) edge = max(edge, 1.0 - smoothstep(0.0, 0.35, abs(b0 - 0.55)));
  col += uGold * edge * lit * 0.22;
  float dist = length(p - uBoss);
  col += vec3(0.45, 0.22, 0.06) * exp(-dist * 0.22) * uPool;
  col = mix(col, uInk, smoothstep(16.0, 23.0, dist) * 0.62);
  if (uShut.w > 0.5) {
    vec2 dir = vec2(cos(uShut.x), sin(uShut.x));
    vec2 rel = p - uBoss;
    float along = dot(rel, dir);
    float side = abs(rel.x * dir.y - rel.y * dir.x);
    float halfW = max(along, 0.2) * tan(acos(uCos));
    float inner = halfW * (1.0 - uShut.y);
    if (along > 0.4 && along < uShut.z && side < halfW && side > inner) {
      col = mix(col, uInk, 0.78);
      if (side < inner + 0.16) col = mix(col, uRim, 0.9);
    }
    if ((uSeam > 0.5 || uScar > 0.5) && along > 0.4 && along < uShut.z && side < 0.8) {
      col = mix(col, uInk, uScar > 0.5 ? 0.45 : 0.78);
      if (uSeam > 0.5 && side > 0.64) col = uRim;
    }
  }
  if (uTideOn > 0.5) {
    float rim = 1.0 - smoothstep(0.0, 0.15, abs(dist - uTide));
    col = mix(col, uRim, rim);
    col = mix(col, uInk, smoothstep(uTide - 0.2, uTide + 1.4, dist) * uInkAmt);
    if (uGhost > 0.0) {
      float ghost = 1.0 - smoothstep(0.0, 0.15, abs(dist - uGhost));
      col = mix(col, uRim, ghost * 0.85);
    }
  }
  if (uNotch > 0.5) {
    for (int i = 0; i < 4; i++) {
      float a = (i < 2 ? 1.0 : -1.0) * 1.2217 + (i == 1 || i == 3 ? 3.14159 : 0.0);
      vec2 q = uBoss + vec2(cos(a), sin(a)) * 12.0;
      col += uGold * (1.0 - smoothstep(0.15, 0.42, length(p - q)));
    }
  }
  if (uMark0.w > 1.5) {
    vec2 rel = p - uMark0.xy;
    float d = length(rel);
    float a = atan(rel.y, rel.x);
    float delta = abs(atan(sin(a - uMark1.x), cos(a - uMark1.x)));
    if (d > 0.3 && d < uMark0.z && delta < uMark1.y) {
      float rim = 1.0 - smoothstep(0.0, 0.16, min(uMark0.z - d, (uMark1.y - delta) * max(d, 0.4)));
      col = mix(col, uInk, 0.78);
      col = mix(col, uRim, rim);
    }
  } else {
    float mark = max(disc(p, uMark0), disc(p, uMark1));
    col = mix(col, uInk, clamp(mark, 0.0, 0.78));
    if (mark > 0.7) col = mix(col, uRim, smoothstep(0.7, 1.0, mark));
  }
  if (uSafe.w > 0.5) {
    vec2 rel = p - uBoss;
    float d = length(rel);
    float a = atan(rel.y, rel.x);
    float delta = abs(atan(sin(a - uSafe.x), cos(a - uSafe.x)));
    if (d > 1.2 && d < uSafe.z && delta < uSafe.y) col = mix(col, uGold, 0.55);
  }
  if (uDawn > 0.001) {
    vec2 toP = p - uDawnSun;
    float dd = length(toP);
    vec2 nrm = dd > 1e-4 ? toP / dd : uDawnDir;
    float dawnCone = coneAt(p, uDawnSun, uDawnDir, uDawnCos);
    float clearN = 40.0;
    for (int i = 0; i < 4; i++) clearN = min(clearN, clearance(uDawnSun, p, uPillar[i].xy, uPillar[i].z));
    float shadow = smoothstep(-0.15, 0.55, clearN);
    col = mix(col, uDawnCol, clamp(dawnCone * shadow, 0.0, 1.0) * uDawn);
  }
  float fogF = smoothstep(30.0, 74.0, length(cameraPosition - vWorld));
  col = mix(col, uFog, fogF * 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const probeFrag = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec2 uBoss;
uniform vec4 uAng;
uniform vec4 uLen;
uniform vec4 uOn;
uniform float uCos;
uniform vec3 uPillar[4];
float clearance(vec2 s, vec2 p, vec2 c, float r) {
  vec2 d = p - s;
  float len2 = dot(d, d);
  if (len2 < 1e-6) return length(s - c) - r;
  float t = clamp(dot(c - s, d) / len2, 0.0, 1.0);
  return length(s + d * t - c) - r;
}
float oneBeam(vec2 p, float ang, float len, float onFlag) {
  if (onFlag < 0.5) return 0.0;
  vec2 d = p - uBoss;
  float dist = length(d);
  if (dist > len || dist < 1e-3) return 0.0;
  vec2 dir = vec2(cos(ang), sin(ang));
  float along = dot(d, dir);
  if (along <= 0.05) return 0.0;
  float side = abs(d.x * dir.y - d.y * dir.x);
  float s = sqrt(max(0.0, 1.0 - uCos * uCos));
  float halfW = along * s / max(uCos, 0.05);
  return smoothstep(0.0, 0.4, halfW - side);
}
void main() {
  vec2 p = vWorld.xz;
  float beam = max(max(oneBeam(p, uAng.x, uLen.x, uOn.x), oneBeam(p, uAng.y, uLen.y, uOn.y)), max(oneBeam(p, uAng.z, uLen.z, uOn.z), oneBeam(p, uAng.w, uLen.w, uOn.w)));
  float lit = 0.0;
  if (beam > 0.001) {
    float clearN = 40.0;
    for (int i = 0; i < 4; i++) clearN = min(clearN, clearance(uBoss, p, uPillar[i].xy, uPillar[i].z));
    lit = beam * smoothstep(-0.4, 0.4, clearN) > 0.5 ? 1.0 : 0.0;
  }
  gl_FragColor = vec4(vec3(lit), 1.0);
}
`

export interface NadirHooks {
  spawn: (x: number, z: number) => void
  cull: (n: number) => void
  mites: () => number
  hurt: (amount: number, reason: string) => void
  tide: (amount: number) => void
  grant: (id: number) => void
  buzz: (pattern: number | number[]) => void
  toast: (text: string) => void
  pip: (x: number, z: number) => void
  ring: (x: number, z: number, radius: number, rgb: readonly number[], seconds: number) => void
  sfx: (name: 'chime' | 'clamp' | 'crack' | 'rumble' | 'scrape' | 'exposed' | 'armored') => void
  rng: () => number
}

export interface NadirView {
  stage: 'noon' | 'drain' | 'draft' | 'silence' | 'intro' | 'fight' | 'ending' | 'card'
  drain: number
  combat: boolean
  freezeTime: boolean
  boss: { x: number; z: number; r: number } | null
  lock: boolean
  exposed: boolean
  showBoss: boolean
  phase: 1 | 2 | 3
  hint: string
  clock: string
  showClock: boolean
  remain: number
  claimed: boolean
  inkLoss: boolean
  warm: number
  duck: boolean
  music: 'night' | 'cut' | 'dawn' | 'hold'
  sworn: boolean
  warmUp: boolean
}

export interface NadirInfo {
  phase: 1 | 2 | 3
  hp: number
  max: number
  exposed: boolean
  stage: NadirView['stage']
  clock: number
  remain: number
  enrage: boolean
  cracks: number
  tide: number
  ending: number
  boss: { x: number; z: number }
  beams: { ang: number; len: number; on: number; held: number }[]
  beamTime: number
  exposedDmg: number
  sealedDmg: number
  shutterHits: number
  p3at: number
  result: string
  draws: number
  /** Peak on frames the Five Rays panel or the result card covers. Not the play gate. */
  warmDraws: number
  source: string
  tell: { kind: string; t: number; dur: number; ang: number; x: number; z: number; r: number } | null
}

interface Beam {
  ang: number
  len: number
  on: number
  held: number
}

interface Tell {
  kind: 'lash' | 'bell' | 'seam' | 'chains' | 'sweep'
  t: number
  dur: number
  ang: number
  x: number
  z: number
  r: number
  beam: number
  hit: boolean
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function wrap(a: number): number {
  let v = a
  while (v > Math.PI) v -= Math.PI * 2
  while (v < -Math.PI) v += Math.PI * 2
  return v
}

function angDist(a: number, b: number): number {
  return Math.abs(wrap(a - b))
}

function clearance(sx: number, sz: number, px: number, pz: number, cx: number, cz: number, r: number): number {
  const dx = px - sx
  const dz = pz - sz
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-6) return Math.hypot(sx - cx, sz - cz) - r
  let t = ((cx - sx) * dx + (cz - sz) * dz) / len2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  return Math.hypot(sx + dx * t - cx, sz + dz * t - cz) - r
}

function pointSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  let t = len2 < 1e-8 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds - 1e-6))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export interface NadirHandle {
  ready: boolean
  load: () => Promise<void>
  begin: (noon: boolean) => void
  clear: () => void
  tick: (dt: number, time: number, px: number, pz: number, camera: Camera) => NadirView
  soak: (x: number, z: number, radius: number, base: number, source: string, might: number, stamp: number) => boolean
  crack: (sx: number, sz: number, ex: number, ez: number) => boolean
  isLit: (x: number, z: number) => boolean
  agree: (renderer: WebGLRenderer, camera: Camera, points: { x: number; z: number }[], hide: Object3D[]) => { tested: number; agree: number }
  jump: (phase: 1 | 2 | 3) => void
  pose: (name: string) => void
  autoRays: (ids: readonly number[]) => void
  setSliver: (on: boolean) => void
  skip: () => void
  /** True when `advance` more seconds of the ending would open the credits card. */
  cardDue: (advance: number) => boolean
  info: () => NadirInfo
  warm: (renderer: WebGLRenderer, camera: Camera) => void
  noteDraws: (n: number, visible: boolean) => void
  bossPos: () => { x: number; z: number }
  primeHint: (seen: boolean) => void
  noteDeath: () => void
}

export function createNadir(opts: { scene: Scene; hide: Object3D[]; tint: Object3D[]; hooks: NadirHooks }): NadirHandle {
  const { scene, hide, tint, hooks } = opts
  const uBoss = new Vector2()
  const uAng = new Vector4()
  const uLen = new Vector4(N.beam, N.beam, N.beam, N.beam)
  const uOn = new Vector4()
  const uPillar = PILLARS.map(([x, z]) => new Vector3(x, z, PILLAR_R))
  const uShut = new Vector4()
  const uMark0 = new Vector4()
  const uMark1 = new Vector4()
  const uSafe = new Vector4()
  const uDawnSun = new Vector2(40, 0)
  const uDawnDir = new Vector2(-1, 0)
  const rim = new Color(HEX.telegraph)
  const uniforms = {
    uBoss: { value: uBoss },
    uAng: { value: uAng },
    uLen: { value: uLen },
    uOn: { value: uOn },
    uCos: { value: COS_BETA },
    uPillar: { value: uPillar },
    uFloor: { value: COLOR.nadirFloor.clone() },
    uBeam: { value: COLOR.nadirBeam.clone() },
    uGold: { value: COLOR.gold.clone() },
    uRim: { value: rim },
    uInk: { value: new Color().setRGB(0.012, 0.008, 0.02) },
    uTide: { value: 23 },
    uTideOn: { value: 0 },
    uGhost: { value: 0 },
    uInkAmt: { value: 0.85 },
    uPool: { value: 0.55 },
    uNotch: { value: 0 },
    uShut: { value: uShut },
    uSeam: { value: 0 },
    uScar: { value: 0 },
    uMark0: { value: uMark0 },
    uMark1: { value: uMark1 },
    uSafe: { value: uSafe },
    uDawn: { value: 0 },
    uDawnSun: { value: uDawnSun },
    uDawnDir: { value: uDawnDir },
    uDawnCos: { value: COS_BETA },
    uDawnCol: { value: new Color().setRGB(0.95, 0.62, 0.28) },
    uFog: { value: COLOR.nadirSky.clone() },
  }
  const mat = new ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, fog: false })
  const probe = new ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: probeFrag,
    toneMapped: false,
  })
  const geo = new PlaneGeometry(TUNING.arena.size, TUNING.arena.size)
  geo.rotateX(-Math.PI / 2)
  const floor = new Mesh(geo, mat)
  floor.name = 'nadirFloor'
  floor.position.y = 0.02
  floor.frustumCulled = false
  floor.visible = false
  scene.add(floor)

  const haloCanvas = document.createElement('canvas')
  haloCanvas.width = 80
  haloCanvas.height = 80
  const hg = haloCanvas.getContext('2d')
  if (hg) {
    const g = hg.createRadialGradient(40, 40, 6, 40, 40, 40)
    g.addColorStop(0, 'rgba(255, 236, 190, 0.95)')
    g.addColorStop(0.35, 'rgba(255, 170, 60, 0.45)')
    g.addColorStop(1, 'rgba(255, 120, 20, 0)')
    hg.fillStyle = g
    hg.fillRect(0, 0, 80, 80)
  }
  const haloMap = new CanvasTexture(haloCanvas)
  haloMap.colorSpace = SRGBColorSpace
  const halo = new Sprite(new SpriteMaterial({ map: haloMap, transparent: true, blending: AdditiveBlending, depthWrite: false }))
  halo.name = 'matinsHalo'
  halo.scale.set(2.3, 2.3, 1)
  halo.frustumCulled = false
  halo.visible = false
  scene.add(halo)

  let rig: Object3D | null = null
  let mixer: AnimationMixer | null = null
  const actions = new Map<string, AnimationAction>()
  let clipName = ''
  let orbBone: Bone | null = null
  let emitMat: MeshStandardMaterial | null = null
  let ready = false
  const savedTint: { color: Color; target: Color }[] = []
  const beams: Beam[] = [
    { ang: 0, len: N.beam, on: 0, held: 0 },
    { ang: Math.PI, len: N.beam, on: 0, held: 0 },
    { ang: 0, len: N.beam, on: 0, held: 0 },
    { ang: 0, len: N.beam, on: 0, held: 0 },
  ]
  const cracked: number[] = []
  let stage: NadirView['stage'] = 'draft'
  let stageT = 0
  let fightT = 0
  let phase: 1 | 2 | 3 = 1
  let hp: number = N.hp
  let exposed = false
  let beamAng = 0
  let omega = (20 * Math.PI) / 180
  let chimeLeg = false
  let bossX = 0
  let bossZ = 0
  let walk = 0
  let tell: Tell | null = null
  let nextResolve = -10
  let shutAcc = 0
  let shutStep = 0
  let miteAcc = 0
  let teachLash = false
  let p2t = 0
  let p3t = 0
  let p3move = 0
  let nextSweep = 4
  let crackPrompt = false
  let enrage = false
  let enrageT = 0
  let enrageFrom = 23
  let tideR: number = 23
  let tideOn = false
  let ghost = 0
  let endingT = -1
  let claimed = false
  let remain: number = N.clock
  let released = false
  let warmed = false
  let drain = 0
  let clockPin = -1
  let seamBuzz = false
  let notchT = 0
  let reopen: { beam: number; ang: number } | null = null
  const hideWas: boolean[] = []
  let lastStamp = 0
  let lastSource = ''
  let beamTime = 0
  let exposedDmg = 0
  let sealedDmg = 0
  let shutterHits = 0
  let p3at = -1
  let result = 'live'
  let peakDraws = 0
  let warmPeak = 0
  let hintSeen = false
  let scarT = 0
  let shutAng = 0
  let shutLen: number = N.beam
  let shutClose = 0
  let seamLive = false
  let duck = false
  let rumbleOn = false
  let farX = 0
  let farZ = -1
  let deferP3 = false
  let deferSweep = false
  let deferEnding: { t: number; card: boolean } | null = null
  let burst = 0
  const rays = [-1, -1, -1, -1, -1]
  let sliverOn = false
  let lightName: HTMLElement | null = null
  let lightText: HTMLElement | null = null
  const lode = { id: CARD.lodestone, name: 'Lodestone', text: 'Pulls shards from farther off.' }
  function lightPick(which: number): { id: number; name: string; text: string } | undefined {
    if (sliverOn && which === 0) return lode
    return RAYS[4]?.[which]
  }
  const tmp = new Vector3()
  const fwd = new Vector3()
  const goldRgb = [COLOR.gold.r, COLOR.gold.g, COLOR.gold.b]
  const rimRgb = [rim.r, rim.g, rim.b]

  const root = document.createElement('div')
  root.id = 'five-rays'
  root.hidden = true
  root.innerHTML = '<h2>Five Rays</h2><p>Pick one from each row. The night holds.</p>'
  const rows = document.createElement('div')
  RAYS.forEach((pair, bucket) => {
    const row = document.createElement('div')
    row.className = 'ray-row'
    const label = document.createElement('span')
    label.textContent = ROW_NAME[bucket] ?? ''
    row.append(label)
    pair.forEach((card, which) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.innerHTML = `<strong>${card.name}</strong><em>${card.text}</em>`
      if (bucket === 4 && which === 0) {
        lightName = btn.querySelector('strong')
        lightText = btn.querySelector('em')
      }
      btn.addEventListener('click', () => choose(bucket, which))
      row.append(btn)
    })
    rows.append(row)
  })
  root.append(rows)
  const skipBtn = document.createElement('button')
  skipBtn.id = 'nadir-skip'
  skipBtn.type = 'button'
  skipBtn.textContent = 'Skip'
  skipBtn.hidden = true
  skipBtn.addEventListener('click', () => skip())
  const swornEl = document.createElement('div')
  swornEl.id = 'noon-sworn'
  swornEl.textContent = 'NOON IS SWORN'
  swornEl.hidden = true
  document.body.append(root, skipBtn, swornEl)

  function grantPick(bucket: number, which: number) {
    if ((rays[bucket] ?? -1) >= 0) return
    const card = bucket === 4 ? lightPick(which) : RAYS[bucket]?.[which]
    if (!card) return
    rays[bucket] = which
    hooks.grant(card.id)
    hooks.sfx('chime')
    paintRays()
  }

  function choose(bucket: number, which: number) {
    if (stage !== 'draft') return
    grantPick(bucket, which)
    if (rays.every((v) => v >= 0)) {
      stage = 'silence'
      stageT = 0
      root.hidden = true
    }
  }

  function paintRays() {
    const buttons = rows.querySelectorAll('button')
    let n = 0
    for (let b = 0; b < RAYS.length; b++) {
      const pair = RAYS[b] ?? []
      for (let w = 0; w < pair.length; w++) {
        const btn = buttons[n]
        n++
        if (!btn) continue
        const picked = rays[b] === w
        btn.classList.toggle('picked', picked)
        btn.disabled = (rays[b] ?? -1) >= 0 && !picked
      }
    }
  }

  function playClip(name: string, loop: boolean) {
    const next = actions.get(name)
    if (!next) return
    if (clipName === name && next.isRunning()) return
    const prev = actions.get(clipName)
    if (prev && prev !== next) prev.fadeOut(0.12)
    next.reset()
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
    next.clampWhenFinished = !loop
    next.enabled = true
    next.fadeIn(0.12).play()
    clipName = name
  }

  function showCourt() {
    if (hideWas.length === 0) {
      for (const obj of hide) hideWas.push(obj.visible)
    }
    for (const obj of hide) obj.visible = false
    floor.visible = true
    if (rig) rig.visible = true
    halo.visible = true
    if (savedTint.length === 0) {
      for (const obj of tint) {
        obj.traverse((child) => {
          const mesh = child as Mesh
          if (!mesh.isMesh) return
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const material of list) {
            const colored = material as { color?: Color }
            if (!colored.color) continue
            savedTint.push({ color: colored.color.clone(), target: colored.color })
          }
        })
      }
    }
  }

  function hideCourt() {
    floor.visible = false
    halo.visible = false
    if (rig) rig.visible = false
    for (let i = 0; i < hide.length; i++) {
      const obj = hide[i]
      if (obj) obj.visible = hideWas[i] ?? true
    }
    for (const row of savedTint) row.target.copy(row.color)
    root.hidden = true
    skipBtn.hidden = true
  }

  function applyTint(warm: number) {
    const night = 0.42 + warm * 0.58
    for (const row of savedTint) {
      row.target.copy(row.color).multiplyScalar(night)
      row.target.r = Math.min(1, row.target.r + warm * 0.25)
      row.target.g = Math.min(1, row.target.g + warm * 0.18)
    }
  }

  function occAt(px: number, pz: number): number {
    let clearN = 40
    for (let i = 0; i < PILLARS.length; i++) {
      const pillar = PILLARS[i]
      if (!pillar) continue
      clearN = Math.min(clearN, clearance(bossX, bossZ, px, pz, pillar[0], pillar[1], PILLAR_R))
    }
    return smoothstep(-0.4, 0.4, clearN)
  }

  function beamValue(px: number, pz: number, beam: Beam): number {
    if (beam.on < 0.5) return 0
    const dx = px - bossX
    const dz = pz - bossZ
    const dist = Math.hypot(dx, dz)
    if (dist > beam.len || dist < 1e-3) return 0
    const along = Math.cos(beam.ang) * dx + Math.sin(beam.ang) * dz
    if (along <= 0.05) return 0
    const side = Math.abs(-Math.sin(beam.ang) * dx + Math.cos(beam.ang) * dz)
    const half = along * Math.tan(BETA)
    return smoothstep(0, 0.4, half - side)
  }

  function litAmount(px: number, pz: number): number {
    let beam = 0
    for (let i = 0; i < beams.length; i++) {
      const row = beams[i]
      if (row) beam = Math.max(beam, beamValue(px, pz, row))
    }
    if (beam <= 0.001) return 0
    return beam * occAt(px, pz)
  }

  function beamIndexAt(px: number, pz: number): number {
    let best = -1
    let score = 0
    for (let i = 0; i < beams.length; i++) {
      const row = beams[i]
      if (!row) continue
      const v = beamValue(px, pz, row) * occAt(px, pz)
      if (v > score) {
        score = v
        best = i
      }
    }
    return score > 0.5 ? best : -1
  }

  function syncBeams() {
    uBoss.set(bossX, bossZ)
    uAng.set(beams[0]?.ang ?? 0, beams[1]?.ang ?? 0, beams[2]?.ang ?? 0, beams[3]?.ang ?? 0)
    uLen.set(beams[0]?.len ?? 0, beams[1]?.len ?? 0, beams[2]?.len ?? 0, beams[3]?.len ?? 0)
    uOn.set(beams[0]?.on ?? 0, beams[1]?.on ?? 0, beams[2]?.on ?? 0, beams[3]?.on ?? 0)
    uniforms.uNotch.value = phase === 1 && stage === 'fight' ? 1 : 0
    uniforms.uTide.value = tideR
    uniforms.uTideOn.value = tideOn ? 1 : 0
    uniforms.uGhost.value = ghost
    uniforms.uSeam.value = seamLive ? 1 : 0
    uniforms.uScar.value = scarT > 0 ? 1 : 0
    uniforms.uPool.value = 0.5 + 0.12 * Math.sin(fightT * 3)
    if (emitMat) emitMat.emissiveIntensity = released ? 2.4 : 1.1 + 0.12 * Math.sin(fightT * 3)
    uShut.set(shutAng, shutClose, shutLen, shutClose > 0 || scarT > 0 ? 1 : 0)
  }

  function arm(dur: number): boolean {
    const at = fightT + Math.max(0.8, dur)
    if (nextResolve >= 0 && at < nextResolve + 0.6) return false
    nextResolve = at
    return true
  }

  function startTell(next: Tell) {
    tell = next
    duck = true
    if (next.kind === 'lash') playClip('lash', false)
    else if (next.kind === 'bell') {
      playClip('bell', false)
      hooks.ring(next.x, next.z, next.r, rimRgb, next.dur)
    } else if (next.kind === 'seam') {
      playClip('shutter', false)
      hooks.sfx('clamp')
      const beam = beams[next.beam]
      if (beam) beam.on = 0
      shutAng = next.ang
      shutLen = beam?.len ?? N.beam
      shutClose = 0
      seamBuzz = false
    } else if (next.kind === 'chains') {
      playClip('chains', false)
      hooks.ring(next.x, next.z, next.r, rimRgb, next.dur)
    } else if (next.kind === 'sweep') {
      playClip('sweep', false)
      hooks.sfx('scrape')
      hooks.ring(bossX, bossZ, 7, rimRgb, next.dur)
    }
  }

  function setPair() {
    const a = beams[0]
    const b = beams[1]
    if (a) {
      a.ang = beamAng
      a.len = N.beam
      a.on = 1
    }
    if (b) {
      b.ang = beamAng + Math.PI
      b.len = N.beam
      b.on = 1
    }
    const c = beams[2]
    const d = beams[3]
    if (c) c.on = 0
    if (d) d.on = 0
  }

  function enterP2() {
    phase = 2
    p2t = 0
    shutAcc = 0
    shutStep = 0
    const base = 0
    for (let i = 0; i < 3; i++) {
      const beam = beams[i]
      if (!beam) continue
      beam.ang = base + (i * 2 * Math.PI) / 3
      beam.len = N.beam
      beam.on = 1
      beam.held = 0
    }
    if (beams[3]) beams[3].on = 0
    playClip('idle', true)
  }

  function enterP3(camera: Camera) {
    phase = 3
    p3t = 0
    p3move = 0
    nextSweep = 4
    if (p3at < 0) p3at = fightT
    camera.getWorldDirection(fwd)
    fwd.y = 0
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1)
    else fwd.normalize()
    const base = Math.atan2(fwd.z, fwd.x) + Math.PI / 4
    for (let i = 0; i < 4; i++) {
      const beam = beams[i]
      if (!beam) continue
      beam.ang = base + (i * Math.PI) / 2
      beam.len = N.beam
      beam.on = 1
      beam.held = 0
    }
    for (let c = 0; c < cracked.length && c < 2; c++) {
      const ang = cracked[c] ?? 0
      let best = 0
      let score = 99
      for (let i = 0; i < 4; i++) {
        const d = angDist(beams[i]?.ang ?? 0, ang)
        if (d < score) {
          score = d
          best = i
        }
      }
      const beam = beams[best]
      if (beam) beam.held = 1
    }
    tideOn = true
    tideR = 23
    playClip('open', false)
  }

  function enterEnding(camera: Camera) {
    if (stage === 'ending' || stage === 'card') return
    stage = 'ending'
    endingT = 0
    claimed = false
    result = 'clear'
    remain = Math.max(0, N.clock - fightT)
    hp = 0
    released = false
    burst = 0.45
    camera.getWorldDirection(fwd)
    fwd.y = 0
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1)
    else fwd.normalize()
    farX = fwd.x
    farZ = fwd.z
    for (const beam of beams) beam.on = 1
    hooks.buzz([60, 30, 60])
    playClip('death', false)
  }

  function resolveTell(px: number, pz: number) {
    if (!tell || tell.hit) return
    tell.hit = true
    const dx = px - bossX
    const dz = pz - bossZ
    const dist = Math.hypot(dx, dz)
    const pang = Math.atan2(dz, dx)
    if (tell.kind === 'lash') {
      if (dist <= 4 && angDist(pang, tell.ang) <= (120 * Math.PI) / 180 / 2) hooks.hurt(N.lash, 'the lash')
    } else if (tell.kind === 'bell') {
      if (Math.hypot(px - tell.x, pz - tell.z) <= tell.r) hooks.hurt(N.bell, 'the toll')
    } else if (tell.kind === 'seam') {
      const along = Math.cos(tell.ang) * dx + Math.sin(tell.ang) * dz
      const side = Math.abs(dx * Math.sin(tell.ang) - dz * Math.cos(tell.ang))
      if (along > 0.4 && along < shutLen && side <= 0.8) {
        hooks.hurt(N.seam, 'the seam')
        shutterHits++
      }
      seamLive = false
      scarT = 1.5
    } else if (tell.kind === 'chains') {
      if (Math.hypot(px - tell.x, pz - tell.z) <= tell.r) hooks.hurt(N.chain, 'the chains')
    } else if (tell.kind === 'sweep') {
      const safe = angDist(pang, tell.ang) <= (40 * Math.PI) / 180 / 2
      if (dist <= 7 && !safe) {
        hooks.hurt(N.sweep, 'the sweep')
        hooks.buzz(35)
      }
    }
  }

  function stepTell(dt: number, px: number, pz: number) {
    if (!tell) {
      duck = false
      seamLive = false
      return
    }
    tell.t += dt
    duck = tell.t < tell.dur
    if (tell.kind === 'seam') {
      shutClose = Math.min(1, tell.t / 1.25)
      if (tell.t >= 1.25 && tell.t < 1.75) seamLive = true
      else seamLive = false
      if (tell.t >= 1.25 && !tell.hit) resolveTell(px, pz)
      if (tell.t >= 1.25 + 0.5) {
        tell = null
        duck = false
      }
      return
    }
    if (tell.t >= tell.dur && !tell.hit) resolveTell(px, pz)
    if (tell.t >= tell.dur + 0.05) tell = null
  }

  function stepFight(dt: number, px: number, pz: number, camera: Camera) {
    const dx = px - bossX
    const dz = pz - bossZ
    const dist = Math.hypot(dx, dz)
    const pang = Math.atan2(dz, dx)
    if (phase === 1) {
      beamAng += omega * dt
      if (beamAng >= LIMIT) {
        beamAng = LIMIT
        omega = -Math.abs(omega)
        chimeLeg = false
      } else if (beamAng <= -LIMIT) {
        beamAng = -LIMIT
        omega = Math.abs(omega)
        chimeLeg = false
      }
      const remainAng = omega > 0 ? LIMIT - beamAng : beamAng + LIMIT
      const eta = remainAng / Math.abs(omega)
      if (eta <= 1 && eta > 0 && !chimeLeg) {
        chimeLeg = true
        hooks.sfx('chime')
        const ahead = beamAng + Math.sign(omega) * 0.35
        hooks.ring(bossX + Math.cos(ahead) * 10, bossZ + Math.sin(ahead) * 10, 0.7, goldRgb, 1)
      }
      setPair()
      walk += dt * (N.speed / 2.2)
      bossX = Math.cos(walk) * 2.2
      bossZ = Math.sin(walk) * 2.2
      const vx = -Math.sin(walk)
      const vz = Math.cos(walk)
      if (rig) rig.rotation.y = Math.atan2(vx, vz)
      if (clipName !== 'lash' && clipName !== 'bell') playClip('walk', true)
      if (fightT >= 8 && !teachLash && dist <= 6 && !tell && arm(1)) {
        teachLash = true
        startTell({ kind: 'lash', t: 0, dur: 1, ang: pang, x: bossX, z: bossZ, r: 4, beam: -1, hit: false })
      }
      if (fightT >= N.teach && !tell && dist <= 6 && arm(1) && hooks.rng() < dt * 0.35) {
        startTell({ kind: 'lash', t: 0, dur: 1, ang: pang, x: bossX, z: bossZ, r: 4, beam: -1, hit: false })
      } else if (fightT >= N.teach && !tell && arm(1) && hooks.rng() < dt * 0.28) {
        const aim = beamAng + omega * 1
        const pr = Math.min(16, Math.max(4, dist))
        startTell({
          kind: 'bell',
          t: 0,
          dur: 1,
          ang: aim,
          x: bossX + Math.cos(aim) * pr,
          z: bossZ + Math.sin(aim) * pr,
          r: 1.6,
          beam: -1,
          hit: false,
        })
      }
      if (fightT >= N.teach) {
        miteAcc += dt
        if (miteAcc >= 1 && hooks.mites() < 12) {
          miteAcc = 0
          for (let n = 0; n < 8; n++) {
            const a = hooks.rng() * Math.PI * 2
            const r = 10 + hooks.rng() * 6
            const x = bossX + Math.cos(a) * r
            const z = bossZ + Math.sin(a) * r
            if (litAmount(x, z) < 0.5) {
              hooks.spawn(x, z)
              break
            }
          }
        }
      }
    } else {
      const d = Math.hypot(bossX, bossZ)
      if (d > 0.08) {
        const step = Math.min(d, N.speed * dt)
        bossX -= (bossX / d) * step
        bossZ -= (bossZ / d) * step
        if (rig) rig.rotation.y = Math.atan2(-bossX, -bossZ)
        if (!tell) playClip('walk', true)
      } else if (!tell && phase === 2) playClip('idle', true)
      else if (!tell && phase === 3 && clipName !== 'idle_open' && clipName !== 'open') playClip('idle_open', true)
    }
    if (phase === 2) {
      p2t += dt
      if (dist > 3 && !tell) shutAcc += dt
      const wait = shutStep < 2 ? 8 : 7
      if (!tell && shutAcc >= wait && dist > 3) {
        let best = 0
        let score = 99
        for (let i = 0; i < 3; i++) {
          const beam = beams[i]
          if (!beam || beam.on < 0.5 || beam.held) continue
          const dAng = angDist(beam.ang, pang)
          if (dAng < score) {
            score = dAng
            best = i
          }
        }
        const beam = beams[best]
        if (beam && beam.held === 0 && arm(1.25)) {
          shutAcc = 0
          shutStep++
          startTell({ kind: 'seam', t: 0, dur: 1.25, ang: beam.ang, x: bossX, z: bossZ, r: 0.8, beam: best, hit: false })
          const sign = angDist(beam.ang + 2.3, pang) > angDist(beam.ang - 2.3, pang) ? 1 : -1
          const delta = ((120 + hooks.rng() * 30) * Math.PI) / 180
          reopen = { beam: best, ang: wrap(beam.ang + sign * delta) }
        }
      }
      if (!tell && !seamLive && scarT <= 0 && arm(1.2) && hooks.rng() < dt * 0.22) {
        const a = pang
        startTell({
          kind: 'chains',
          t: 0,
          dur: 1.2,
          ang: a,
          x: bossX + Math.cos(a) * Math.min(8, Math.max(4, dist)),
          z: bossZ + Math.sin(a) * Math.min(8, Math.max(4, dist)),
          r: 1.6,
          beam: -1,
          hit: false,
        })
      }
      if (hooks.mites() > 8) hooks.cull(8)
      if (!tell && hooks.mites() < 8) {
        miteAcc += dt
        if (miteAcc >= 1.3) {
          miteAcc = 0
          const a = hooks.rng() * Math.PI * 2
          hooks.spawn(bossX + Math.cos(a) * 12, bossZ + Math.sin(a) * 12)
        }
      }
      if (p2t >= 18 && cracked.length === 0 && !crackPrompt) {
        crackPrompt = true
        hooks.toast('Noon Cut through it from the light')
      }
      if (dist <= 6.5 && cracked.length < 2) {
        notchT -= dt
        if (notchT <= 0) {
          notchT = 0.5
          hooks.ring(bossX, bossZ, 0.7, goldRgb, 0.45)
        }
      }
    }
    if (phase === 3) {
      p3t += dt
      const sweeping = !!tell && tell.kind === 'sweep' && tell.t < tell.dur
      if (p3t > 2 && !sweeping) p3move += dt
      const u = Math.min(1, p3move / 24)
      for (const beam of beams) {
        const end = beam.held ? 11 : 9
        beam.len = N.beam + (end - N.beam) * u
        beam.on = 1
      }
      if (!enrage) {
        if (p3t < 2) {
          tideR = 23
          ghost = 23 + (12 - 23) * (2 / 24)
        } else {
          ghost = 0
          tideR = 23 + (12 - 23) * u
        }
        tideOn = true
      }
      if (!tell && p3t >= nextSweep && arm(1.2)) {
        let safeAng = beams[0]?.ang ?? 0
        let best = -1
        camera.getWorldDirection(fwd)
        const toX = camera.position.x - bossX
        const toZ = camera.position.z - bossZ
        for (const beam of beams) {
          if (beam.on < 0.5) continue
          const dot = Math.cos(beam.ang) * toX + Math.sin(beam.ang) * toZ
          if (dot > best) {
            best = dot
            safeAng = beam.ang
          }
        }
        startTell({ kind: 'sweep', t: 0, dur: 1.2, ang: safeAng, x: bossX, z: bossZ, r: 7, beam: -1, hit: false })
        nextSweep = p3t + 7.5
      }
      hooks.cull(0)
    }
    if (fightT >= N.clock && !enrage) {
      enrage = true
      enrageT = 0
      enrageFrom = tideOn ? tideR : 23
      tideOn = true
    }
    if (enrage) {
      enrageT += dt
      const k = Math.min(1, enrageT / 20)
      tideR = enrageFrom * (1 - k)
      ghost = 0
      const dps = N.tide + (N.enrage - N.tide) * k
      if (dist > tideR) hooks.tide(dps * dt)
    } else if (tideOn && p3t >= 2 && dist > tideR) {
      hooks.tide(N.tide * dt)
    }
    if (tideOn && !rumbleOn) {
      rumbleOn = true
      hooks.sfx('rumble')
    }
    stepTell(dt, px, pz)
    const scarWas = scarT
    if (scarT > 0) scarT = Math.max(0, scarT - dt)
    if (scarWas > 0 && scarT <= 0 && reopen) {
      const slot = beams[reopen.beam]
      if (slot && slot.held === 0) {
        slot.ang = reopen.ang
        slot.on = 1
        slot.len = N.beam
      }
      shutClose = 0
      reopen = null
    }
    if (tell?.kind === 'sweep') uSafe.set(tell.ang, (20 * Math.PI) / 180, 7, 1)
    else uSafe.w = 0
    if (tell?.kind === 'lash') {
      uMark0.set(bossX, bossZ, 4, 2)
      uMark1.set(tell.ang, (120 * Math.PI) / 180 / 2, 0, 0)
    } else if (tell?.kind === 'bell' || tell?.kind === 'chains') uMark0.set(tell.x, tell.z, tell.r, 0.9)
    else if (scarT <= 0) uMark0.w = 0
    if (hp <= 0) enterEnding(camera)
    else if (phase === 1 && hp <= N.hp * N.p2) enterP2()
    else if (phase === 2 && hp <= N.hp * N.p3) enterP3(camera)
  }

  function stepEnding(dt: number, camera: Camera) {
    endingT += dt
    duck = false
    if (endingT < 0.25) return
    if (endingT >= 0.5) {
      playClip('death', false)
      const act = actions.get('death')
      const local = Math.min(3.2, endingT - 0.5)
      if (act) {
        act.time = local
        mixer?.update(0)
        act.time = local
      }
      if (local >= 0.6 && !released) {
        released = true
        if (orbBone) orbBone.scale.set(0, 0, 0)
        if (emitMat) {
          emitMat.emissive.setRGB(1, 1, 1)
          emitMat.emissiveIntensity = 2.4
        }
      }
    }
    if (burst > 0) {
      burst -= dt
      for (const beam of beams) {
        beam.on = 1
        beam.len = N.beam
      }
    } else if (endingT > 1) {
      for (const beam of beams) beam.on = 0
    }
    const warm = endingT < 3.2 ? 0 : Math.min(1, (endingT - 3.2) / (10.5 - 3.2))
    uniforms.uInkAmt.value = endingT < 3.2 ? 0.85 : endingT >= 6.2 ? 0 : 0.85 * (1 - (endingT - 3.2) / 3)
    const dawn = endingT < 6.2 ? 0 : endingT >= 10.5 ? 1 : (endingT - 6.2) / (10.5 - 6.2)
    uniforms.uDawn.value = dawn
    const radius = 40 - dawn * 26
    const ang = Math.atan2(farZ, farX) + (dawn - 0.5) * 0.9
    uDawnSun.set(Math.cos(ang) * radius, Math.sin(ang) * radius)
    uDawnDir.set(-uDawnSun.x / radius, -uDawnSun.y / radius)
    uniforms.uDawnCos.value = Math.cos(BETA + dawn * (70 * Math.PI) / 180)
    if (released) {
      const lift = Math.min(1, Math.max(0, (endingT - 1.1) / 5))
      halo.position.set(bossX + farX * lift * 6, 3.2 + lift * 5.5, bossZ + farZ * lift * 6)
      const s = 2.3 + lift * 4.2
      halo.scale.set(s, s, 1)
    }
    applyTint(warm)
    if (endingT >= 12) {
      claimed = true
      stage = 'card'
    }
    void camera
  }

  function skip() {
    if (stage !== 'ending' || endingT < 2) return
    endingT = 12
    claimed = true
    stage = 'card'
  }

  function autoGrant(ids: readonly number[]) {
    if (rays.every((v) => v >= 0)) return
    for (let b = 0; b < RAYS.length; b++) {
      if ((rays[b] ?? -1) >= 0) continue
      const want = ids[b]
      const pair = RAYS[b] ?? []
      let which = 0
      for (let w = 0; w < pair.length; w++) if (pair[w]?.id === want) which = w
      grantPick(b, which)
    }
  }

  function ensureFight() {
    if (!floor.visible) showCourt()
    if (stage === 'noon' || stage === 'drain' || stage === 'draft' || stage === 'silence' || stage === 'intro') {
      stage = 'fight'
      root.hidden = true
    }
  }

  const handle: NadirHandle = {
    get ready() {
      return ready
    },
    async load() {
      if (ready) return
      await MeshoptDecoder.ready
      const loader = new GLTFLoader()
      loader.setMeshoptDecoder(MeshoptDecoder)
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/chars/matins_h3d_meshopt.glb`)
      rig = gltf.scene
      rig.name = 'matins'
      rig.frustumCulled = false
      rig.traverse((obj) => {
        const mesh = obj as Mesh
        if (mesh.isMesh) {
          mesh.frustumCulled = false
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const material of list) {
            const standard = material as MeshStandardMaterial
            if (!standard.emissive) continue
            standard.emissive.setRGB(1, 0.72, 0.28)
            standard.emissiveIntensity = 1.1
            emitMat = standard
          }
        }
        const bone = obj as Bone
        if (bone.isBone && bone.name.toLowerCase() === 'orb') orbBone = bone
      })
      mixer = new AnimationMixer(rig)
      for (const clip of gltf.animations) {
        const action = mixer.clipAction(clip)
        actions.set(clip.name, action)
      }
      for (const name of CLIP) {
        if (!actions.has(name)) throw new Error(`matins missing clip ${name}`)
      }
      scene.add(rig)
      rig.visible = false
      ready = true
    },
    begin(noon) {
      stage = noon ? 'noon' : 'draft'
      stageT = 0
      fightT = 0
      phase = 1
      hp = N.hp
      exposed = false
      beamAng = 0
      omega = (20 * Math.PI) / 180
      chimeLeg = false
      bossX = 0
      bossZ = 0
      walk = 0
      tell = null
      nextResolve = -10
      shutAcc = 0
      shutStep = 0
      miteAcc = 0
      teachLash = false
      p2t = 0
      p3t = 0
      p3move = 0
      nextSweep = 4
      crackPrompt = false
      enrage = false
      enrageT = 0
      tideR = 23
      tideOn = false
      ghost = 0
      endingT = -1
      claimed = false
      remain = N.clock
      released = false
      warmed = false
      drain = 0
      lastStamp = 0
      beamTime = 0
      exposedDmg = 0
      sealedDmg = 0
      shutterHits = 0
      p3at = -1
      result = 'live'
      peakDraws = 0
      warmPeak = 0
      scarT = 0
      shutClose = 0
      seamLive = false
      duck = false
      rumbleOn = false
      burst = 0
      clockPin = -1
      deferP3 = false
      deferSweep = false
      deferEnding = null
      swornEl.hidden = true
      seamBuzz = false
      notchT = 0
      reopen = null
      cracked.length = 0
      for (let i = 0; i < rays.length; i++) rays[i] = -1
      paintRays()
      setPair()
      for (const beam of beams) beam.on = 0
      if (orbBone) orbBone.scale.set(1, 1, 1)
      if (emitMat) {
        emitMat.emissive.setRGB(1, 0.72, 0.28)
        emitMat.emissiveIntensity = 1.1
      }
      halo.scale.set(2.3, 2.3, 1)
      if (noon) hideCourt()
      else {
        showCourt()
        root.hidden = false
      }
      playClip('idle', true)
    },
    clear() {
      hideCourt()
      stage = 'draft'
    },
    tick(dt, time, px, pz, camera) {
      if (deferP3) {
        deferP3 = false
        enterP3(camera)
      }
      if (deferSweep) {
        deferSweep = false
        const beam = beams[0]
        startTell({ kind: 'sweep', t: 0.5, dur: 1.2, ang: beam?.ang ?? 0, x: bossX, z: bossZ, r: 7, beam: 0, hit: false })
        p3t = 8
        p3move = 8
        tideOn = true
        tideR = 18
      }
      if (deferEnding) {
        const job = deferEnding
        deferEnding = null
        if (stage !== 'ending' && stage !== 'card') enterEnding(camera)
        endingT = job.t
        if (job.card) {
          claimed = true
          stage = 'card'
        }
      }
      if (stage === 'fight' || stage === 'ending' || stage === 'card') fightT = clockPin >= 0 && stage === 'fight' ? clockPin : time
      if (stage === 'noon') {
        stageT += dt
        if (stageT >= 1.5) {
          stage = 'drain'
          stageT = 0
        }
      } else if (stage === 'drain') {
        stageT += dt
        drain = Math.min(1, stageT / 0.8)
        if (stageT >= 0.8) {
          stage = 'draft'
          stageT = 0
          showCourt()
          root.hidden = false
        }
      } else if (stage === 'draft') {
        stageT += dt
      } else if (stage === 'silence') {
        stageT += dt
        if (stageT >= 1.2) {
          stage = 'intro'
          stageT = 0
          playClip('intro', false)
        }
      } else if (stage === 'intro') {
        stageT += dt
        mixer?.update(dt)
        const act = actions.get('intro')
        if (act && act.time >= 1.3 && beams[0]?.on === 0) setPair()
        if (stageT >= 2.4) {
          stage = 'fight'
          playClip('idle', true)
        }
      } else if (stage === 'fight') {
        const was = exposed
        stepFight(dt, px, pz, camera)
        exposed = litAmount(px, pz) > 0.5
        if (exposed) beamTime += dt
        if (exposed && !was) {
          hooks.sfx('exposed')
          hooks.buzz(12)
          hintSeen = true
        }
        if (rig) {
          rig.position.set(bossX, 0, bossZ)
          if (clipName !== 'death') mixer?.update(dt)
        }
      } else if (stage === 'ending') stepEnding(dt, camera)
      if (stage === 'fight' && tell?.kind === 'seam' && !seamBuzz && tell.t < 0.08) {
        const dist = Math.hypot(px - bossX, pz - bossZ)
        const lane = beams[tell.beam]
        if (dist > 0.4 && dist < (lane?.len ?? N.beam) && angDist(Math.atan2(pz - bossZ, px - bossX), tell.ang) <= BETA + 0.04) {
          seamBuzz = true
          hooks.buzz(30)
        }
      }
      if (orbBone && !released && halo.visible) {
        orbBone.updateWorldMatrix(true, false)
        orbBone.getWorldPosition(tmp)
        halo.position.copy(tmp)
      }
      syncBeams()
      const warm = stage === 'ending' || stage === 'card' ? (endingT < 3.2 ? 0 : Math.min(1, (endingT - 3.2) / 7.3)) : 0
      if (stage !== 'noon' && stage !== 'drain') applyTint(warm)
      const showBoss = stage === 'fight' || (stage === 'intro' && stageT >= 1.3)
      const left = Math.max(0, N.clock - fightT)
      skipBtn.hidden = !(stage === 'ending' && endingT >= 2 && !claimed)
      swornEl.hidden = !(endingT >= 10.5 && !claimed)
      let music: NadirView['music'] = 'night'
      if (stage === 'ending' && endingT < 6.2) music = endingT < 0.2 ? 'cut' : 'hold'
      else if ((stage === 'ending' && endingT >= 6.2) || stage === 'card') music = 'dawn'
      else if (stage === 'noon' || stage === 'drain') music = 'hold'
      return {
        stage: claimed ? 'card' : stage,
        drain,
        combat: stage === 'fight',
        freezeTime: stage !== 'fight',
        boss: showBoss && hp > 0 ? { x: bossX, z: bossZ, r: N.hitR } : null,
        lock: showBoss && hp > 0,
        exposed,
        showBoss,
        phase,
        hint: hintSeen ? '' : 'Stand in its light to open it.',
        clock: enrage ? 'The ink rises' : `Night ${clock(left)}`,
        showClock: stage === 'fight' || stage === 'ending',
        remain,
        claimed,
        inkLoss: enrage && result !== 'clear',
        warm,
        duck,
        music,
        sworn: endingT >= 10.5,
        warmUp: stage === 'draft' && !warmed,
      }
    },
    soak(x, z, radius, base, source, might, stamp) {
      if (stage !== 'fight' || hp <= 0) return false
      if (stamp !== 0 && stamp === lastStamp) return false
      const dx = bossX - x
      const dz = bossZ - z
      if (dx * dx + dz * dz > (radius + N.hitR) * (radius + N.hitR)) return false
      lastStamp = stamp
      lastSource = source
      let gate: number = exposed ? N.exposed : N.sealed
      if (phase === 1 && fightT < N.teach && !exposed) gate = 0
      const dealt = base * (1 + TUNING.passive.might * might) * gate
      if (dealt <= 0) return true
      hp = Math.max(0, hp - dealt)
      if (gate >= 1) exposedDmg += dealt
      else {
        sealedDmg += dealt
        hooks.pip(bossX, bossZ)
        hooks.sfx('armored')
      }
      if (!tell && (clipName === 'idle' || clipName === 'idle_open' || clipName === 'walk')) playClip(phase === 3 ? 'hit_open' : 'hit', false)
      return true
    },
    crack(sx, sz, ex, ez) {
      if (phase !== 2 || cracked.length >= 2 || stage !== 'fight') return false
      const index = beamIndexAt(sx, sz)
      if (index < 0) return false
      const beam = beams[index]
      if (!beam || beam.held) return false
      let ox = bossX
      let oz = bossZ
      if (orbBone) {
        orbBone.getWorldPosition(tmp)
        ox = tmp.x
        oz = tmp.z
      }
      const orb = pointSeg(ox, oz, sx, sz, ex, ez)
      const body = pointSeg(bossX, bossZ, sx, sz, ex, ez)
      if (orb > 1.5 && body > N.hitR) return false
      beam.held = 1
      beam.on = 1
      cracked.push(beam.ang)
      if (tell?.kind === 'seam' && tell.beam === index) tell = null
      if (reopen?.beam === index) reopen = null
      shutClose = 0
      seamLive = false
      hooks.sfx('crack')
      hooks.buzz([12, 30, 20])
      return true
    },
    isLit(x, z) {
      return litAmount(x, z) > 0.5
    },
    agree(renderer, camera, points, extra) {
      const prevFloor = floor.visible
      const prevMat = floor.material
      const prevRig = rig?.visible ?? false
      const prevHalo = halo.visible
      const prevExtra = extra.map((mesh) => mesh.visible)
      floor.visible = true
      floor.material = probe
      if (rig) rig.visible = false
      halo.visible = false
      for (const mesh of extra) mesh.visible = false
      camera.updateMatrixWorld()
      renderer.render(scene, camera)
      const gl = renderer.getContext() as WebGL2RenderingContext
      const size = renderer.getDrawingBufferSize(new Vector2())
      const pixel = new Uint8Array(4)
      const ndc = new Vector3()
      let tested = 0
      let agreed = 0
      for (const point of points) {
        ndc.set(point.x, 0.02, point.z)
        ndc.project(camera)
        if (ndc.z < 0 || ndc.z > 1 || Math.abs(ndc.x) > 0.98 || Math.abs(ndc.y) > 0.98) continue
        const sx = Math.min(size.x - 1, Math.max(0, Math.floor((ndc.x * 0.5 + 0.5) * size.x)))
        const sy = Math.min(size.y - 1, Math.max(0, Math.floor((ndc.y * 0.5 + 0.5) * size.y)))
        gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        const bright = (pixel[0] ?? 0) > 180
        const dark = (pixel[0] ?? 0) < 40
        if (!bright && !dark) continue
        tested++
        if (handle.isLit(point.x, point.z) === bright) agreed++
      }
      floor.material = prevMat
      floor.visible = prevFloor
      if (rig) rig.visible = prevRig
      halo.visible = prevHalo
      extra.forEach((mesh, i) => {
        mesh.visible = prevExtra[i] ?? false
      })
      return { tested, agree: agreed }
    },
    jump(next) {
      ensureFight()
      tell = null
      reopen = null
      clockPin = -1
      deferP3 = false
      deferSweep = false
      deferEnding = null
      autoGrant([CARD.spear, CARD.flare, CARD.might, CARD.swift, CARD.wide])
      phase = next
      if (next === 1) {
        hp = N.hp
        setPair()
      } else if (next === 2) {
        hp = N.hp * N.p2
        enterP2()
      } else {
        hp = N.hp * N.p3
        deferP3 = true
        deferSweep = false
        deferEnding = null
      }
    },
    pose(name) {
      ensureFight()
      if (name === 'shutter') {
        if (phase !== 2) enterP2()
        const beam = beams[0]
        if (!beam) return
        startTell({ kind: 'seam', t: 0.62, dur: 1.25, ang: beam.ang, x: bossX, z: bossZ, r: 0.8, beam: 0, hit: false })
        shutClose = 0.5
        beam.on = 0
      } else if (name === 'crack') {
        if (phase < 2) enterP2()
        const beam = beams[0]
        if (!beam) return
        beam.held = 1
        beam.on = 1
        if (!cracked.length) cracked.push(beam.ang)
        scarT = 1.2
        shutAng = beam.ang
        shutLen = beam.len
        shutClose = 1
      } else if (name === 'sweep') {
        if (phase !== 3) deferP3 = true
        deferSweep = true
        deferEnding = null
      } else if (name === 'bell') {
        if (phase !== 1) {
          phase = 1
          hp = N.hp
          setPair()
        }
        const aim = beamAng + omega
        const pr = 8
        startTell({
          kind: 'bell',
          t: 0.35,
          dur: 1,
          ang: aim,
          x: bossX + Math.cos(aim) * pr,
          z: bossZ + Math.sin(aim) * pr,
          r: 1.6,
          beam: -1,
          hit: false,
        })
      } else if (name === 'reversal') {
        if (phase !== 1) {
          phase = 1
          hp = N.hp
        }
        omega = Math.abs(omega)
        beamAng = LIMIT - Math.abs(omega) * 0.45
        chimeLeg = false
        setPair()
      } else if (name === 'enrage') {
        enrage = true
        enrageT = 8
        enrageFrom = 16
        tideOn = true
        tideR = 8
        fightT = N.clock
        clockPin = N.clock
      } else if (name === 'kill' || name === 'sunrise' || name === 'sworn' || name === 'card') {
        deferP3 = false
        deferSweep = false
        deferEnding = { t: name === 'kill' ? 0 : name === 'sunrise' ? 8 : name === 'sworn' ? 10.6 : 12, card: name === 'card' }
      }
    },
    setSliver(on) {
      sliverOn = on
      const card = lightPick(0)
      if (card && lightName && lightText) {
        lightName.textContent = card.name
        lightText.textContent = card.text
      }
    },
    autoRays(ids) {
      if (stage === 'noon' || stage === 'drain') {
        stage = 'draft'
        showCourt()
      }
      autoGrant(ids)
      if (stage === 'draft' && rays.every((v) => v >= 0)) {
        stage = 'silence'
        stageT = 0
        root.hidden = true
      }
    },
    skip,
    cardDue(advance) {
      return stage === 'ending' && !claimed && endingT >= 0 && endingT + advance >= 12
    },
    info() {
      return {
        phase,
        hp,
        max: N.hp,
        exposed,
        stage,
        clock: fightT,
        remain,
        enrage,
        cracks: cracked.length,
        tide: tideR,
        ending: endingT,
        boss: { x: bossX, z: bossZ },
        beams: beams.map((beam) => ({ ang: beam.ang, len: beam.len, on: beam.on, held: beam.held })),
        beamTime,
        exposedDmg,
        sealedDmg,
        shutterHits,
        p3at,
        result,
        draws: peakDraws,
        warmDraws: warmPeak,
        source: lastSource,
        tell: tell ? { kind: tell.kind, t: tell.t, dur: tell.dur, ang: tell.ang, x: tell.x, z: tell.z, r: tell.r } : null,
      }
    },
    warm(renderer, camera) {
      const rigWas = rig ? rig.visible : false
      const haloWas = halo.visible
      const floorWas = floor.visible
      if (rig) rig.visible = true
      halo.visible = true
      floor.visible = true
      renderer.compile(scene, camera)
      const before = renderer.info.render.calls
      renderer.render(scene, camera)
      const compiled = renderer.info.render.calls - before
      if (compiled > warmPeak) warmPeak = compiled
      renderer.info.reset()
      if (rig) rig.visible = rigWas
      halo.visible = haloWas
      floor.visible = floorWas
      warmed = true
    },
    noteDraws(n, visible) {
      if (visible) {
        if (n > peakDraws) peakDraws = n
      } else if (n > warmPeak) warmPeak = n
    },
    bossPos: () => ({ x: bossX, z: bossZ }),
    primeHint(seen) {
      hintSeen = seen
    },
    noteDeath() {
      if (result === 'clear') return
      result = enrage ? 'enrage' : 'dead'
    },
  }
  return handle
}
