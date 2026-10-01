import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Rng } from '../core/rng'
import { COLOR } from '../data/palette'
import { TUNING } from '../data/tuning'
import type { FloorUniforms } from '../render/floorShader'
import { PILLARS, cloisterWalk, octDist, segmentBlocked, setCloisterBound, setCloisterCourt } from './collision'

const SOUTH = Math.PI / 2
const TAU = Math.PI * 2
const COS45 = 0.7071067811865476
const CELLS = 48
const CELL_N = CELLS * CELLS

const STELAE: { x: number; z: number; r: number }[] = [
  { x: -12, z: -12, r: 0.9 },
  { x: 12, z: -12, r: 0.9 },
  { x: -12, z: 12, r: 0.9 },
  { x: 12, z: 12, r: 0.9 },
]

/** Column centers on the chebyshev-18 square. Corners belong to the north and south runs. */
const columnXZ: number[] = []
function pushRun(x: number, z: number) {
  columnXZ.push(x, z)
}
for (let x = -18; x <= 18; x += 6) {
  pushRun(x, 18)
  pushRun(x, -18)
}
for (let z = -12; z <= 12; z += 6) {
  pushRun(18, z)
  pushRun(-18, z)
}

const SPAWN: number[] = []
const GARTH: number[] = []
for (const x of [-15, -9, -3, 3, 9, 15]) SPAWN.push(x, -21.2)
for (const z of [-15, -9, -3, 3, 9, 15]) SPAWN.push(-21.2, z)
for (const x of [-15, -5, 5, 15]) GARTH.push(x, -16)
for (const z of [-15, -5, 5, 15]) GARTH.push(-16, z)

const maskClosed = new Uint8Array(CELL_N)
const maskOpen = new Uint8Array(CELL_N)
const distField = new Int16Array(CELL_N)
const flowX = new Int8Array(CELL_N)
const flowZ = new Int8Array(CELL_N)
const queue = new Int16Array(CELL_N)

function stamp(geo: BufferGeometry, color: Color, mark: number) {
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const marks = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
    marks[i] = mark
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  geo.setAttribute('aMark', new BufferAttribute(marks, 1))
}

function smooth(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

export function cycleSecond(theta: number, dir: number): number {
  let u = ((theta - SOUTH) * dir) / TAU + 17 / 60
  u -= Math.floor(u)
  return u * 60
}

function levelAt(c: number): number {
  if (c < 0.6) return (c / 0.6) * 0.15
  if (c < 8) return 0.15 + smooth((c - 0.6) / 7.4) * 0.85
  if (c < 26) return 1
  if (c < 32) return 1 + smooth((c - 26) / 6) * (0.16 - 1)
  return c < 34 ? 0.16 * (1 - (c - 32) / 2) : 0
}

function stateAt(c: number): string {
  if (c < 0.6) return 'surge'
  if (c < 8) return 'fill'
  if (c < 26) return 'brim'
  if (c < 32) return 'ebb'
  if (c < 34) return 'tail'
  if (c < 58) return 'low'
  return 'warn'
}

function roofAt(x: number, z: number): boolean {
  const ax = x < 0 ? -x : x
  const az = z < 0 ? -z : z
  return (ax > az ? ax : az) >= 18
}

function buildWater(): BufferGeometry {
  const n = 8
  const pos: number[] = []
  const col: number[] = []
  const oct: number[] = []
  const kind: number[] = []
  const idx: number[] = []
  const push = (x: number, y: number, z: number, o: number, k: number, color: Color) => {
    pos.push(x, y, z)
    col.push(color.r, color.g, color.b)
    oct.push(o)
    kind.push(k)
    return pos.length / 3 - 1
  }
  const ring = (apothem: number, y: number, k: number, color: Color) => {
    const ids: number[] = []
    const rv = apothem <= 0.001 ? 0 : apothem / Math.cos(Math.PI / n)
    for (let i = 0; i < n; i++) {
      const a = Math.PI / n + (i * 2 * Math.PI) / n
      ids.push(push(Math.cos(a) * rv, y, Math.sin(a) * rv, apothem, k, color))
    }
    return ids
  }
  const center = push(0, -0.9, 0, 0, 0, COLOR.poolDeep)
  const bands = [2.5, 5.2, 6, 8, 10]
  const bandColor = [COLOR.poolDeep, COLOR.pool, COLOR.pool, COLOR.pool, COLOR.pool]
  const rings: number[][] = []
  for (let b = 0; b < bands.length; b++) rings.push(ring(bands[b] ?? 0, -0.9, 0, bandColor[b] ?? COLOR.pool))
  const inner = rings[0]
  if (inner) {
    for (let i = 0; i < n; i++) idx.push(center, inner[(i + 1) % n] ?? 0, inner[i] ?? 0)
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r]
    const b = rings[r + 1]
    if (!a || !b) continue
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n
      idx.push(a[i] ?? 0, b[i2] ?? 0, b[i] ?? 0)
      idx.push(a[i] ?? 0, a[i2] ?? 0, b[i2] ?? 0)
    }
  }
  const wallBot = ring(6, -1.2, 1, COLOR.poolDeep)
  const wallTop = ring(6, -0.35, 1, COLOR.pool)
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    idx.push(wallBot[i] ?? 0, wallTop[i] ?? 0, wallTop[i2] ?? 0)
    idx.push(wallBot[i] ?? 0, wallTop[i2] ?? 0, wallBot[i2] ?? 0)
  }
  const pads = [
    [2.2, 1.1],
    [-1.6, 2.1],
    [-2.2, -1.3],
    [1.4, -2.0],
    [0.3, 0.4],
  ]
  for (let p = 0; p < pads.length; p++) {
    const pad = pads[p]
    if (!pad) continue
    const cx = pad[0] ?? 0
    const cz = pad[1] ?? 0
    const hub = push(cx, -0.86, cz, 0, 2, COLOR.foliage)
    const rim: number[] = []
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      rim.push(push(cx + Math.cos(a) * 0.42, -0.86, cz + Math.sin(a) * 0.42, 0, 2, COLOR.foliageDeep))
    }
    for (let i = 0; i < 6; i++) idx.push(hub, rim[(i + 1) % 6] ?? hub, rim[i] ?? hub)
  }
  if (idx.length >= 3) {
    const ia = (idx[0] ?? 0) * 3
    const ib = (idx[1] ?? 0) * 3
    const ic = (idx[2] ?? 0) * 3
    const ax = (pos[ib] ?? 0) - (pos[ia] ?? 0)
    const az = (pos[ib + 2] ?? 0) - (pos[ia + 2] ?? 0)
    const bx = (pos[ic] ?? 0) - (pos[ia] ?? 0)
    const bz = (pos[ic + 2] ?? 0) - (pos[ia + 2] ?? 0)
    if (ax * bz - az * bx < 0) {
      for (let i = 0; i < idx.length; i += 3) {
        const swap = idx[i + 1] ?? 0
        idx[i + 1] = idx[i + 2] ?? 0
        idx[i + 2] = swap
      }
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new Float32BufferAttribute(col, 3))
  geo.setAttribute('aOct', new Float32BufferAttribute(oct, 1))
  geo.setAttribute('aKind', new Float32BufferAttribute(kind, 1))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  return geo
}

