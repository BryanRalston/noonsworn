import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Mesh,
  MeshToonMaterial,
  type InstancedMesh,
  NearestFilter,
  NoColorSpace,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
  type WebGLRenderer,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { LATTICE_POSTS } from '../data/maps'
import { COLOR } from '../data/palette'
import type { FloorUniforms } from '../render/floorShader'
import { toonMap } from '../render/toon'
import { PILLARS, setBeds, setOpenStrips, type AABB } from './collision'
import { createEspalier, type EspalierInfo } from './espalier'
import { createShutters } from './shutters'
import { noteBlocks, writeFloorPillars } from './temple'
import type { DamageSource } from '../data/tuning'

const TILE = 4
/** Half-width of each open walk. 3.2 m is 40% of the floor, so a sun cycle stays at least 25% Exposed. */
const OPEN = 3.2
const GAPS = [-14, 0, 14]
const SPANS: [number, number][] = blockedSpans()
const EDGES = [-8, 8]
const PERGOLA_H = 4
/** Fixed elevation. The sun orbits in XZ and does not store a pitch. tan(32°) ≈ 0.625, so the offset is about 2.5 m. */
const TAN_ELEV = Math.tan((32 * Math.PI) / 180)
/** Shoulder of the north shade. The 60° peak still covers the arena; a steeper rise keeps the cycle ≥25% Exposed. */
const SHADE_EXP = 2.4
const BLOOM_R = 1.5
const BLOOM_LIFE = 1.5
const BLOOM_N = 6

export function floorY(z: number): number {
  if (z <= -8.5) return 0.6
  if (z < -7.5) return 0.6 + (z + 8.5) * -0.3
  if (z <= 7.5) return 0.3
  if (z < 8.5) return 0.3 + (z - 7.5) * -0.3
  return 0
}

function blockedSpans(): [number, number][] {
  const cuts = [-24]
  for (let i = 0; i < GAPS.length; i++) {
    const gap = GAPS[i] ?? 0
    cuts.push(gap - OPEN, gap + OPEN)
  }
  cuts.push(24)
  const spans: [number, number][] = []
  for (let i = 0; i < cuts.length; i += 2) {
    const a = cuts[i]
    const b = cuts[i + 1]
    if (a === undefined || b === undefined || b - a <= 0.01) continue
    spans.push([a, b])
  }
  return spans
}

function inOpen(x: number): boolean {
  for (let i = 0; i < GAPS.length; i++) {
    const gap = GAPS[i] ?? 0
    if (Math.abs(x - gap) <= OPEN) return true
  }
  return false
}

function planterBeds(): AABB[] {
  const out: AABB[] = []
  for (let e = 0; e < EDGES.length; e++) {
    const zc = EDGES[e] ?? 0
    for (let s = 0; s < SPANS.length; s++) {
      const span = SPANS[s]
      if (!span) continue
      out.push({ minX: span[0], maxX: span[1], minZ: zc - 0.5, maxZ: zc + 0.5 })
    }
  }
  return out
}

function paint(geo: BufferGeometry, color: Color) {
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
}

function paintPost(geo: BufferGeometry) {
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const tmp = new Color()
  let maxY = -1e9
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i))
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y > maxY - 0.08) tmp.copy(COLOR.gold)
    else tmp.copy(COLOR.bronze).lerp(COLOR.sandstone, 0.4)
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
}

function merged(parts: BufferGeometry[]): BufferGeometry {
  const geo = mergeGeometries(parts, false)
  if (!geo) throw new Error('lattice merge failed')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  return geo
}

function paintFaces(geo: BufferGeometry, side: Color, top: Color) {
  const pos = geo.getAttribute('position')
  const norm = geo.getAttribute('normal')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const c = (norm?.getY(i) ?? 0) > 0.6 ? top : side
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
}

/** Diamond in the XZ plane. Four hard edges, one normal, so it stays a flat card at play zoom. */
function leafCard(w: number, h: number, color: Color): BufferGeometry {
  const hw = w * 0.5
  const hh = h * 0.5
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, hh,
    hw, 0, 0,
    0, 0, -hh,
    -hw, 0, 0,
  ]), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array([
    0.5, 1,
    1, 0.5,
    0.5, 0,
    0, 0.5,
  ]), 2))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  geo.computeVertexNormals()
  paint(geo, color)
  geo.userData.card = true
  return geo
}

function tag(geo: BufferGeometry, card: boolean) {
  const pos = geo.getAttribute('position')
  const n = pos.count
  const cards = new Float32Array(n)
  const leaf = new Float32Array(n * 2)
  if (card) {
    cards.fill(1)
    const uv = geo.getAttribute('uv')
    for (let i = 0; i < n; i++) {
      leaf[i * 2] = uv?.getX(i) ?? 0
      leaf[i * 2 + 1] = uv?.getY(i) ?? 0
    }
  }
  geo.setAttribute('aCard', new BufferAttribute(cards, 1))
  geo.setAttribute('aLeafUv', new BufferAttribute(leaf, 2))
}

function addBox(parts: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, color: Color, rotX = 0, top?: Color) {
  const geo = new BoxGeometry(w, h, d)
  if (top) paintFaces(geo, color, top)
  else paint(geo, color)
  if (rotX !== 0) geo.rotateX(rotX)
  geo.translate(x, y, z)
  parts.push(geo)
}

/** Fill thin dark spokes inside the coin discs. CPU cookieAt and the GPU texture share this mask. */
function closeCookie(src: Uint8Array, radius: number): Uint8Array<ArrayBuffer> {
  const n = 256
  const dil = new Uint8Array(n * n)
  for (let y = 0; y < n; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(n - 1, y + radius)
    for (let x = 0; x < n; x++) {
      let on = 0
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(n - 1, x + radius)
      for (let yy = y0; yy <= y1 && on === 0; yy++) {
        const row = yy * n
        for (let xx = x0; xx <= x1; xx++) {
          if ((src[row + xx] ?? 0) >= 128) {
            on = 255
            break
          }
        }
      }
      dil[y * n + x] = on
    }
  }
  const out = new Uint8Array(n * n)
  for (let y = 0; y < n; y++) {
    const y0 = y - radius
    const y1 = y + radius
    for (let x = 0; x < n; x++) {
      const x0 = x - radius
      if (y0 < 0 || y1 >= n || x0 < 0 || x + radius >= n) continue
      let on = 255
      for (let yy = y0; yy <= y1 && on === 255; yy++) {
        const row = yy * n
        for (let xx = x0; xx <= x + radius; xx++) {
          if ((dil[row + xx] ?? 0) < 128) {
            on = 0
            break
          }
        }
      }
      out[y * n + x] = on
    }
  }
  return out
}

