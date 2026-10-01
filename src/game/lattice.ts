import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
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
    const radial = Math.hypot(pos.getX(i), pos.getZ(i))
    if (y > maxY - 0.08 && radial > 0.28) tmp.copy(COLOR.gold)
    else if (y > maxY - 0.08) tmp.copy(COLOR.goldHot)
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

function paintFoliage(geo: BufferGeometry) {
  const pos = geo.getAttribute('position')
  const norm = geo.getAttribute('normal')
  const colors = new Float32Array(pos.count * 3)
  let maxY = -1e9
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i))
  for (let i = 0; i < pos.count; i++) {
    const up = (norm?.getY(i) ?? 0) > 0.4 || pos.getY(i) > maxY - 0.06
    const c = up ? COLOR.foliageRim : pos.getY(i) < maxY - 0.22 ? COLOR.foliageDeep : COLOR.foliage
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
}

function addBox(parts: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, color: Color, rotX = 0, top?: Color) {
  const geo = new BoxGeometry(w, h, d)
  if (top) paintFaces(geo, color, top)
  else paint(geo, color)
  if (rotX !== 0) geo.rotateX(rotX)
  geo.translate(x, y, z)
  parts.push(geo)
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

float cookieSoft(vec2 roof) {
  float c = cookieVis(roof);
  if (abs(uInset) < 1e-4) return c;
  if (uInset > 0.0) {
    c = min(c, cookieVis(roof + vec2(uInset, 0.0)));
    c = min(c, cookieVis(roof - vec2(uInset, 0.0)));
    c = min(c, cookieVis(roof + vec2(0.0, uInset)));
    c = min(c, cookieVis(roof - vec2(0.0, uInset)));
    return c;
  }
  float d = -uInset;
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
      if (vUp > 0.5 && abs(p.x) < 24.0 && abs(p.y) < 24.0 && !inOpen(p.x)) {
        gap = smoothstep(0.47, 0.53, cookieSoft(p - uOff));
        gap *= 0.92 + 0.08 * sin(uTime * 2.0 + p.x * 0.15);
      }
      vec3 slat = stone * vec3(0.18, 0.14, 0.20);
      vec3 sunlit = stone * 1.24;
      float light = clamp(cone, 0.0, 1.0) * clamp(shadow, 0.0, 1.0) * tier;
      if (zoneLit(p)) {
        light = 1.0;
        gap = 1.0;
      }
      col = mix(slat, sunlit, light * gap);
      float bloom = 0.0;
      if (uBloomN > 0.5) {
        for (int i = 0; i < ${BLOOM_N}; i++) {
          if (float(i) >= uBloomN) break;
          bloom = max(bloom, 1.0 - smoothstep(${(BLOOM_R * 0.45).toFixed(2)}, ${BLOOM_R.toFixed(1)}, distance(p, uBloom[i].xy)));
        }
      }
      col += vec3(1.0, 0.78, 0.28) * bloom * 0.55;
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
  for (let i = -3; i <= 3; i++) addBox(backdropParts, 1.4, 2.4, 0.25, i * 6, 3.2, -26.85, COLOR.shade)
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
  const clumpA = new IcosahedronGeometry(0.28, 0)
  const clumpB = new IcosahedronGeometry(0.2, 0)
  clumpB.translate(0.2, 0.08, 0.08)
  const clumpC = new IcosahedronGeometry(0.16, 0)
  clumpC.translate(-0.14, 0.14, -0.1)
  const clump = merged([clumpA, clumpB, clumpC])
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
  for (let i = 0; i < LATTICE_POSTS.length; i++) {
    const post = LATTICE_POSTS[i]
    if (!post) continue
    const geo = clump.clone()
    paintFoliage(geo)
    geo.rotateY(i * 0.7)
    geo.translate(post.x, 3.55, post.z)
    vineGeos.push(geo)
  }
  for (let i = 0; i < potSpots.length; i++) {
    const spot = potSpots[i]
    if (!spot) continue
    const geo = potGeo.clone()
    paint(geo, i % 2 === 0 ? COLOR.sandstoneDeep : COLOR.bronze)
    geo.translate(spot.x, spot.y, spot.z)
    potGeos.push(geo)
  }
  clump.dispose()
  potGeo.dispose()
  const leafGeo = merged([new IcosahedronGeometry(0.22, 0), (() => {
    const bud = new IcosahedronGeometry(0.14, 0)
    bud.translate(0.16, 0.1, 0.04)
    return bud
  })(), (() => {
    const bud = new IcosahedronGeometry(0.12, 0)
    bud.translate(-0.12, 0.12, -0.08)
    return bud
  })()])
  paintFoliage(leafGeo)
  const leafSpots: { x: number; y: number; z: number }[] = []
  for (let e = 0; e < EDGES.length; e++) {
    const zc = EDGES[e] ?? 0
    const y = (zc < 0 ? 1.28 : 0.98)
    for (let s = 0; s < SPANS.length; s++) {
      const span = SPANS[s]
      if (!span) continue
      const width = span[1] - span[0]
      for (let t = 0.14; t <= 0.86; t += 0.18) {
        leafSpots.push({ x: span[0] + width * t, y, z: zc })
      }
    }
  }
  const foliage = new InstancedMesh(
    leafGeo,
    new MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap(), vertexColors: true }),
    Math.max(1, leafSpots.length),
  )
  foliage.frustumCulled = false
  foliage.castShadow = false
  foliage.receiveShadow = false
  for (let i = 0; i < leafSpots.length; i++) {
    const spot = leafSpots[i]
    if (!spot) continue
    dummy.position.set(spot.x, spot.y, spot.z)
    dummy.rotation.set(0, i * 0.73, 0)
    const s = 0.86 + (i % 4) * 0.08
    dummy.scale.set(s, s * 0.75, s)
    dummy.updateMatrix()
    foliage.setMatrixAt(i, dummy.matrix)
  }
  foliage.count = leafSpots.length
  foliage.instanceMatrix.needsUpdate = true
  foliage.visible = false
  const foliageTris = trisOf(leafGeo) * leafSpots.length
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
  const bloomGeo = new CircleGeometry(BLOOM_R, 12)
  bloomGeo.rotateX(-Math.PI / 2)
  const bloomMesh = new InstancedMesh(
    bloomGeo,
    new MeshBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.8, depthWrite: false }),
    BLOOM_N,
  )
  bloomMesh.count = 0
  bloomMesh.visible = false
  bloomMesh.renderOrder = 2
  bloomMesh.frustumCulled = false
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
      bloom = max(bloom, 1.0 - smoothstep(${(BLOOM_R * 0.45).toFixed(2)}, ${BLOOM_R.toFixed(1)}, distance(vWorld.xz, uBloom[i].xy)));
    }
  }
  col += vec3(1.0, 0.78, 0.28) * bloom * 0.55;
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
  const dressing = new Mesh(
    merged([backdropGeo, pergolaGeo, fountainGeo, ...vineGeos, ...potGeos].map(unroll)),
    new MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap(), vertexColors: true }),
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
  opts.scene.add(terrain, dressing, foliage, bloomMesh, probe)
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
  const dressingTris = vineTris + potTris + fountainTris

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

  function placeBlooms() {
    let n = 0
    for (let i = 0; i < blooms.length; i++) {
      const b = blooms[i]
      if (!b || b.life <= 0) continue
      dummy.position.set(b.x, floorY(b.z) + 0.08, b.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      bloomMesh.setMatrixAt(n, dummy.matrix)
      n++
    }
    bloomMesh.count = n
    bloomMesh.instanceMatrix.needsUpdate = true
    bloomMesh.visible = n > 0
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
      uInset.value = inset
    },
    floor: floorY,
    wake: opts.sfx.wake,
    rake: opts.sfx.rake,
    slam: opts.sfx.slam,
  })
  opts.scene.add(shutters.mesh, espalier.mesh, espalier.tele)

  const own = [terrain, dressing, foliage, bloomMesh, probe, shutters.mesh, espalier.mesh, espalier.tele]
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
      bytes = new Uint8Array(256 * 256)
      for (let i = 0; i < bytes.length; i++) {
        const v = img.data[i * 4] ?? 0
        bytes[i] = v
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
      foliage.visible = true
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
      let live = false
      for (let i = 0; i < blooms.length; i++) {
        const b = blooms[i]
        if (!b || b.life <= 0) continue
        b.life -= dt
        if (b.life > 0) live = true
      }
      const same = sun.time === heldTime && sun.z === heldZ && sun.dirX === heldDirX && sun.dirZ === heldDirZ
      beam = beamFn
      if (!same || live || bloomMesh.count > 0) {
        heldTime = sun.time
        heldZ = sun.z
        heldDirX = sun.dirX
        heldDirZ = sun.dirZ
        sync(sun)
        if (live || bloomMesh.count > 0) placeBlooms()
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
      placeBlooms()
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
      const show = foliage.visible
      foliage.visible = true
      renderer.compile(foliage, camera)
      renderer.compile(dressing, camera)
      foliage.visible = show
      const showS = shutters.mesh.visible
      const showE = espalier.mesh.visible
      shutters.mesh.visible = true
      espalier.mesh.visible = true
      renderer.compile(shutters.mesh, camera)
      renderer.compile(espalier.mesh, camera)
      shutters.mesh.visible = showS
      espalier.mesh.visible = showE
    },
    tris: () => ({
      terrain: trisOf(terrain.geometry) + backdropTris,
      pergola: pergolaTris,
      dressing: dressingTris,
      foliage: foliageTris,
    }),
  }
}