const FLOOR_VERT = /* glsl */ `
precision mediump float;
varying vec3 vWorld;
float octDist(vec2 p) {
  vec2 a = abs(p);
  float diag = (a.x + a.y) * ${COS45};
  return max(a.x, max(a.y, diag));
}
uniform float uRing;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float cheb = max(abs(wp.x), abs(wp.z));
  float o = octDist(wp.xz);
  if (cheb >= 18.0) wp.y += 0.3;
  else if (o < 6.0) wp.y = -1.05;
  else if (o < 10.0) wp.y = mix(-0.42, -0.3, uRing);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FLOOR_FRAG = /* glsl */ `
precision mediump float;
varying vec3 vWorld;
uniform vec2 uSun;
uniform vec2 uDir;
uniform float uCosBeta;
uniform vec3 uPillars[12];
uniform float uPillarN;
uniform vec3 uFogColor;
uniform float uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSand;
uniform vec3 uGold;
uniform vec2 uAxis;
uniform float uCosR;
uniform float uBrim;
uniform float uGlow;
uniform float uForecast;
uniform float uDeep;
uniform float uRing;
uniform float uProbe;
uniform float uTime;
uniform vec3 uOcc[4];
float octDist(vec2 p) {
  vec2 a = abs(p);
  float diag = (a.x + a.y) * ${COS45};
  return max(a.x, max(a.y, diag));
}
bool segHit(vec2 a, vec2 b, vec2 c, float r) {
  vec2 d = b - a;
  float len2 = dot(d, d);
  if (len2 < 1e-8) return dot(a - c, a - c) <= r * r;
  float t = clamp(dot(c - a, d) / len2, 0.0, 1.0);
  vec2 q = a + d * t - c;
  return dot(q, q) <= r * r;
}
bool blockedPillar(vec2 a, vec2 b) {
  for (int i = 0; i < 12; i++) {
    if (float(i) >= uPillarN) break;
    if (segHit(a, b, uPillars[i].xy, uPillars[i].z)) return true;
  }
  return false;
}
bool blockedOcc(vec2 b) {
  if (uOcc[0].z > 0.0 && segHit(vec2(0.0), b, uOcc[0].xy, uOcc[0].z)) return true;
  if (uOcc[1].z > 0.0 && segHit(vec2(0.0), b, uOcc[1].xy, uOcc[1].z)) return true;
  if (uOcc[2].z > 0.0 && segHit(vec2(0.0), b, uOcc[2].xy, uOcc[2].z)) return true;
  if (uOcc[3].z > 0.0 && segHit(vec2(0.0), b, uOcc[3].xy, uOcc[3].z)) return true;
  return false;
}
bool directHard(vec2 p) {
  vec2 toP = p - uSun;
  float dist = length(toP);
  if (dist < 1e-4) return false;
  if (dot(toP / dist, uDir) < uCosBeta) return false;
  if (blockedPillar(uSun, p)) return false;
  return true;
}
bool reflectHard(vec2 p) {
  if (uBrim < 0.5) return false;
  float len = length(p);
  if (len < 1e-4) return false;
  if (dot(p / len, uAxis) < uCosR) return false;
  if (octDist(p) < 10.0) return false;
  if (blockedPillar(vec2(0.0), p)) return false;
  if (blockedOcc(p)) return false;
  return true;
}
bool glintHard(vec2 p) {
  if (uRing < 0.5) return false;
  float o = octDist(p);
  if (o < 6.0 || o >= 10.0) return false;
  return directHard(p);
}
bool hardLit(vec2 p) {
  float cheb = max(abs(p.x), abs(p.y));
  if (directHard(p) && cheb < 18.0) return true;
  if (reflectHard(p)) return true;
  return glintHard(p);
}
float directSoft(vec2 p) {
  vec2 toP = p - uSun;
  float dist = length(toP);
  if (dist < 1e-4) return 0.0;
  float band = 0.3 / dist;
  float cone = smoothstep(uCosBeta - band, uCosBeta + band, dot(toP / dist, uDir));
  if (cone <= 0.0) return 0.0;
  if (blockedPillar(uSun, p)) return 0.0;
  float cheb = max(abs(p.x), abs(p.y));
  return cone * (1.0 - smoothstep(17.7, 18.3, cheb));
}
float reflectSoft(vec2 p) {
  float gate = max(uBrim, uGlow);
  if (gate <= 0.001) return 0.0;
  float len = length(p);
  if (len < 1e-4) return 0.0;
  float band = 0.3 / len;
  float wedge = smoothstep(uCosR - band, uCosR + band, dot(p / len, uAxis));
  if (wedge <= 0.0) return 0.0;
  wedge *= smoothstep(9.7, 10.15, octDist(p));
  if (wedge <= 0.0) return 0.0;
  if (blockedPillar(vec2(0.0), p) || blockedOcc(p)) return 0.0;
  return wedge * min(gate, 1.0);
}
float glintSoft(vec2 p) {
  if (uRing < 0.5) return 0.0;
  float o = octDist(p);
  float band = smoothstep(5.7, 6.15, o) * (1.0 - smoothstep(9.7, 10.15, o));
  if (band <= 0.0 || !directHard(p)) return 0.0;
  return band;
}
float groutAt(vec2 p) {
  float fx = min(fract(p.x * 0.5), 1.0 - fract(p.x * 0.5));
  float fz = min(fract(p.y * 0.5), 1.0 - fract(p.y * 0.5));
  return 1.0 - smoothstep(0.015, 0.045, min(fx, fz));
}
vec3 stoneTone(vec2 p) {
  vec2 cell = floor(p * 0.5);
  float n = fract(cell.x * 0.1031 + cell.y * 0.11369);
  n = fract(n * n * 17.13);
  float toneN = fract(n * 13.137);
  vec3 pale = uSand;
  vec3 warm = uSand * vec3(0.88, 0.76, 0.58);
  vec3 deep = uSand * vec3(0.72, 0.58, 0.42);
  vec3 tone = toneN < 0.52 ? pale : (toneN < 0.82 ? warm : deep);
  tone *= mix(0.94, 1.06, n);
  return mix(tone, tone * 0.42, groutAt(p));
}
float archPatch(vec2 p) {
  float ax = abs(p.x);
  float az = abs(p.y);
  float along = ax >= az ? p.y : p.x;
  float depth = max(ax, az) - 18.0;
  float fromCol = abs(mod(along + 3.0, 6.0) - 3.0);
  float across = (3.0 - fromCol) * 0.9;
  return 1.0 - smoothstep(1.35, 2.45, length(vec2(across, depth - 0.35)));
}
float caustic(vec2 p) {
  float a = sin(p.x * 1.85 + uTime * 0.8);
  float b = sin(p.y * 1.45 - uTime * 0.62);
  return smoothstep(0.15, 0.72, a * b + 0.35);
}
void main() {
  vec2 p = vWorld.xz;
  float o = octDist(p);
  if (uProbe > 0.5) {
    float k = hardLit(p) ? 1.0 : 0.0;
    gl_FragColor = vec4(k, k, k, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  float cheb = max(abs(p.x), abs(p.y));
  vec3 stone = stoneTone(p);
  if (o > 6.0 && o < 10.0 && uRing > 0.5) {
    stone *= vec3(0.46, 0.50, 0.48);
    float sheen = pow(0.5 + 0.5 * sin(p.x * 0.55 + uTime * 0.35), 6.0);
    stone += vec3(0.5, 0.58, 0.54) * sheen * 0.28;
  }
  float roof = smoothstep(17.7, 18.3, cheb);
  float bay = archPatch(p);
  vec3 garthShade = stone * vec3(0.62, 0.56, 0.66);
  vec3 arcadeShade = stone * mix(vec3(0.30, 0.24, 0.40), vec3(0.98, 0.84, 0.66), bay);
  arcadeShade = mix(arcadeShade, arcadeShade * vec3(0.55, 0.48, 0.64), uDeep);
  vec3 shaded = mix(garthShade, arcadeShade, roof);
  float reflected = reflectSoft(p);
  float lit = clamp(max(directSoft(p), max(reflected, glintSoft(p))), 0.0, 1.0);
  float rip = 0.86 + 0.14 * sin(p.x * 1.7 + uTime * 2.1) * sin(p.y * 1.4 - uTime * 1.6);
  vec3 bright = mix(stone, uGold, 0.42) * vec3(1.22, 1.08, 0.82) * mix(1.0, rip, reflected);
  bright *= mix(1.0, mix(0.28, 1.0, bay), roof);
  vec3 col = mix(shaded, bright, lit);
  col += uGold * caustic(p) * reflected * (0.45 + roof * 0.75);
  float cope = smoothstep(9.55, 9.82, o) * (1.0 - smoothstep(10.28, 10.6, o));
  float trim = smoothstep(10.08, 10.2, o) * (1.0 - smoothstep(10.24, 10.42, o));
  col = mix(col, uSand * vec3(1.05, 1.01, 0.92), cope * (1.0 - roof));
  col = mix(col, uGold, trim * 0.9);
  if (cheb < 17.8 && o >= 10.0 && o < 17.6) {
    float ring = abs(fract(o * 0.42) - 0.5);
    col = mix(col, uGold, (1.0 - smoothstep(0.012, 0.045, ring)) * 0.55);
  }
  if (o > 6.0 && o < 10.0 && directHard(p)) {
    float spark = fract(sin(dot(floor(p * 3.0), vec2(127.1, 311.7))) * 43758.5453);
    col += uGold * step(0.84, spark) * 0.45;
  }
  if (uForecast > 0.5) {
    float sR = sqrt(max(0.0, 1.0 - uCosR * uCosR));
    vec2 e0 = vec2(uAxis.x * uCosR - uAxis.y * sR, uAxis.x * sR + uAxis.y * uCosR);
    vec2 e1 = vec2(uAxis.x * uCosR + uAxis.y * sR, -uAxis.x * sR + uAxis.y * uCosR);
    float edge = min(abs(p.x * e0.y - p.y * e0.x), abs(p.x * e1.y - p.y * e1.x));
    float along = dot(p, uAxis);
    float dash = step(0.5, fract(along * 0.55));
    if (along > 8.0 && edge < 0.16 && dash > 0.5 && o >= 10.0) col = mix(col, uGold, 0.92);
  }
  float fogF = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)) * uFog;
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const ARCH_VERT = /* glsl */ `
precision mediump float;
attribute float aMark;
attribute vec3 color;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMark;
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    pos = (instanceMatrix * vec4(position, 1.0)).xyz;
    nrm = mat3(instanceMatrix) * normal;
  #endif
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * nrm);
  vColor = color;
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;
  #endif
  vMark = aMark;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const ARCH_FRAG = /* glsl */ `
precision mediump float;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vMark;
uniform vec3 uFogColor;
uniform float uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSand;
uniform vec3 uGold;
uniform vec2 uAxis;
uniform float uCosR;
uniform float uGlow;
uniform float uC;
uniform float uTime;
float octDist(vec2 p) {
  vec2 a = abs(p);
  float diag = (a.x + a.y) * ${COS45};
  return max(a.x, max(a.y, diag));
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 L = normalize(vec3(-uAxis.x, 0.72, -uAxis.y));
  float ndl = clamp(dot(n, L), 0.0, 1.0);
  vec3 col = vColor * mix(0.7, 1.08, ndl);
  if (n.y > 0.5 && vWorld.y < 2.0) {
    float red = step(col.g * 1.35, col.r) * step(col.b * 1.15, col.r);
    col = mix(col, uSand, red);
  }
  vec2 p = vWorld.xz;
  float len = length(p);
  float wedge = 0.0;
  if (len > 0.05 && uGlow > 0.01 && dot(p / len, uAxis) >= uCosR && octDist(p) >= 10.0) wedge = 1.0;
  float under = step(0.25, -n.y) * step(3.2, vWorld.y);
  float north = step(0.45, n.z) * step(vWorld.z, -18.0);
  float west = step(0.45, n.x) * step(vWorld.x, -18.0);
  float roofTop = step(0.45, n.y) * step(3.4, vWorld.y) * max(north, west);
  float shim = max(under, max(north, max(west, roofTop))) * wedge * min(uGlow, 1.25);
  float spot = sin(vWorld.x * 2.4 + vWorld.z * 1.7 + uTime * 0.9);
  float dapple = smoothstep(0.35, 0.85, spot);
  col += uGold * shim * dapple * 1.15;
  if (vMark > 0.5 && uC >= 58.0) {
    float idx = vMark - 1.0;
    float phase = clamp((uC - 58.0) / 0.25, 0.0, 8.0);
    float on = step(idx + 0.02, phase);
    col = mix(col, vec3(1.0, 0.95, 0.72), on * (0.55 + 0.45 * sin(uTime * 10.0)));
  }
  float fogF = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)) * uFog;
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const WATER_VERT = /* glsl */ `
precision mediump float;
attribute float aOct;
attribute float aKind;
attribute vec3 color;
varying vec3 vWorld;
varying vec3 vColor;
varying float vKind;
uniform float uLevel;
uniform float uTime;
void main() {
  vec3 p = position;
  if (aKind < 0.5) {
    float o = max(aOct, 0.001);
    float shown = o;
    if (o > 6.0) shown = mix(6.0, o, smoothstep(0.02, 0.35, uLevel));
    if (aOct > 0.02) {
      float s = shown / o;
      p.x *= s;
      p.z *= s;
    }
    p.y = mix(-0.82, -0.04, uLevel);
    p.y += sin(p.x * 1.7 + uTime * 1.4) * cos(p.z * 1.3 - uTime) * 0.012 * uLevel;
  } else if (aKind > 1.5) {
    p.y = mix(-0.82, -0.04, uLevel) + 0.045;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vColor = color;
  vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const WATER_FRAG = /* glsl */ `