function trisOf(geo: BufferGeometry): number {
  if (geo.index) return geo.index.count / 3
  const pos = geo.getAttribute('position')
  return pos ? pos.count / 3 : 0
}

function latticeShader(): { vertex: string; fragment: string } {
  const openTerms = GAPS.map((gap) => `abs(x - (${gap.toFixed(1)})) <= ${OPEN.toFixed(1)}`).join(' || ')
  const vertex = /* glsl */ `
attribute vec3 color;
varying vec3 vWorld;
varying vec3 vColor;
varying float vUp;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vColor = color;
  vUp = normal.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`
  const fragment = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec3 vColor;
varying float vUp;
uniform vec2 uSun;
uniform vec2 uDir;
uniform float uCosBeta;
uniform vec3 uPillars[12];
uniform float uPillarN;
uniform vec3 uFogColor;
uniform float uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform sampler2D uCookie;
uniform vec2 uOff;
uniform float uShadeZ;
uniform float uProbe;
uniform float uTime;
uniform float uInset;
uniform float uVisExtra;
uniform float uCoinFlash;
uniform vec4 uZone[4];
uniform float uBloomN;
uniform vec3 uBloom[${BLOOM_N}];

bool inOpen(float x) {
  return ${openTerms};
}

float clearance(vec2 s, vec2 p, vec2 c, float r) {
  vec2 d = p - s;
  float len2 = dot(d, d);
  if (len2 < 1e-6) return length(s - c) - r;
  float t = clamp(dot(c - s, d) / len2, 0.0, 1.0);
  return length(s + d * t - c) - r;
}

float cookieAt(vec2 roof) {
  float u = fract(roof.x / ${TILE.toFixed(1)});
  float v = fract(roof.y / ${TILE.toFixed(1)});
  float ix = min(255.0, floor(u * 256.0));
  float iz = min(255.0, floor(v * 256.0));
  return texture(uCookie, (vec2(ix, iz) + 0.5) / 256.0).r;
}

float cookieVis(vec2 roof) {
  return texture(uCookie, fract(roof / ${TILE.toFixed(1)})).r;
}

float cookieHard(vec2 roof) {
  float c = cookieAt(roof);
  if (abs(uInset) < 1e-4) return c;
  if (uInset > 0.0) {
    c = min(c, cookieAt(roof + vec2(uInset, 0.0)));
    c = min(c, cookieAt(roof - vec2(uInset, 0.0)));
    c = min(c, cookieAt(roof + vec2(0.0, uInset)));
    c = min(c, cookieAt(roof - vec2(0.0, uInset)));
    return c;
  }
  float d = -uInset;
  c = max(c, cookieAt(roof + vec2(d, 0.0)));
  c = max(c, cookieAt(roof - vec2(d, 0.0)));
  c = max(c, cookieAt(roof + vec2(0.0, d)));
  c = max(c, cookieAt(roof - vec2(0.0, d)));
  return c;
}

float cookieEdge(vec2 roof) {
  float c = cookieVis(roof);
  if (c < 0.55) return 0.0;
  float o = 0.016;
  float w = min(min(cookieVis(roof + vec2(o, 0.0)), cookieVis(roof - vec2(o, 0.0))),
                min(cookieVis(roof + vec2(0.0, o)), cookieVis(roof - vec2(0.0, o))));
  return w < 0.45 ? 1.0 : 0.0;
}

float cookieSoft(vec2 roof) {
  float c = cookieVis(roof);
  float vis = uInset + uVisExtra;
  if (abs(vis) < 1e-4) return c;
  if (vis > 0.0) {
    c = min(c, cookieVis(roof + vec2(vis, 0.0)));
    c = min(c, cookieVis(roof - vec2(vis, 0.0)));
    c = min(c, cookieVis(roof + vec2(0.0, vis)));
    c = min(c, cookieVis(roof - vec2(0.0, vis)));
    return c;
  }
  float d = -vis;
  c = max(c, cookieVis(roof + vec2(d, 0.0)));
  c = max(c, cookieVis(roof - vec2(d, 0.0)));
  c = max(c, cookieVis(roof + vec2(0.0, d)));
  c = max(c, cookieVis(roof - vec2(0.0, d)));
  return c;
}

bool zoneLit(vec2 p) {
  for (int i = 0; i < 4; i++) {
    if (uZone[i].w < 0.5) continue;
    if (abs(p.x - uZone[i].x) <= uZone[i].z && abs(p.y - uZone[i].y) <= uZone[i].z) return true;
  }
  return false;
}

float groutAt(vec2 p) {
  float fx = min(fract(p.x * 0.5), 1.0 - fract(p.x * 0.5));
  float fz = min(fract(p.y * 0.5), 1.0 - fract(p.y * 0.5));
  return 1.0 - smoothstep(0.015, 0.045, min(fx, fz));
}

float tileJitter(vec2 p) {
  vec2 cell = floor(p * 0.5);
  float n = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  return mix(0.94, 1.06, n);
}

bool bloomHard(vec2 p) {
  for (int i = 0; i < ${BLOOM_N}; i++) {
    if (uBloom[i].z > 0.5 && distance(p, uBloom[i].xy) <= ${BLOOM_R.toFixed(1)}) return true;
  }
  return false;
}

bool hardLit(vec2 p) {
  if (zoneLit(p)) return true;
  if (bloomHard(p)) return true;
  vec2 toP = p - uSun;
  float dist = length(toP);
  if (dist < 1e-4) return false;
  if (dot(toP / dist, uDir) < uCosBeta) return false;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= uPillarN) break;
    if (clearance(uSun, p, uPillars[i].xy, uPillars[i].z) <= 0.0) return false;
  }
  if (p.y < uShadeZ) return false;
  if (inOpen(p.x)) return true;
  return cookieHard(p - uOff) > 0.5;
}