precision mediump float;
varying vec3 vWorld;
varying vec3 vColor;
varying float vKind;
uniform vec3 uFogColor;
uniform float uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uGold;
uniform vec3 uPoolDeep;
uniform vec3 uPoolShoal;
uniform vec2 uAxis;
uniform float uGlow;
uniform float uFront;
uniform float uLevel;
uniform float uTime;
float octDist(vec2 p) {
  vec2 a = abs(p);
  float diag = (a.x + a.y) * ${COS45};
  return max(a.x, max(a.y, diag));
}
void main() {
  vec2 p = vWorld.xz;
  float o = octDist(p);
  float t = smoothstep(0.2, 6.2, o);
  vec3 water = mix(uPoolDeep, uPoolShoal, t);
  float rip = sin(o * 3.4 - uTime * 0.65) * 0.5 + 0.5;
  float line = smoothstep(0.72, 0.96, rip);
  float ca = sin(p.x * 1.5 + uTime * 0.45) * sin(p.y * 1.2 - uTime * 0.3);
  water += uPoolShoal * smoothstep(0.45, 0.95, ca) * 0.16;
  water += vec3(0.75, 0.9, 0.82) * line * 0.18;
  vec3 col = vKind > 1.5 ? vColor : (vKind > 0.5 ? mix(uPoolDeep, uPoolShoal, 0.25) : water);
  float len = length(p);
  if (vKind < 0.5 && len > 0.2 && uGlow > 0.01) {
    float side = abs(p.x * uAxis.y - p.y * uAxis.x) / len;
    float along = dot(p / len, uAxis);
    float streak = smoothstep(0.22, 0.0, side) * smoothstep(0.15, 0.75, along);
    col += uGold * streak * min(uGlow, 1.2) * 0.55;
  }
  if (vKind < 0.5) {
    float edgeR = mix(6.0, 10.0, smoothstep(0.02, 0.35, uLevel));
    float foam = 1.0 - smoothstep(0.0, 0.16, abs(o - edgeR));
    col = mix(col, vec3(0.93, 0.96, 0.9), foam * 0.8);
  }
  if (uFront > 0.0) {
    float band = 1.0 - smoothstep(0.0, 0.4, abs(o - uFront));
    col = mix(col, vec3(1.0, 0.93, 0.7), band * 0.75);
  }
  col *= mix(0.92, 1.0, uLevel * 0.35 + 0.65);
  float fogF = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)) * uFog;
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

interface SunLike {
  x: number
  z: number
  dirX: number
  dirZ: number
  angle: number
  dir: number
  time: number
  theta0: number
  frozen: boolean
  advance: (dt: number) => void
  isLit: (x: number, z: number) => boolean
}

export interface CloisterInfo {
  c: number
  state: string
  level: number
  ringOpen: boolean
  betaR: number
  flowMs: number
  dir: number
  theta: number
}

export interface CloisterHandle {
  ready: boolean
  apply: () => void
  clear: (restore: boolean) => void
  warm: (renderer: WebGLRenderer, camera: Camera) => void
  tick: (dt: number, sun: SunLike, wide: number, px: number, pz: number) => void
  pin: (sun: SunLike) => void
  hold: (sun: SunLike, c: number) => void
  shoveAt: (x: number, z: number, radius: number) => { x: number; z: number } | null
  isLit: (x: number, z: number) => boolean
  underLit: (x: number, z: number) => boolean
  deep: (x: number, z: number) => boolean
  floorY: (x: number, z: number) => number
  guide: (x: number, z: number, px: number, pz: number) => { x: number; z: number } | null
  plan: (time: number) => { darter: number; boss: boolean; rateMul: number; relocate: (x: number, z: number, rng: Rng) => { x: number; z: number } }
  info: () => CloisterInfo
  setOccluder: (i: number, circle: { x: number; z: number; r: number } | null) => void
  cover: () => { exposed: number; arcade: number; n: number; arcadeN: number }
  agree: (renderer: WebGLRenderer, camera: Camera, points: ReadonlyArray<{ x: number; z: number }>, hide: Object3D[]) => { tested: number; agree: number }
  benchLit: () => { ms: number; lit: number }
  tris: () => { floor: number; arch: number; water: number }
}

function triCount(geo: BufferGeometry): number {
  if (geo.index) return geo.index.count / 3
  return geo.getAttribute('position').count / 3
}