void main() {
  vec2 p = vWorld.xz;
  vec3 col = vec3(0.0);
  if (uProbe > 0.5) {
    col = vec3(hardLit(p) ? 1.0 : 0.0);
  } else {
    float tier = smoothstep(uShadeZ - 0.05, uShadeZ + 0.45, p.y);
    vec3 stone = vColor * mix(0.84, 1.08, clamp(vUp, 0.0, 1.0));
    stone *= tileJitter(p);
    stone = mix(stone, stone * 0.42, groutAt(p));
    if (tier < 0.02 && uBloomN < 0.5 && !zoneLit(p)) {
      col = stone * vec3(0.74, 0.66, 0.70);
    } else {
      vec2 toP = p - uSun;
      float dist2 = dot(toP, toP);
      float inv = inversesqrt(max(dist2, 1e-6));
      vec2 nrm = dist2 > 1e-8 ? toP * inv : uDir;
      float dist = dist2 * inv;
      float cone = smoothstep(0.0, 0.35, (dot(nrm, uDir) - uCosBeta) * max(dist, 0.001));
      float shadow = 1.0;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= uPillarN) break;
        vec2 sunToC = uPillars[i].xy - uSun;
        float t = dot(sunToC, nrm);
        if (t > 0.0 && t < dist) {
          vec2 diff = uSun + nrm * t - uPillars[i].xy;
          float r = uPillars[i].z + 0.2;
          shadow = min(shadow, smoothstep(r * r, (r + 0.45) * (r + 0.45), dot(diff, diff)));
        }
      }
      float gap = 1.0;
      float rim = 0.0;
      if (vUp > 0.5 && abs(p.x) < 24.0 && abs(p.y) < 24.0 && !inOpen(p.x)) {
        gap = smoothstep(0.47, 0.53, cookieSoft(p - uOff));
        gap *= 0.92 + 0.08 * sin(uTime * 2.0 + p.x * 0.15);
        rim = cookieEdge(p - uOff);
      }
      vec3 slat = stone * vec3(0.18, 0.14, 0.20);
      vec3 sunlit = stone * 1.24;
      float light = clamp(cone, 0.0, 1.0) * clamp(shadow, 0.0, 1.0) * tier;
      if (zoneLit(p)) {
        light = 1.0;
        gap = 1.0;
      }
      col = mix(slat, sunlit, light * gap);
      if (rim > 0.5) col = mix(col, vec3(0.95, 0.71, 0.20), 0.8);
      col += vec3(1.0, 0.86, 0.32) * uCoinFlash * gap;
      float bloom = 0.0;
      if (uBloomN > 0.5) {
        for (int i = 0; i < ${BLOOM_N}; i++) {
          if (float(i) >= uBloomN) break;
          float bd = distance(p, uBloom[i].xy);
          bloom = max(bloom, 1.0 - smoothstep(${(BLOOM_R - 0.12).toFixed(2)}, ${BLOOM_R.toFixed(1)}, bd));
        }
      }
      col = mix(col, vec3(1.0, 0.86, 0.32), bloom * 0.72);
    }
    float fogF = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)) * uFog;
    col = mix(col, uFogColor, fogF);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
  return { vertex, fragment }
}

interface Bloom {
  x: number
  z: number
  life: number
}

export interface LatticeHandle {
  ready: boolean
  load: () => Promise<void>
  apply: () => void
  clear: () => void
  warm: (renderer: WebGLRenderer, camera: Camera) => void
  veil: () => void
  tick: (
    dt: number,
    sun: { z: number; dirX: number; dirZ: number; time: number },
    time: number,
    px: number,
    pz: number,
    beam: (x: number, z: number) => boolean,
  ) => void
  cleared: () => boolean
  bossing: () => boolean
  hitBoss: (x: number, z: number, radius: number, base: number, source: DamageSource, might: number, stamp: number) => boolean
  bossInfo: () => EspalierInfo | null
  plateInfo: () => { x: number; z: number; mode: string; charge: number; openFor: number }[]
  floorY: (z: number) => number
  isLit: (base: (x: number, z: number) => boolean, x: number, z: number) => boolean
  shadeZ: () => number
  blooming: () => boolean
  terraceMask: () => number
  bloom: (x: number, z: number, lit: boolean) => boolean
  sample: (base: (x: number, z: number) => boolean, step: number) => number
  agree: (
    renderer: WebGLRenderer,
    camera: Camera,
    points: ReadonlyArray<{ x: number; z: number }>,
    hide: Object3D[],
    base: (x: number, z: number) => boolean,
  ) => { tested: number; agree: number }
  tris: () => { terrain: number; pergola: number; dressing: number; foliage: number }
}

export function createLattice(opts: {
  scene: import('three').Scene
  uniforms: FloorUniforms
  enemyMat: ShaderMaterial
  mite: InstancedMesh
  hound: InstancedMesh
  darter: InstancedMesh
  hide: Object3D[]
  restore: Object3D[]
  spawn: (kind: 0 | 1 | 2, x: number, z: number) => void
  cull: (n: number) => void
  hurt: (amount: number) => void
  mark: (x: number, z: number, radius: number, seconds: number) => void
  expose: (x: number, z: number, half: number, freeze: number) => void
  track: (at: { x: number; z: number; r: number } | null) => void
  sfx: {
    shutterOpen: () => void
    shutterClose: () => void
    rake: () => void
    slam: () => void
    wake: () => void
  }
}): LatticeHandle {
  const parts: BufferGeometry[] = []
  const backdropParts: BufferGeometry[] = []
  const upperTint = COLOR.sandstone.clone().lerp(COLOR.gold, 0.62)
  const midTint = COLOR.bronze.clone().lerp(COLOR.gold, 0.22)
  const lowerTint = COLOR.sandstoneDeep.clone().lerp(COLOR.shade, 0.22)
  addBox(parts, 48, 0.6, 15.96, 0, 0.3, -16.02, upperTint)
  addBox(parts, 48, 0.3, 16, 0, 0.15, 0, midTint)
  addBox(parts, 48, 0.16, 16, 0, -0.08, 16, lowerTint)
  const stair = Math.atan(0.3)
  for (let i = 0; i < GAPS.length; i++) {
    const x = GAPS[i] ?? 0
    addBox(parts, OPEN * 2, 0.08, 1.05, x, 0.45, -8, upperTint, stair)
    addBox(parts, OPEN * 2, 0.08, 1.05, x, 0.15, 8, midTint, stair)
  }
  for (let s = 0; s < SPANS.length; s++) {
    const span = SPANS[s]
    if (!span) continue
    const w = span[1] - span[0]
    const mid = (span[0] + span[1]) / 2
    addBox(parts, w * 0.96, 0.42, 0.82, mid, 0.81, -8, COLOR.sandstoneDeep)
    addBox(parts, w * 0.96 + 0.14, 0.1, 0.98, mid, 1.07, -8, COLOR.bronze)
    addBox(parts, w * 0.96, 0.42, 0.82, mid, 0.51, 8, COLOR.sandstoneDeep)
    addBox(parts, w * 0.96 + 0.14, 0.1, 0.98, mid, 0.77, 8, COLOR.bronze)
    addBox(parts, w, 0.14, 0.16, mid, 0.68, -8.46, COLOR.gold)
    addBox(parts, w, 0.12, 0.14, mid, 0.38, -7.52, midTint)
    addBox(parts, w, 0.1, 0.14, mid, 0.12, 8.46, COLOR.shade)
  }
  addBox(backdropParts, 64, 10, 2.2, 0, 5, -28.2, COLOR.sandstoneDeep)
  addBox(backdropParts, 60, 0.5, 3.05, 0, 0.32, -25.6, COLOR.sandstone)
  const nicheStone = COLOR.sandstoneDeep.clone().lerp(COLOR.bronze, 0.35)
  for (let i = -3; i <= 3; i++) {
    const x = i * 6
    addBox(backdropParts, 0.28, 2.15, 0.28, x - 0.72, 2.85, -26.72, nicheStone)
    addBox(backdropParts, 0.28, 2.15, 0.28, x + 0.72, 2.85, -26.72, nicheStone)
    addBox(backdropParts, 1.72, 0.26, 0.32, x, 4.05, -26.7, nicheStone)
  }
  const terrainGeo = merged(parts)
  const backdropGeo = merged(backdropParts)
  const beams: BufferGeometry[] = []
  for (let s = 0; s < SPANS.length; s++) {
    const span = SPANS[s]
    if (!span) continue
    const [x0, x1] = span
    const beam = (x: number, z: number, lenX: number, lenZ: number, color: Color) => {
      const geo = new BoxGeometry(lenX, 0.14, lenZ)
      paint(geo, color)
      geo.translate(x, PERGOLA_H, z)
      beams.push(geo)
    }
    beam(x0, 0, 0.16, 48, COLOR.bronze)
    beam(x1, 0, 0.16, 48, COLOR.bronze)
    const mid = (x0 + x1) / 2
    beam(mid, 0, 0.12, 48, COLOR.gold)
    for (let z = -24; z <= 24; z += 4) beam(mid, z, x1 - x0, 0.14, COLOR.gold)
  }
  for (let i = 0; i < LATTICE_POSTS.length; i++) {
    const post = LATTICE_POSTS[i]
    if (!post) continue
    const upper = post.z < 0
    const height = upper ? PERGOLA_H - 0.6 : PERGOLA_H
    const geo = new CylinderGeometry(post.r, post.r, height, 6)
    paintPost(geo)
    geo.translate(post.x, (upper ? 0.6 : 0) + height / 2, post.z)
    beams.push(geo)
  }
  const pergolaGeo = merged(beams)
  const potGeo = new CylinderGeometry(0.42, 0.3, 0.48, 6)
  const potSpots: { x: number; y: number; z: number }[] = []
  const vineGeos: BufferGeometry[] = []
  const potGeos: BufferGeometry[] = []
  for (let e = 0; e < EDGES.length; e++) {
    const zc = EDGES[e] ?? 0
    const y = (zc < 0 ? 0.3 : 0) + 0.24
    for (let s = 0; s < SPANS.length; s++) {
      const span = SPANS[s]
      if (!span) continue
      potSpots.push({ x: span[0] + (span[1] - span[0]) * 0.35, y, z: zc })
      potSpots.push({ x: span[0] + (span[1] - span[0]) * 0.65, y, z: zc })
    }
  }
  const dummy = new Object3D()
  // Upright diamonds around the stem. Spread past the card width so they stay separate leaves.
  const sprigs = [
    { dx: 0.55, dy: 0.35, dz: 0.02, tilt: 1.15, yaw: 0.3, s: 0.85 },
    { dx: -0.52, dy: 0.55, dz: 0.1, tilt: 1.05, yaw: 2.1, s: 0.78 },
    { dx: 0.06, dy: 0.15, dz: 0.55, tilt: 1.2, yaw: 1.15, s: 0.8 },
    { dx: 0.08, dy: 0.72, dz: -0.5, tilt: 1.1, yaw: 3.5, s: 0.74 },
    { dx: -0.12, dy: 0.02, dz: -0.52, tilt: 1.18, yaw: 4.7, s: 0.82 },
  ]
  for (let i = 0; i < LATTICE_POSTS.length; i++) {
    const post = LATTICE_POSTS[i]
    if (!post) continue
    const stem = new BoxGeometry(0.06, 1.2, 0.06)
    paint(stem, COLOR.foliage)
    stem.translate(post.x, 2.95, post.z)
    vineGeos.push(stem)
    for (let k = 0; k < sprigs.length; k++) {
      const off = sprigs[k]
      if (!off) continue
      const card = leafCard(0.48, 0.64, k % 2 === 0 ? COLOR.foliage : COLOR.foliageRim)
      dummy.position.set(post.x + off.dx, 3.35 + off.dy, post.z + off.dz)
      dummy.rotation.set(off.tilt, off.yaw + i * 0.35, 0)
      dummy.scale.set(off.s, 1, off.s)
      dummy.updateMatrix()
      card.applyMatrix4(dummy.matrix)
      vineGeos.push(card)
    }
  }
  for (let i = 0; i < potSpots.length; i++) {
    const spot = potSpots[i]
    if (!spot) continue
    const geo = potGeo.clone()
    paint(geo, i % 2 === 0 ? COLOR.sandstoneDeep : COLOR.bronze)
    geo.translate(spot.x, spot.y, spot.z)
    potGeos.push(geo)
  }
  potGeo.dispose()
  // One diamond per station. Five full-size cards on a 7 m span overlap into one lump at the play camera.
  const leafSpots: { x: number; y: number; z: number; yaw: number; tilt: number }[] = []
  const stations = [0.16, 0.32, 0.48, 0.64, 0.8]
  for (let e = 0; e < EDGES.length; e++) {
    const zc = EDGES[e] ?? 0
    const lip = zc < 0 ? 1.12 : 0.82
    for (let s = 0; s < SPANS.length; s++) {
      const span = SPANS[s]
      if (!span) continue
      const width = span[1] - span[0]
      for (let t = 0; t < stations.length; t++) {
        const cx = span[0] + width * (stations[t] ?? 0)
        leafSpots.push({
          x: cx,
          y: lip + 0.06,
          z: zc + (t % 2 === 0 ? 0.16 : -0.12),
          yaw: 0.35 + t * 0.5 + e * 0.2,
          tilt: t % 2 === 0 ? 0.1 : -0.08,
        })
      }
    }
  }
  const leafGeos: BufferGeometry[] = []
  for (let i = 0; i < leafSpots.length; i++) {
    const spot = leafSpots[i]
    if (!spot) continue
    const geo = leafCard(0.92, 1.12, i % 2 === 0 ? COLOR.foliage : COLOR.foliageRim)
    dummy.position.set(spot.x, spot.y, spot.z)
    dummy.rotation.set(spot.tilt, spot.yaw, 0)
    dummy.scale.set(1, 1, 0.92)
    dummy.updateMatrix()
    geo.applyMatrix4(dummy.matrix)
    leafGeos.push(geo)
  }
  const foliageTris = leafGeos.reduce((sum, geo) => sum + trisOf(geo), 0)
  const basin = new CylinderGeometry(0.9, 0.72, 0.28, 8)
  paint(basin, COLOR.sandstone)
  basin.translate(0, 0.44, 0)
  const water = new CircleGeometry(0.62, 8)
  paint(water, COLOR.shade)
  water.rotateX(-Math.PI / 2)
  water.translate(0, 0.59, 0)
  const spire = new CylinderGeometry(0.08, 0.14, 0.55, 5)
  paint(spire, COLOR.gold)
  spire.translate(0, 0.86, 0)
  const fountainGeo = merged([basin, water, spire])
  const probeGeo = new PlaneGeometry(46, 46)
  probeGeo.rotateX(-Math.PI / 2)
  paint(probeGeo, COLOR.linen)
  const rgba = new Uint8Array(256 * 256 * 4)
  const cookieTex = new DataTexture(rgba, 256, 256)
  cookieTex.colorSpace = NoColorSpace
  cookieTex.magFilter = NearestFilter
  cookieTex.minFilter = NearestFilter
  cookieTex.generateMipmaps = false
  cookieTex.flipY = false
  cookieTex.needsUpdate = true
  const blooms: Bloom[] = []
  for (let i = 0; i < BLOOM_N; i++) blooms.push({ x: 0, z: 0, life: 0 })
  const bloomSlots = blooms.map(() => new Vector3())
  const src = opts.uniforms
  const uOff = { value: new Vector2() }
  const uShadeZ = { value: -24 }
  const uProbe = { value: 0 }
  const uTime = { value: 0 }
  const uInset = { value: 0 }
  const uVisExtra = { value: 0 }
  const uCoinFlash = { value: 0 }
  const uZone = { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] }
  const uBloomN = { value: 0 }
  const glsl = latticeShader()
  const material = new ShaderMaterial({
    uniforms: {
      uSun: src.uSun,
      uDir: src.uDir,
      uCosBeta: src.uCosBeta,
      uPillars: src.uPillars,
      uPillarN: src.uPillarN,
      uFogColor: src.uFogColor,
      uFog: src.uFog,
      uFogNear: src.uFogNear,
      uFogFar: src.uFogFar,
      uCookie: { value: cookieTex },
      uOff,
      uShadeZ,
      uProbe,
      uTime,
      uInset,
      uVisExtra,
      uCoinFlash,
      uZone,
      uBloomN,
      uBloom: { value: bloomSlots },
    },
    vertexShader: glsl.vertex,
    fragmentShader: glsl.fragment,
  })
  // Full shade with no blooms matches this flat color. A separate program keeps the
  // coin shader's register pressure off the phone-bench frames, where the court is dark.
  const shadeMat = new ShaderMaterial({
    uniforms: {
      uFogColor: src.uFogColor,
      uFog: src.uFog,
      uFogNear: src.uFogNear,
      uFogFar: src.uFogFar,
      uBloomN,
      uBloom: { value: bloomSlots },
    },
    vertexShader: glsl.vertex,
    fragmentShader: /* glsl */ `
precision mediump float;
varying vec3 vWorld;
varying vec3 vColor;
varying float vUp;
uniform vec3 uFogColor;
uniform float uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uBloomN;
uniform vec3 uBloom[${BLOOM_N}];
float groutAt(vec2 p) {
  float fx = min(fract(p.x * 0.5), 1.0 - fract(p.x * 0.5));
  float fz = min(fract(p.y * 0.5), 1.0 - fract(p.y * 0.5));
  return 1.0 - smoothstep(0.015, 0.045, min(fx, fz));
}
float tileJitter(vec2 p) {
  vec2 cell = floor(p * 0.5);
  float n = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  return mix(0.94, 1.06, n);
}
void main() {
  vec3 stone = vColor * mix(0.84, 1.08, clamp(vUp, 0.0, 1.0));
  stone *= tileJitter(vWorld.xz);
  stone = mix(stone, stone * 0.42, groutAt(vWorld.xz));
  vec3 col = stone * vec3(0.74, 0.66, 0.70);
  float bloom = 0.0;
  if (uBloomN > 0.5) {
    for (int i = 0; i < ${BLOOM_N}; i++) {
      if (float(i) >= uBloomN) break;
      float bd = distance(vWorld.xz, uBloom[i].xy);
      bloom = max(bloom, 1.0 - smoothstep(${(BLOOM_R - 0.12).toFixed(2)}, ${BLOOM_R.toFixed(1)}, bd));
    }
  }
  col = mix(col, vec3(1.0, 0.86, 0.32), bloom * 0.72);
  float fogF = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)) * uFog;
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,
  })
  const terrain = new Mesh(terrainGeo, material)
  const pergolaTris = trisOf(pergolaGeo)
  const backdropTris = trisOf(backdropGeo)
  const vineTris = vineGeos.reduce((sum, geo) => sum + trisOf(geo), 0)
  const potTris = potGeos.reduce((sum, geo) => sum + trisOf(geo), 0)
  const fountainTris = trisOf(fountainGeo)
  const unroll = (geo: BufferGeometry) => {
    if (!geo.index) return geo
    const next = geo.toNonIndexed()
    geo.dispose()
    return next
  }
  const dressingMat = new MeshToonMaterial({
    color: 0xffffff,
    gradientMap: toonMap(),
    vertexColors: true,
    side: DoubleSide,
  })
  dressingMat.customProgramCacheKey = () => 'lattice-cards'
  dressingMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aCard;
attribute vec2 aLeafUv;
varying float vCard;
varying vec2 vLeafUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vCard = aCard;
vLeafUv = aLeafUv;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vCard;
varying vec2 vLeafUv;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vCard > 0.5) {
  vec2 q = vLeafUv * 2.0 - 1.0;
  if (abs(q.x) + abs(q.y) > 0.9) discard;
  if (!gl_FrontFacing) diffuseColor.rgb *= vec3(0.82, 0.90, 0.74);
} else if (!gl_FrontFacing) {
  diffuseColor.rgb *= vec3(0.40, 0.46, 0.34);
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `if (vCard > 0.5) outgoingLight = diffuseColor.rgb;
#include <opaque_fragment>`,
      )
  }
  const dressParts = [backdropGeo, pergolaGeo, fountainGeo, ...vineGeos, ...potGeos, ...leafGeos]
  for (let i = 0; i < dressParts.length; i++) {
    const geo = dressParts[i]
    if (geo) tag(geo, geo.userData.card === true)
  }
  const dressing = new Mesh(
    merged(dressParts.map(unroll)),
    dressingMat,
  )
  const probe = new Mesh(probeGeo, material)
  probe.position.y = 2
  probe.visible = false
  probe.frustumCulled = false
  for (const mesh of [terrain, dressing]) {
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.visible = false
  }
  opts.scene.add(terrain, dressing, probe)
  const lifted = opts.enemyMat.clone()
  const sharedTime = opts.enemyMat.uniforms.uTime
  if (sharedTime) lifted.uniforms.uTime = sharedTime
  const terrace = `float terraceOf(float z) {
    float north = clamp((-7.5 - z), 0.0, 1.0);
    float south = clamp((z - 7.5), 0.0, 1.0);
    return 0.3 + north * 0.3 - south * 0.3;
  }
  void main() {`
  lifted.vertexShader = opts.enemyMat.vertexShader.replace('void main() {', terrace).replace(
    'vec4(x2 + iPose.x, y1, z2 + iPose.y, 1.0)',
    'vec4(x2 + iPose.x, y1 + terraceOf(iPose.y), z2 + iPose.y, 1.0)',
  )
  lifted.needsUpdate = true
  let bytes = new Uint8Array(256 * 256)
  let ready = false
  let offX = 0
  let offZ = 0
  let shade = -24
  let veiled = false
  let heldTime = Number.NaN
  let heldZ = Number.NaN
  let heldDirX = Number.NaN
  let heldDirZ = Number.NaN
  let bloomShown = false
  const dressingTris = vineTris + potTris + fountainTris + foliageTris

  function fract(v: number): number {
    return v - Math.floor(v)
  }

  function cookieAt(x: number, z: number): number {
    const u = fract((x - offX) / TILE)
    const v = fract((z - offZ) / TILE)
    const ix = Math.min(255, (u * 256) | 0)
    const iz = Math.min(255, (v * 256) | 0)
    return (bytes[iz * 256 + ix] ?? 0) / 255
  }

  function cookieGate(x: number, z: number): number {
    const inset = uInset.value
    let c = cookieAt(x, z)
    if (Math.abs(inset) < 1e-4) return c
    if (inset > 0) {
      c = Math.min(c, cookieAt(x + inset, z), cookieAt(x - inset, z), cookieAt(x, z + inset), cookieAt(x, z - inset))
      return c
    }
    const d = -inset
    return Math.max(c, cookieAt(x + d, z), cookieAt(x - d, z), cookieAt(x, z + d), cookieAt(x, z - d))
  }

  function zoneAt(x: number, z: number): boolean {
    const slots = uZone.value
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      if (!slot || slot.w < 0.5) continue
      if (Math.abs(x - slot.x) <= slot.z && Math.abs(z - slot.y) <= slot.z) return true
    }
    return false
  }

  function bloomHit(x: number, z: number): boolean {
    const r2 = BLOOM_R * BLOOM_R
    for (let i = 0; i < blooms.length; i++) {
      const b = blooms[i]
      if (!b || b.life <= 0) continue
      const dx = x - b.x
      const dz = z - b.z
      if (dx * dx + dz * dz <= r2) return true
    }
    return false
  }

  function uploadBlooms() {
    let n = 0
    for (let i = 0; i < BLOOM_N; i++) {
      const b = blooms[i]
      if (!b || b.life <= 0) continue
      const slot = bloomSlots[n]
      if (!slot) continue
      slot.set(b.x, b.z, 1)
      n++
    }
    for (let i = n; i < BLOOM_N; i++) bloomSlots[i]?.set(0, 0, 0)
    uBloomN.value = n
  }

  function sync(sun: { z: number; dirX: number; dirZ: number; time: number }) {
    const phase = sun.time * 0.2 * Math.PI * 2
    const mag = PERGOLA_H * TAN_ELEV
    offX = sun.dirX * mag + Math.sin(phase) * 0.15
    offZ = sun.dirZ * mag + Math.sin(phase + Math.PI / 2) * 0.15
    const north = Math.max(0, -sun.z / 40)
    const denom = Math.pow(Math.cos((30 * Math.PI) / 180), SHADE_EXP)
    const shaped = north <= 0 ? 0 : Math.min(1, Math.pow(north, SHADE_EXP) / denom)
    shade = -24 + 48 * shaped
    uOff.value.set(offX, offZ)
    uShadeZ.value = shade
    uTime.value = sun.time
    uploadBlooms()
    const zoneOpen = zoneAt(0, 0) || uZone.value.some((slot) => (slot?.w ?? 0) > 0.5)
    const next = shade >= 23.9 && !zoneOpen && Math.abs(uInset.value) < 1e-4 ? shadeMat : material
    if (terrain.material !== next) terrain.material = next
  }

  function isLit(base: (x: number, z: number) => boolean, x: number, z: number): boolean {
    if (zoneAt(x, z)) return true
    if (bloomHit(x, z)) return true
    if (z < shade) return false
    if (!base(x, z)) return false
    if (inOpen(x)) return true
    return cookieGate(x, z) > 0.5
  }

  let beam: (x: number, z: number) => boolean = () => false
  let upperOpen = false
  const shutters = createShutters(uZone.value, {
    coin: (x, z) => !inOpen(x) && z >= shade && beam(x, z) && cookieGate(x, z) > 0.5,
    expose: (x, z, half, freeze) => opts.expose(x, z, half, freeze),
    mark: opts.mark,
    open: opts.sfx.shutterOpen,
    close: opts.sfx.shutterClose,
    boss: (open) => {
      upperOpen = open
    },
  })
  const espalier = createEspalier({
    lit: (x, z) => isLit(beam, x, z),
    hurt: opts.hurt,
    spawn: (x, z) => opts.spawn(2, x, z),
    cull: () => opts.cull(40),
    cover: (inset) => {
      if (inset > 0.05 && uInset.value <= 0.05) uCoinFlash.value = 1
      uInset.value = inset
    },
    floor: floorY,
    wake: opts.sfx.wake,
    rake: opts.sfx.rake,
    slam: opts.sfx.slam,
  })
  opts.scene.add(shutters.mesh, espalier.mesh, espalier.tele)

  const own = [terrain, dressing, probe, shutters.mesh, espalier.mesh, espalier.tele]
  const pixel = new Uint8Array(4)
  const ndc = new Vector3()
  const drawSize = new Vector2()

  return {
    get ready() {
      return ready
    },
    async load() {
      if (ready) return
      const res = await fetch(`${import.meta.env.BASE_URL}assets/maps/lattice-cookie.png`)
      if (!res.ok) throw new Error('lattice cookie missing')
      const bmp = await createImageBitmap(await res.blob())
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('lattice cookie decode failed')
      ctx.drawImage(bmp, 0, 0, 256, 256)
      bmp.close()
      const img = ctx.getImageData(0, 0, 256, 256)
      const raw = new Uint8Array(256 * 256)
      for (let i = 0; i < raw.length; i++) raw[i] = img.data[i * 4] ?? 0
      bytes = closeCookie(raw, 2)
      for (let i = 0; i < bytes.length; i++) {
        const v = bytes[i] ?? 0
        rgba[i * 4] = v
        rgba[i * 4 + 1] = v
        rgba[i * 4 + 2] = v
        rgba[i * 4 + 3] = 255
      }
      cookieTex.needsUpdate = true
      ready = true
    },
    apply() {
      PILLARS.length = 0
      for (let i = 0; i < LATTICE_POSTS.length; i++) {
        const post = LATTICE_POSTS[i]
        if (post) PILLARS.push({ x: post.x, z: post.z, r: post.r, wing: -1 })
      }
      setBeds(planterBeds())
      setOpenStrips(GAPS, OPEN)
      noteBlocks()
      writeFloorPillars(src.uPillars.value, src.uPillarN)
      for (let i = 0; i < opts.hide.length; i++) {
        const mesh = opts.hide[i]
        if (mesh) mesh.visible = false
      }
      terrain.visible = true
      dressing.visible = true
      probe.visible = false
      opts.darter.material = lifted
      shutters.reset()
      espalier.reset()
      opts.track(null)
      veiled = true
      heldTime = Number.NaN
    },
    clear() {
      for (let i = 0; i < own.length; i++) {
        const mesh = own[i]
        if (mesh) mesh.visible = false
      }
      for (let i = 0; i < opts.restore.length; i++) {
        const mesh = opts.restore[i]
        if (mesh) mesh.visible = true
      }
      opts.darter.material = opts.enemyMat
      shutters.reset()
      espalier.reset()
      opts.track(null)
      uInset.value = 0
      uVisExtra.value = 0
      uCoinFlash.value = 0
      setBeds([])
      setOpenStrips([], 0)
      noteBlocks()
      veiled = false
      heldTime = Number.NaN
    },
    veil() {
      if (veiled) return
      for (let i = 0; i < opts.hide.length; i++) {
        const mesh = opts.hide[i]
        if (mesh) mesh.visible = false
      }
      probe.visible = false
      veiled = true
    },
    tick(dt, sun, time, px, pz, beamFn) {
      const visTarget = uInset.value > 0.05 ? 0.55 : 0
      uVisExtra.value += (visTarget - uVisExtra.value) * Math.min(1, dt * 1.6)
      uCoinFlash.value = Math.max(0, uCoinFlash.value - dt * 2.2)
      let live = false
      for (let i = 0; i < blooms.length; i++) {
        const b = blooms[i]
        if (!b || b.life <= 0) continue
        b.life -= dt
        if (b.life > 0) live = true
      }
      const same = sun.time === heldTime && sun.z === heldZ && sun.dirX === heldDirX && sun.dirZ === heldDirZ
      beam = beamFn
      if (!same || live || bloomShown) {
        heldTime = sun.time
        heldZ = sun.z
        heldDirX = sun.dirX
        heldDirZ = sun.dirZ
        sync(sun)
        bloomShown = live
      }
      shutters.update(dt, px, pz)
      espalier.update(dt, time, px, pz, upperOpen)
      const boss = espalier.info()
      opts.track(espalier.alive() ? { x: boss.x, z: boss.z, r: boss.r } : null)
    },
    cleared: () => espalier.info().dead,
    bossing: () => espalier.awake() && !espalier.info().dead,
    hitBoss: (x, z, radius, base, source, might, stamp) => espalier.hit(x, z, radius, base, source, might, stamp),
    bossInfo: () => (espalier.awake() ? espalier.info() : null),
    plateInfo: () => shutters.info(),
    floorY,
    isLit,
    shadeZ: () => shade,
    blooming() {
      for (let i = 0; i < blooms.length; i++) {
        const b = blooms[i]
        if (b && b.life > 0) return true
      }
      return false
    },
    terraceMask() {
      let mask = 0
      if (shade <= -24 + 1e-3) mask |= 1
      if (shade <= -8 + 1e-3) mask |= 2
      if (shade <= 8 + 1e-3) mask |= 4
      return mask
    },
    bloom(x, z, lit) {
      if (!lit || cookieGate(x, z) <= 0.5) return false
      let slot = -1
      let oldest = 1e9
      for (let i = 0; i < blooms.length; i++) {
        const b = blooms[i]
        if (!b) continue
        if (b.life <= 0) {
          slot = i
          break
        }
        if (b.life < oldest) {
          oldest = b.life
          slot = i
        }
      }
      const picked = blooms[slot]
      if (!picked) return false
      picked.x = x
      picked.z = z
      picked.life = BLOOM_LIFE
      uploadBlooms()
      bloomShown = true
      return true
    },
    sample(base, step) {
      let lit = 0
      let n = 0
      for (let x = -23; x <= 23; x += step) {
        for (let z = -23; z <= 23; z += step) {
          n++
          if (isLit(base, x, z)) lit++
        }
      }
      return n > 0 ? lit / n : 0
    },
    agree(renderer, camera, points, hide, base) {
      const prevOwn = own.map((mesh) => mesh.visible)
      const prevHide = hide.map((mesh) => mesh.visible)
      for (let i = 0; i < own.length; i++) {
        const mesh = own[i]
        if (mesh) mesh.visible = false
      }
      for (let i = 0; i < hide.length; i++) {
        const mesh = hide[i]
        if (mesh) mesh.visible = false
      }
      probe.visible = true
      uProbe.value = 1
      camera.updateMatrixWorld()
      renderer.render(opts.scene, camera)
      const gl = renderer.getContext() as WebGL2RenderingContext
      renderer.getDrawingBufferSize(drawSize)
      let tested = 0
      let agreed = 0
      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        if (!point) continue
        ndc.set(point.x, 2, point.z)
        ndc.project(camera)
        if (ndc.z < 0 || ndc.z > 1 || Math.abs(ndc.x) > 0.98 || Math.abs(ndc.y) > 0.98) continue
        const px = Math.min(drawSize.x - 1, Math.max(0, Math.floor((ndc.x * 0.5 + 0.5) * drawSize.x)))
        const py = Math.min(drawSize.y - 1, Math.max(0, Math.floor((ndc.y * 0.5 + 0.5) * drawSize.y)))
        gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        const r = pixel[0] ?? 0
        const g = pixel[1] ?? 0
        const b = pixel[2] ?? 0
        const bright = r > 180 && g > 180 && b > 180
        const dark = r < 40 && g < 40 && b < 40
        if (!bright && !dark) continue
        tested++
        const cpu = isLit(base, point.x, point.z)
        if (cpu === bright) agreed++
      }
      uProbe.value = 0
      probe.visible = false
      for (let i = 0; i < own.length; i++) {
        const mesh = own[i]
        if (mesh) mesh.visible = prevOwn[i] ?? false
      }
      for (let i = 0; i < hide.length; i++) {
        const mesh = hide[i]
        if (mesh) mesh.visible = prevHide[i] ?? false
      }
      return { tested, agree: agreed }
    },
    warm(renderer, camera) {
      const prevMat = terrain.material
      const prevVis = terrain.visible
      terrain.visible = true
      terrain.material = material
      renderer.compile(terrain, camera)
      terrain.material = shadeMat
      renderer.compile(terrain, camera)
      terrain.material = prevMat
      terrain.visible = prevVis
      const show = dressing.visible
      dressing.visible = true
      renderer.compile(dressing, camera)
      dressing.visible = show
      const showS = shutters.mesh.visible
      const showE = espalier.mesh.visible
      const showT = espalier.tele.visible
      shutters.mesh.visible = true
      espalier.mesh.visible = true
      espalier.tele.visible = true
      renderer.compile(shutters.mesh, camera)
      renderer.compile(espalier.mesh, camera)
      renderer.compile(espalier.tele, camera)
      shutters.mesh.visible = showS
      espalier.mesh.visible = showE
      espalier.tele.visible = showT
    },
    tris: () => ({
      terrain: trisOf(terrain.geometry) + backdropTris,
      pergola: pergolaTris,
      dressing: dressingTris,
      foliage: foliageTris,
    }),
  }
}