export function createCloister(opts: { scene: Object3D; uniforms: FloorUniforms; hide: Object3D[]; restore: Object3D[] }): CloisterHandle {
  const parts: BufferGeometry[] = []
  const putBox = (w: number, h: number, d: number, x: number, y: number, z: number, color: Color, mark = 0, rotY = 0) => {
    const geo = new BoxGeometry(w, h, d)
    stamp(geo, color, mark)
    if (rotY !== 0) geo.rotateY(rotY)
    geo.translate(x, y, z)
    parts.push(geo)
  }
  const putCyl = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, color: Color) => {
    const geo = new CylinderGeometry(rt, rb, h, seg)
    stamp(geo, color, 0)
    geo.translate(x, y, z)
    parts.push(geo)
  }
  for (let i = 0; i < columnXZ.length; i += 2) {
    const x = columnXZ[i] ?? 0
    const z = columnXZ[i + 1] ?? 0
    putCyl(0.5, 0.54, 0.22, 6, x, 0.18, z, COLOR.gold)
    putCyl(0.32, 0.36, 2.05, 6, x, 1.32, z, COLOR.crimson)
    putCyl(0.5, 0.4, 0.22, 6, x, 2.46, z, COLOR.gold)
  }
  const putArch = (x0: number, z0: number, x1: number, z1: number) => {
    const dx = x1 - x0
    const dz = z1 - z0
    const span = Math.hypot(dx, dz) || 1
    const ux = dx / span
    const uz = dz / span
    const n = 7
    const rise = 1.05
    const spring = 2.58
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n
      const ang = Math.PI * t
      const along = (t - 0.5) * span * 0.96
      const y = spring + Math.sin(ang) * rise
      const tilt = Math.atan2(Math.PI * rise * Math.cos(ang), span)
      const px = (x0 + x1) / 2 + ux * along
      const pz = (z0 + z1) / 2 + uz * along
      const geo = new BoxGeometry((span / n) * 1.28, 0.3, 1.15)
      stamp(geo, COLOR.sandstone, 0)
      const inward = 0.7
      let ox = 0
      let oz = 0
      if (Math.abs(ux) > 0.5) {
        geo.rotateZ(tilt)
        oz = -Math.sign(z0 || 1) * inward
      } else {
        geo.rotateX(-tilt * Math.sign(uz || 1))
        geo.rotateY(-Math.PI / 2)
        ox = -Math.sign(x0 || 1) * inward
      }
      geo.translate(px + ox, y, pz + oz)
      parts.push(geo)
    }
  }
  const archRun = (x0: number, z0: number, x1: number, z1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      putArch(
        x0 + (x1 - x0) * t0,
        z0 + (z1 - z0) * t0,
        x0 + (x1 - x0) * t1,
        z0 + (z1 - z0) * t1,
      )
    }
  }
  archRun(-18, -18, 18, -18, 6)
  archRun(-18, 18, 18, 18, 6)
  archRun(-18, -18, -18, 18, 6)
  archRun(18, -18, 18, 18, 6)
  for (let i = 0; i < STELAE.length; i++) {
    const s = STELAE[i]
    if (!s) continue
    putCyl(0.82, 0.9, 3.2, 6, s.x, 1.6, s.z, COLOR.sandstone)
    putCyl(1.02, 1.02, 0.16, 6, s.x, 3.22, s.z, COLOR.gold)
  }
  putBox(36, 0.14, 0.28, 0, 3.92, 18, COLOR.sandstone)
  putBox(36, 0.14, 0.28, 0, 3.92, -18, COLOR.sandstone)
  putBox(0.28, 0.14, 36, 18, 3.92, 0, COLOR.sandstone)
  putBox(0.28, 0.14, 36, -18, 3.92, 0, COLOR.sandstone)
  for (let i = 0; i < columnXZ.length; i += 2) {
    const x = columnXZ[i] ?? 0
    const z = columnXZ[i + 1] ?? 0
    if (z === 18) putBox(0.14, 0.12, 5.3, x, 3.92, 20.65, COLOR.sandstoneDeep)
    else if (z === -18) putBox(0.14, 0.12, 5.3, x, 3.92, -20.65, COLOR.sandstoneDeep)
    else if (x === 18) putBox(5.3, 0.12, 0.14, 20.65, 3.92, z, COLOR.sandstoneDeep)
    else putBox(5.3, 0.12, 0.14, -20.65, 3.92, z, COLOR.sandstoneDeep)
  }
  putBox(48, 1, 0.5, 0, 0.5, 23.7, COLOR.sandstone)
  putBox(0.5, 1, 48, 23.7, 0.5, 0, COLOR.sandstone)
  putBox(48, 5, 0.7, 0, 2.5, -23.6, COLOR.sandstoneDeep)
  putBox(0.7, 5, 48, -23.6, 2.5, 0, COLOR.sandstoneDeep)
  putBox(46, 0.12, 0.9, 0, 4.9, -22.7, COLOR.sandstone)
  putBox(0.9, 0.12, 46, -22.7, 4.9, 0, COLOR.sandstone)
  putBox(46, 0.06, 0.14, 0, 5.02, -23.12, COLOR.gold)
  putBox(0.14, 0.06, 46, -23.12, 5.02, 0, COLOR.gold)
  putBox(36, 0.32, 0.28, 0, 0.16, 18, COLOR.sandstoneMid)
  putBox(36, 0.32, 0.28, 0, 0.16, -18, COLOR.sandstoneMid)
  putBox(0.28, 0.32, 36, 18, 0.16, 0, COLOR.sandstoneMid)
  putBox(0.28, 0.32, 36, -18, 0.16, 0, COLOR.sandstoneMid)
  for (let k = 0; k < 8; k++) {
    const phi = (k * Math.PI) / 4
    const rot = Math.atan2(-Math.cos(phi), -Math.sin(phi))
    putBox(7.0, 0.22, 0.5, Math.cos(phi) * 10, 0.16, Math.sin(phi) * 10, COLOR.sandstone, 0, rot)
    putBox(7.0, 0.06, 0.16, Math.cos(phi) * 10, 0.3, Math.sin(phi) * 10, COLOR.gold, 0, rot)
  }
  for (let i = 0; i < 8; i++) {
    const ang = Math.PI / 8 + (i * Math.PI) / 4
    const rad = 10 / Math.cos(Math.PI / 8)
    putBox(0.46, 0.62, 0.46, Math.cos(ang) * rad, 0.52, Math.sin(ang) * rad, COLOR.gold, i + 1)
  }
  putBox(0.7, 0.08, 0.7, 9.15, -0.22, 0, COLOR.bronze)
  putBox(0.7, 0.08, 0.7, -9.15, -0.22, 0, COLOR.bronze)
  putBox(0.7, 0.08, 0.7, 0, -0.22, 9.15, COLOR.bronze)
  putBox(0.7, 0.08, 0.7, 0, -0.22, -9.15, COLOR.bronze)
  putCyl(1.45, 1.6, 0.18, 8, 0, -0.92, 0, COLOR.sandstone)
  putCyl(1.05, 1.15, 0.14, 8, 0, -0.76, 0, COLOR.sandstoneMid)
  putCyl(0.22, 0.28, 0.86, 6, 0, -0.2, 0, COLOR.sandstone)
  putCyl(1.15, 1.15, 0.1, 8, 0, 0.32, 0, COLOR.gold)
  putBox(1.7, 0.06, 0.16, 0, 0.42, 0, COLOR.bronze)
  putBox(0.16, 0.06, 1.7, 0, 0.42, 0, COLOR.bronze)
  putCyl(0.2, 0.2, 0.08, 6, 0, 0.48, 0, COLOR.goldHot)
  const nicheX = [-15, -9, -3, 3, 9, 15]
  for (let i = 0; i < nicheX.length; i++) {
    const x = nicheX[i] ?? 0
    const banner = new PlaneGeometry(0.62, 1.25)
    stamp(banner, i % 2 === 0 ? COLOR.crimson : COLOR.gold, 0)
    banner.translate(x, 3.55, -22.85)
    parts.push(banner)
    putBox(0.28, 0.28, 0.28, x, 2.35, -22.55, COLOR.goldHot)
  }
  const nicheZ = [-15, -9, -3, 3, 9, 15]
  for (let i = 0; i < nicheZ.length; i++) {
    const z = nicheZ[i] ?? 0
    const banner = new PlaneGeometry(0.62, 1.25)
    stamp(banner, i % 2 === 0 ? COLOR.crimsonDeep : COLOR.gold, 0)
    banner.rotateY(Math.PI / 2)
    banner.translate(-22.85, 3.55, z)
    parts.push(banner)
    putBox(0.28, 0.28, 0.28, -22.55, 2.35, z, COLOR.goldHot)
  }
  const potAt: [number, number, number][] = [
    [-21.2, 0.54, -21.2],
    [21.2, 0.54, -21.2],
    [-21.2, 0.54, 21.2],
    [21.2, 0.54, 21.2],
    [-16.2, 0.24, 16.2],
    [16.2, 0.24, 16.2],
  ]
  for (let i = 0; i < potAt.length; i++) {
    const at = potAt[i]
    if (!at) continue
    const pot = new CylinderGeometry(0.42, 0.3, 0.48, 6)
    stamp(pot, i % 2 === 0 ? COLOR.sandstoneDeep : COLOR.bronze, 0)
    pot.translate(at[0], at[1], at[2])
    parts.push(pot)
  }
  const archGeo = mergeGeometries(parts, false)
  if (!archGeo) throw new Error('cloister architecture')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()

  const src = opts.uniforms
  const uAxis = { value: new Vector2(0, -1) }
  const uCosR = { value: Math.cos((TUNING.cloister.betaR * Math.PI) / 180) }
  const uBrim = { value: 0 }
  const uGlow = { value: 0 }
  const uForecast = { value: 0 }
  const uDeep = { value: 0 }
  const uRing = { value: 0 }
  const uLevel = { value: 0 }
  const uFront = { value: -1 }
  const uC = { value: Number(TUNING.cloister.pin) }
  const uTime = { value: 0 }
  const uProbe = { value: 0 }
  const uOcc = { value: [new Vector3(), new Vector3(), new Vector3(), new Vector3()] }
  const floorMat = new ShaderMaterial({
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
      uSand: src.uSand,
      uGold: src.uGold,
      uAxis,
      uCosR,
      uBrim,
      uGlow,
      uForecast,
      uDeep,
      uRing,
      uProbe,
      uTime,
      uOcc,
    },
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
  })
  const archMat = new ShaderMaterial({
    uniforms: {
      uFogColor: src.uFogColor,
      uFog: src.uFog,
      uFogNear: src.uFogNear,
      uFogFar: src.uFogFar,
      uSand: src.uSand,
      uGold: src.uGold,
      uAxis,
      uCosR,
      uGlow,
      uC,
      uTime,
    },
    vertexShader: ARCH_VERT,
    fragmentShader: ARCH_FRAG,
  })
  const waterMat = new ShaderMaterial({
    uniforms: {
      uFogColor: src.uFogColor,
      uFog: src.uFog,
      uFogNear: src.uFogNear,
      uFogFar: src.uFogFar,
      uGold: src.uGold,
      uPoolDeep: { value: COLOR.poolTeal },
      uPoolShoal: { value: COLOR.poolShoal },
      uAxis,
      uGlow,
      uFront,
      uLevel,
      uTime,
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const floorGeo = new PlaneGeometry(48, 48, 48, 48)
  const floor = new Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.frustumCulled = false
  floor.visible = false
  const arch = new Mesh(archGeo, archMat)
  arch.frustumCulled = false
  arch.visible = false
  const water = new Mesh(buildWater(), waterMat)
  water.frustumCulled = false
  water.renderOrder = 1
  water.visible = false
  opts.scene.add(floor, arch, water)

  const circles: { x: number; z: number; r: number }[] = []
  for (let i = 0; i < columnXZ.length; i += 2) circles.push({ x: columnXZ[i] ?? 0, z: columnXZ[i + 1] ?? 0, r: 0.35 })
  for (let i = 0; i < STELAE.length; i++) {
    const s = STELAE[i]
    if (s) circles.push({ x: s.x, z: s.z, r: s.r })
  }

  let active = false
  let sunRef: SunLike | null = null
  let cycle = Number(TUNING.cloister.pin)
  let level = levelAt(cycle)
  let axisX = 0
  let axisZ = -1
  let cosR = uCosR.value
  let brimOn = false
  let ringOn = false
  let carryTo = 0
  let betaDeg = Number(TUNING.cloister.betaR)
  let maskId = 0
  let flowDirty = true
  let flowAcc = 0
  let flowAnchor = -2
  let flowMs = 0
  const occX = new Float32Array(4)
  const occZ = new Float32Array(4)
  const occR = new Float32Array(4)
  const shoved = { x: 0, z: 0 }
  const steer = { x: 0, z: 0 }
  const spot = { x: 0, z: 0 }
  const info: CloisterInfo = { c: cycle, state: 'fill', level, ringOpen: false, betaR: betaDeg, flowMs: 0, dir: 1, theta: SOUTH }
  const pixel = new Uint8Array(4)
  const ndc = new Vector3()
  const camPt = new Vector3()
  const rayTo = new Vector3()
  const drawSize = new Vector2()

  function direct(x: number, z: number): boolean {
    return sunRef ? sunRef.isLit(x, z) : false
  }
  function originBlocked(px: number, pz: number, len2: number, cx: number, cz: number, r: number): boolean {
    let t = (cx * px + cz * pz) / len2
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const ex = px * t - cx
    const ez = pz * t - cz
    return ex * ex + ez * ez <= r * r
  }
  function reflected(x: number, z: number): boolean {
    if (!brimOn) return false
    const len2 = x * x + z * z
    if (len2 < 1e-8) return false
    const len = Math.sqrt(len2)
    if ((x / len) * axisX + (z / len) * axisZ < cosR) return false
    if (octDist(x, z) < 10) return false
    for (let i = 0; i < PILLARS.length; i++) {
      const p = PILLARS[i]
      if (p && originBlocked(x, z, len2, p.x, p.z, p.r)) return false
    }
    for (let i = 0; i < 4; i++) {
      const r = occR[i] ?? 0
      if (r > 0 && originBlocked(x, z, len2, occX[i] ?? 0, occZ[i] ?? 0, r)) return false
    }
    return true
  }
  function glint(x: number, z: number): boolean {
    if (!ringOn) return false
    const o = octDist(x, z)
    if (o < 6 || o >= 10) return false
    return direct(x, z)
  }
  function isLit(x: number, z: number): boolean {
    if (roofAt(x, z)) return reflected(x, z)
    if (direct(x, z)) return true
    if (reflected(x, z)) return true
    return glint(x, z)
  }
  function underLit(x: number, z: number): boolean {
    return reflected(x, z) || glint(x, z)
  }
  function deep(x: number, z: number): boolean {
    return cycle >= 34 && cycle < 60 && roofAt(x, z) && !isLit(x, z)
  }
  function syncBound(c: number) {
    if (c < 0.6) {
      carryTo = 6 + (c / 0.6) * 4.6
      setCloisterBound(carryTo, true)
    } else if (c < 0.8) {
      carryTo = 10.6 + ((c - 0.6) / 0.2) * 0.6
      setCloisterBound(10, false)
    } else if (c >= 32) {
      carryTo = 0
      setCloisterBound(6, false)
    } else {
      carryTo = 0
      setCloisterBound(10, false)
    }
    ringOn = c >= 32
    brimOn = c >= 8 && c < 26
  }
  function cellOf(x: number, z: number): number {
    if (x < -24 || z < -24 || x >= 24 || z >= 24) return -1
    return (((z + 24) | 0) * CELLS) + ((x + 24) | 0)
  }
  function bake(mask: Uint8Array, minOct: number) {
    setCloisterBound(minOct, false)
    for (let iz = 0; iz < CELLS; iz++) {
      const z = -24 + (iz + 0.5)
      for (let ix = 0; ix < CELLS; ix++) {
        const x = -24 + (ix + 0.5)
        mask[iz * CELLS + ix] = cloisterWalk(x, z, 0.45) ? 0 : 1
      }
    }
  }
  function rebuildFlow(px: number, pz: number) {
    const t0 = performance.now()
    distField.fill(-1)
    flowX.fill(0)
    flowZ.fill(0)
    const mask = maskId === 0 ? maskClosed : maskOpen
    const start = cellOf(px, pz)
    if (start < 0 || mask[start]) {
      flowMs = performance.now() - t0
      return
    }
    distField[start] = 0
    queue[0] = start
    let head = 0
    let tail = 1
    while (head < tail) {
      const c = queue[head] ?? 0
      head++
      const ix = c % CELLS
      const iz = (c / CELLS) | 0
      const base = (distField[c] ?? 0) + 1
      let nx = ix + 1
      let nz = iz
      if (nx >= 0 && nz >= 0 && nx < CELLS && nz < CELLS) {
        const ni = nz * CELLS + nx
        if (!mask[ni] && (distField[ni] ?? -1) < 0) {
          distField[ni] = base
          flowX[ni] = -1
          flowZ[ni] = 0
          queue[tail] = ni
          tail++
        }
      }
      nx = ix - 1
      nz = iz
      if (nx >= 0 && nz >= 0 && nx < CELLS && nz < CELLS) {
        const ni = nz * CELLS + nx
        if (!mask[ni] && (distField[ni] ?? -1) < 0) {
          distField[ni] = base
          flowX[ni] = 1
          flowZ[ni] = 0
          queue[tail] = ni
          tail++
        }
      }
      nx = ix
      nz = iz + 1
      if (nx >= 0 && nz >= 0 && nx < CELLS && nz < CELLS) {
        const ni = nz * CELLS + nx
        if (!mask[ni] && (distField[ni] ?? -1) < 0) {
          distField[ni] = base
          flowX[ni] = 0
          flowZ[ni] = -1
          queue[tail] = ni
          tail++
        }
      }
      nx = ix
      nz = iz - 1
      if (nx >= 0 && nz >= 0 && nx < CELLS && nz < CELLS) {
        const ni = nz * CELLS + nx
        if (!mask[ni] && (distField[ni] ?? -1) < 0) {
          distField[ni] = base
          flowX[ni] = 0
          flowZ[ni] = 1
          queue[tail] = ni
          tail++
        }
      }
    }
    flowMs = performance.now() - t0
  }
  function flowTick(dt: number, px: number, pz: number) {
    const next = ringOn ? 1 : 0
    let hold = false
    if (next !== maskId) {
      maskId = next
      flowDirty = true
      hold = true
    }
    if (dt === 0 && flowDirty) {
      rebuildFlow(px, pz)
      flowDirty = false
      flowAnchor = cellOf(px, pz)
      flowAcc = 0
      return
    }
    if (hold) return
    flowAcc += dt
    if (flowAcc < 0.2) return
    flowAcc = 0
    const cell = cellOf(px, pz)
    if (!flowDirty && cell === flowAnchor) return
    rebuildFlow(px, pz)
    flowDirty = false
    flowAnchor = cell
  }
  function publish() {
    info.c = cycle
    info.state = stateAt(cycle)
    info.level = level
    info.ringOpen = ringOn
    info.betaR = betaDeg
    info.flowMs = flowMs
    info.dir = sunRef ? sunRef.dir : 1
    info.theta = sunRef ? sunRef.angle : SOUTH
  }
  const planOut = {
    darter: 0,
    boss: false,
    rateMul: 1,
    relocate(x: number, z: number, rng: Rng) {
      let sx = x
      let sz = z
      if (rng() < 0.6) {
        const i = (rng() * 12) | 0
        sx = SPAWN[i * 2] ?? sx
        sz = SPAWN[i * 2 + 1] ?? sz
      } else {
        const i = (rng() * 8) | 0
        sx = GARTH[i * 2] ?? sx
        sz = GARTH[i * 2 + 1] ?? sz
      }
      spot.x = sx
      spot.z = sz
      return spot
    },
  }

  return {
    ready: true,
    apply() {
      PILLARS.length = 0
      for (let i = 0; i < STELAE.length; i++) {
        const s = STELAE[i]
        if (s) PILLARS.push({ x: s.x, z: s.z, r: s.r, wing: -1 })
      }
      setCloisterCourt(true, circles)
      bake(maskClosed, 10)
      bake(maskOpen, 6)
      setCloisterBound(10, false)
      maskId = 0
      flowDirty = true
      for (let i = 0; i < opts.hide.length; i++) {
        const mesh = opts.hide[i]
        if (mesh) mesh.visible = false
      }
      floor.visible = true
      arch.visible = true
      water.visible = true
      active = true
    },
    clear(restore) {
      floor.visible = false
      arch.visible = false
      water.visible = false
      setCloisterCourt(false, [])
      active = false
      if (!restore) return
      for (let i = 0; i < opts.restore.length; i++) {
        const mesh = opts.restore[i]
        if (mesh) mesh.visible = true
      }
    },
    warm(renderer, camera) {
      const show = [floor.visible, arch.visible, water.visible]
      floor.visible = true
      arch.visible = true
      water.visible = true
      const prev = uProbe.value
      uProbe.value = 0
      renderer.compile(floor, camera)
      renderer.compile(arch, camera)
      renderer.compile(water, camera)
      uProbe.value = 1
      renderer.compile(floor, camera)
      uProbe.value = prev
      floor.visible = show[0] ?? false
      arch.visible = show[1] ?? false
      water.visible = show[2] ?? false
    },
    pin(sun) {
      sun.frozen = false
      sun.theta0 = SOUTH + sun.dir * TAU * ((TUNING.cloister.pin - 17) / 60)
      sun.time = 0
      sun.advance(0)
      sunRef = sun
    },
    hold(sun, c) {
      sunRef = sun
      sun.frozen = false
      let t = c - TUNING.cloister.pin
      t = ((t % 60) + 60) % 60
      sun.time = t
      sun.advance(0)
      sun.frozen = true
    },
    tick(dt, sun, wide, px, pz) {
      if (!active) return
      sunRef = sun
      cycle = cycleSecond(sun.angle, sun.dir)
      level = levelAt(cycle)
      betaDeg = Math.max(40, Math.min(60, TUNING.cloister.betaR + TUNING.wideDeg * Math.max(0, Math.min(TUNING.wideMax, wide))))
      cosR = Math.cos((betaDeg * Math.PI) / 180)
      axisX = sun.dirX
      axisZ = sun.dirZ
      syncBound(cycle)
      uAxis.value.set(axisX, axisZ)
      uCosR.value = cosR
      uBrim.value = brimOn ? 1 : 0
      uRing.value = ringOn ? 1 : 0
      uLevel.value = level
      uC.value = cycle
      uTime.value = sun.time
      let glow = 0
      if (cycle >= 8 && cycle < 26) glow = cycle < 8.25 ? 1.35 - ((cycle - 8) / 0.25) * 0.35 : 1
      else if (cycle >= 26 && cycle < 26.3) glow = 1 - (cycle - 26) / 0.3
      uGlow.value = glow
      uForecast.value = cycle >= 6 && cycle < 8 ? 1 : 0
      uDeep.value = cycle >= 34 ? (cycle < 34.3 ? (cycle - 34) / 0.3 : 1) : 0
      uFront.value = cycle < 0.6 ? 6 + (cycle / 0.6) * 4.6 : -1
      flowTick(dt, px, pz)
      publish()
    },
    shoveAt(x, z, radius) {
      if (carryTo <= 6) return null
      const o = octDist(x, z)
      const need = carryTo + Math.min(0.05, radius * 0.02)
      if (o < 6 || o >= need) return null
      const s = need / o
      shoved.x = x * s
      shoved.z = z * s
      return shoved
    },
    isLit,
    underLit,
    deep,
    floorY(x, z) {
      if (Math.max(Math.abs(x), Math.abs(z)) >= 18) return 0.3
      const o = octDist(x, z)
      if (o < 6) return -0.9
      if (o < 10) return ringOn ? -0.3 : -0.05
      return 0
    },
    guide(x, z, px, pz) {
      const dx = px - x
      const dz = pz - z
      if (dx * dx + dz * dz <= 1.44) return null
      if (!segmentBlocked(x, z, px, pz)) return null
      const c = cellOf(x, z)
      if (c < 0) return null
      const mask = maskId === 0 ? maskClosed : maskOpen
      if (mask[c]) return null
      const sx = flowX[c] ?? 0
      const sz = flowZ[c] ?? 0
      if (sx === 0 && sz === 0) return null
      steer.x = sx
      steer.z = sz
      return steer
    },
    plan(time) {
      planOut.darter = time >= 90 ? 0.1 * Math.min(1, (time - 90) / 90) : 0
      planOut.boss = false
      let mul = time >= 120 ? 1.1 : 1
      if (cycle >= 8 && cycle < 26) mul *= 0.9
      else if (cycle >= 34) mul *= 1.1
      planOut.rateMul = mul
      return planOut
    },
    info() {
      publish()
      return info
    },
    setOccluder(i, circle) {
      if (i < 0 || i > 3) return
      const slot = uOcc.value[i]
      if (!slot) return
      if (!circle || circle.r <= 0) {
        occR[i] = 0
        slot.set(0, 0, 0)
        return
      }
      occX[i] = circle.x
      occZ[i] = circle.z
      occR[i] = circle.r
      slot.set(circle.x, circle.z, circle.r)
    },
    cover() {
      let n = 0
      let litN = 0
      let aN = 0
      let aLit = 0
      for (let iz = 0; iz < CELLS; iz++) {
        const z = -24 + (iz + 0.5)
        for (let ix = 0; ix < CELLS; ix++) {
          const x = -24 + (ix + 0.5)
          if (!cloisterWalk(x, z, 0.45)) continue
          n++
          const lit = isLit(x, z)
          if (lit) litN++
          if (Math.max(Math.abs(x), Math.abs(z)) >= 18) {
            aN++
            if (lit) aLit++
          }
        }
      }
      return { exposed: n ? litN / n : 0, arcade: aN ? aLit / aN : 0, n, arcadeN: aN }
    },
    agree(renderer, camera, points, hide) {
      const prevOwn = [floor.visible, arch.visible, water.visible]
      const prevHide = hide.map((mesh) => mesh.visible)
      arch.visible = false
      water.visible = false
      floor.visible = true
      for (let i = 0; i < hide.length; i++) {
        const mesh = hide[i]
        if (mesh) mesh.visible = false
      }
      uProbe.value = 1
      camera.updateMatrixWorld()
      renderer.render(opts.scene as import('three').Scene, camera)
      const gl = renderer.getContext() as WebGL2RenderingContext
      renderer.getDrawingBufferSize(drawSize)
      let tested = 0
      let agreed = 0
      const floorHit = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) => {
        if (dy > -1e-6 && dy < 1e-6) return null
        const planes = [0.3, 0, -0.3, -0.42, -1.05]
        let bestT = 1e9
        let hx = 0
        let hz = 0
        let found = false
        for (let p = 0; p < planes.length; p++) {
          const y = planes[p] ?? 0
          const t = (y - oy) / dy
          if (t <= 0 || t >= bestT) continue
          const x = ox + dx * t
          const z = oz + dz * t
          const span = Math.max(Math.abs(x), Math.abs(z))
          const dist = octDist(x, z)
          const expect = span >= 18 ? 0.3 : dist < 6 ? -1.05 : dist < 10 ? (ringOn ? -0.3 : -0.42) : 0
          if (Math.abs(expect - y) > 0.02) continue
          bestT = t
          hx = x
          hz = z
          found = true
        }
        return found ? { x: hx, z: hz } : null
      }
      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        if (!point) continue
        const cheb = Math.max(Math.abs(point.x), Math.abs(point.z))
        const o = octDist(point.x, point.z)
        const floorY = cheb >= 18 ? 0.3 : o < 6 ? -1.05 : o < 10 ? (ringOn ? -0.3 : -0.42) : 0
        ndc.set(point.x, floorY, point.z)
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
        camera.getWorldPosition(camPt)
        rayTo.set((px + 0.5) / drawSize.x * 2 - 1, (py + 0.5) / drawSize.y * 2 - 1, 0.5).unproject(camera)
        rayTo.sub(camPt)
        const hit = floorHit(camPt.x, camPt.y, camPt.z, rayTo.x, rayTo.y, rayTo.z)
        if (!hit) continue
        tested++
        if (isLit(hit.x, hit.z) === bright) agreed++
      }
      uProbe.value = 0
      floor.visible = prevOwn[0] ?? false
      arch.visible = prevOwn[1] ?? false
      water.visible = prevOwn[2] ?? false
      for (let i = 0; i < hide.length; i++) {
        const mesh = hide[i]
        if (mesh) mesh.visible = prevHide[i] ?? false
      }
      return { tested, agree: agreed }
    },
    benchLit() {
      const t0 = performance.now()
      let n = 0
      for (let i = 0; i < 400; i++) {
        const x = ((i % 25) - 12) * 1.4
        const z = -12 - ((i / 25) | 0)
        if (isLit(x, z)) n++
      }
      return { ms: performance.now() - t0, lit: n }
    },
    tris: () => ({
      floor: triCount(floor.geometry),
      arch: triCount(arch.geometry),
      water: triCount(water.geometry),
    }),
  }
}
