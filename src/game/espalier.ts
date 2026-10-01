import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { yawFromDirection } from '../core/math'
import { COLOR } from '../data/palette'
import { TUNING, type DamageSource } from '../data/tuning'
import { slideCircle } from './collision'

const LANES = [-12, -6, 0, 6, 12]
const SEEN = 64
const LEAF_N = 64
// Visual only. The hurt circle stays on the wall at the gameplay x/z.
const VIS_SCALE = 1.4
const VIS_X = -1.6
const VIS_Z = 4.8

export interface EspalierHooks {
  lit: (x: number, z: number) => boolean
  hurt: (amount: number) => void
  spawn: (x: number, z: number) => void
  cull: () => void
  cover: (inset: number) => void
  floor: (z: number) => number
  wake: () => void
  rake: () => void
  slam: () => void
}

export interface EspalierInfo {
  hp: number
  max: number
  phase: 0 | 1 | 2 | 3
  x: number
  z: number
  r: number
  exposed: boolean
  tele: boolean
  lane: number
  dead: boolean
}

export interface Espalier {
  mesh: Mesh
  tele: Mesh
  update: (dt: number, time: number, px: number, pz: number, upperOpen: boolean) => void
  hit: (x: number, z: number, radius: number, base: number, source: DamageSource, might: number, stamp: number) => boolean
  alive: () => boolean
  awake: () => boolean
  info: () => EspalierInfo
  reset: () => void
}

function stamp(geo: BufferGeometry, color: Color, emit: number): BufferGeometry {
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const emits = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
    emits[i] = emit
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  geo.setAttribute('aEmit', new BufferAttribute(emits, 1))
  return geo
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: Color,
  emit: number,
  rotY = 0,
  rotZ = 0,
): BufferGeometry {
  const geo = new BoxGeometry(w, h, d)
  if (rotZ) geo.rotateZ(rotZ)
  if (rotY) geo.rotateY(rotY)
  geo.translate(x, y, z)
  return stamp(geo, color, emit)
}

function coin(x: number, y: number, z: number): BufferGeometry {
  const geo = new CylinderGeometry(0.28, 0.28, 0.07, 8)
  geo.translate(x, y, z)
  return stamp(geo, COLOR.heartGold, 1)
}

function bodyGeo(): BufferGeometry {
  const wood = COLOR.trunk
  const light = COLOR.trunkLight
  const gold = COLOR.latticeGold
  const tie = COLOR.tie
  const heart = COLOR.heartGold
  const parts = [
    box(0.62, 1.35, 0.38, 0.04, 0.7, 0.0, wood, 0, 0.18),
    box(0.48, 1.35, 0.32, -0.06, 2.0, 0.02, wood, 0, -0.22),
    box(0.38, 1.3, 0.28, 0.05, 3.25, 0.02, light, 0, 0.16),
    box(0.28, 1.15, 0.22, -0.02, 4.4, 0.04, light, 0, -0.12),
    box(0.1, 4.6, 0.06, 0.02, 2.7, 0.12, heart, 2),
    box(5.4, 0.14, 0.12, 0, 1.55, 0.06, wood, 0),
    box(4.6, 0.13, 0.11, 0, 2.7, 0.07, wood, 0),
    box(3.6, 0.12, 0.1, 0, 3.85, 0.08, light, 0),
    box(2.4, 0.11, 0.1, 0, 4.95, 0.08, light, 0),
    box(0.07, 4.7, 0.06, -2.35, 2.7, -0.1, gold, 0),
    box(0.07, 4.7, 0.06, -1.15, 2.7, -0.1, gold, 0),
    box(0.07, 4.7, 0.06, 1.15, 2.7, -0.1, gold, 0),
    box(0.07, 4.7, 0.06, 2.35, 2.7, -0.1, gold, 0),
    box(5.6, 0.06, 0.05, 0, 1.55, -0.12, gold, 0),
    box(4.8, 0.06, 0.05, 0, 2.7, -0.12, gold, 0),
    box(3.8, 0.06, 0.05, 0, 3.85, -0.12, gold, 0),
    box(2.6, 0.06, 0.05, 0, 4.95, -0.12, gold, 0),
    box(1.7, 0.05, 0.05, -1.15, 2.15, -0.1, gold, 0, 0, 0.7),
    box(1.7, 0.05, 0.05, 1.15, 2.15, -0.1, gold, 0, 0, -0.7),
    box(1.5, 0.05, 0.05, -0.85, 3.3, -0.1, gold, 0, 0, 0.65),
    box(1.5, 0.05, 0.05, 0.85, 3.3, -0.1, gold, 0, 0, -0.65),
    box(0.1, 0.1, 0.1, -2.35, 1.55, -0.02, tie, 0),
    box(0.1, 0.1, 0.1, 2.35, 1.55, -0.02, tie, 0),
    box(0.1, 0.1, 0.1, -1.9, 2.7, -0.02, tie, 0),
    box(0.1, 0.1, 0.1, 1.9, 2.7, -0.02, tie, 0),
    box(0.1, 0.1, 0.1, -1.4, 3.85, -0.02, tie, 0),
    box(0.1, 0.1, 0.1, 1.4, 3.85, -0.02, tie, 0),
    box(0.1, 0.1, 0.1, -0.9, 4.95, -0.02, tie, 0),
    box(0.1, 0.1, 0.1, 0.9, 4.95, -0.02, tie, 0),
    box(0.1, 0.1, 0.1, 0, 2.7, 0.08, tie, 0),
    coin(-2.35, 1.62, 0.2),
    coin(2.35, 1.62, 0.2),
    coin(-1.7, 2.78, 0.2),
    coin(1.7, 2.78, 0.2),
    coin(-1.15, 3.93, 0.22),
    coin(1.15, 3.93, 0.22),
    coin(0, 5.05, 0.22),
  ]
  const geo = mergeGeometries(parts, false)
  if (!geo) throw new Error('espalier merge failed')
  for (let i = 0; i < parts.length; i++) parts[i]?.dispose()
  return geo
}

function leafGeometry(): BufferGeometry {
  const geo = new BufferGeometry()
  const pos = new Float32Array([
    -0.2, 0, 0,
    0.2, 0, 0,
    0, 0.08, 0.28,
    0, 0.16, 0.5,
  ])
  const col = new Float32Array(12)
  const src = [COLOR.leafInk, COLOR.leafInk, COLOR.foliage, COLOR.foliageRim]
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (!c) continue
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('color', new BufferAttribute(col, 3))
  geo.setIndex([0, 1, 2, 1, 3, 2, 0, 2, 3])
  return geo
}

export function createEspalier(hooks: EspalierHooks): Espalier {
  const uTime = { value: 0 }
  const uHit = { value: 0 }
  const uShudder = { value: 0 }
  const uPhase = { value: 1 }
  const uFill = { value: 0 }
  const uRound = { value: 0 }
  const mesh = new Mesh(
    bodyGeo(),
    new ShaderMaterial({
      uniforms: { uTime, uHit, uShudder, uPhase },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float aEmit;
        uniform float uTime;
        uniform float uHit;
        uniform float uShudder;
        varying vec3 vColor;
        varying float vEmit;
        void main() {
          vColor = color;
          vEmit = aEmit;
          vec3 p = position;
          float h = max(position.y, 0.0);
          p.x += sin(uTime * 1.35 + position.x * 0.6) * h * 0.015;
          p.x += sin(uTime * 26.0 + position.y) * uShudder * h * 0.025;
          p.z += -uHit * h * 0.035;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        varying float vEmit;
        uniform float uPhase;
        uniform float uTime;
        void main() {
          vec3 col = vColor;
          float glow = 0.0;
          if (vEmit > 1.5) {
            float pulse = uPhase > 2.5 ? 0.55 + 0.45 * sin(uTime * 6.0) : (uPhase > 1.5 ? 0.7 : 0.22);
            glow = pulse;
            col = mix(col, vec3(1.0, 0.84, 0.38), 0.55);
          } else if (vEmit > 0.5) {
            glow = 0.9;
          }
          col += col * glow;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  )
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.visible = false
  mesh.scale.setScalar(VIS_SCALE)

  const leaves = new InstancedMesh(
    leafGeometry(),
    new ShaderMaterial({
      uniforms: { uTime, uHit, uShudder },
      side: DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 color;
        uniform float uTime;
        uniform float uHit;
        uniform float uShudder;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec3 p = position;
          p.x += sin(uTime * 1.7 + position.z * 6.0) * 0.05 * (1.0 + uShudder);
          vec4 local = instanceMatrix * vec4(p, 1.0);
          float h = local.y;
          local.x += sin(uTime * 1.35 + local.x * 0.6) * h * 0.015;
          local.x += sin(uTime * 26.0) * uShudder * h * 0.02;
          local.z += -uHit * h * 0.035;
          gl_Position = projectionMatrix * modelViewMatrix * local;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
    LEAF_N,
  )
  leaves.frustumCulled = false
  leaves.castShadow = false
  leaves.receiveShadow = false
  leaves.count = LEAF_N
  mesh.add(leaves)

  const dummy = new Object3D()
  const lx = new Float32Array(LEAF_N)
  const ly = new Float32Array(LEAF_N)
  const lz = new Float32Array(LEAF_N)
  const lrx = new Float32Array(LEAF_N)
  const lry = new Float32Array(LEAF_N)
  const lrz = new Float32Array(LEAF_N)
  const lsc = new Float32Array(LEAF_N)
  const life = new Float32Array(LEAF_N)
  const vx = new Float32Array(LEAF_N)
  const vy = new Float32Array(LEAF_N)
  const vz = new Float32Array(LEAF_N)
  const homeX = new Float32Array(LEAF_N)
  const homeY = new Float32Array(LEAF_N)
  const homeZ = new Float32Array(LEAF_N)
  let shedSalt = 1
  let falling = 0

  function restLeaf(i: number) {
    const tier = i % 4
    const slot = (i / 4) | 0
    const along = slot % 8
    const row = (slot / 8) | 0
    const y = 1.45 + tier * 1.15
    const span = 2.35 - tier * 0.32
    const x = -span + (along / 7) * span * 2
    homeX[i] = x + ((i * 5) % 7 - 3) * 0.05
    homeY[i] = y + (row - 0.5) * 0.1
    homeZ[i] = 0.16 + (i % 3) * 0.07
    lx[i] = homeX[i] ?? 0
    ly[i] = homeY[i] ?? 0
    lz[i] = homeZ[i] ?? 0
    lrx[i] = -0.2 + (i % 5) * 0.08
    lry[i] = (i % 9) * 0.4
    lrz[i] = i % 2 === 0 ? 0.15 : -0.15
    lsc[i] = 1.15 + (i % 4) * 0.16
    life[i] = 0
  }

  function writeLeaf(i: number) {
    dummy.position.set(lx[i] ?? 0, ly[i] ?? 0, lz[i] ?? 0)
    dummy.rotation.set(lrx[i] ?? 0, lry[i] ?? 0, lrz[i] ?? 0)
    const base = lsc[i] ?? 1
    const s = (life[i] ?? 0) > 0 ? Math.max(0.04, (life[i] ?? 0) / 0.7) * base : base
    dummy.scale.setScalar(s)
    dummy.updateMatrix()
    leaves.setMatrixAt(i, dummy.matrix)
  }

  function plantLeaves() {
    falling = 0
    for (let i = 0; i < LEAF_N; i++) {
      restLeaf(i)
      writeLeaf(i)
    }
    leaves.instanceMatrix.needsUpdate = true
  }
  plantLeaves()

  function shed(n: number) {
    shedSalt = (shedSalt + 17) | 0
    let left = n
    for (let k = 0; k < LEAF_N && left > 0; k++) {
      const i = (shedSalt + k * 11) % LEAF_N
      if ((life[i] ?? 0) > 0) continue
      life[i] = 0.7
      vx[i] = (((i * 13) % 7) - 3) * 0.45
      vy[i] = 1.1 + (i % 3) * 0.35
      vz[i] = 0.9 + (i % 4) * 0.15
      falling++
      left--
    }
  }

  function stepLeaves(dt: number) {
    if (falling <= 0) return
    for (let i = 0; i < LEAF_N; i++) {
      if ((life[i] ?? 0) <= 0) continue
      life[i] = (life[i] ?? 0) - dt
      if ((life[i] ?? 0) <= 0) {
        life[i] = 0
        lx[i] = homeX[i] ?? 0
        ly[i] = homeY[i] ?? 0
        lz[i] = homeZ[i] ?? 0
        falling = Math.max(0, falling - 1)
      } else {
        vy[i] = (vy[i] ?? 0) - 4.5 * dt
        lx[i] = (lx[i] ?? 0) + (vx[i] ?? 0) * dt
        ly[i] = (ly[i] ?? 0) + (vy[i] ?? 0) * dt
        lz[i] = (lz[i] ?? 0) + (vz[i] ?? 0) * dt
        lry[i] = (lry[i] ?? 0) + dt * 2.4
      }
      writeLeaf(i)
    }
    leaves.instanceMatrix.needsUpdate = true
  }

  const tele = new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms: {
        uFill,
        uRound,
        uWarn: { value: COLOR.warn },
        uGold: { value: COLOR.latticeGold },
        uInk: { value: COLOR.ink },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uFill;
        uniform float uRound;
        uniform vec3 uWarn;
        uniform vec3 uGold;
        uniform vec3 uInk;
        void main() {
          vec2 c = vUv - 0.5;
          float radial = length(c) * 2.0;
          float across = abs(c.x) * 2.0;
          float along = vUv.y;
          float side = mix(across, radial, uRound);
          float sweep = mix(along, radial, uRound);
          float body = smoothstep(0.05, 0.72, side);
          float filled = smoothstep(0.06, 0.0, (1.0 - uFill) - sweep);
          float rim = smoothstep(0.58, 0.86, side) * (1.0 - smoothstep(0.98, 1.02, side));
          float edge = smoothstep(0.9, 0.99, side);
          float lead = smoothstep(0.1, 0.0, abs(sweep - (1.0 - uFill))) * filled;
          float a = filled * (0.2 + 0.24 * body);
          vec3 col = uWarn;
          a = max(a, rim * 0.92);
          col = mix(col, uGold, clamp(rim * 3.0 + lead, 0.0, 1.0));
          a = max(a, edge * 0.88);
          col = mix(col, uInk, clamp(edge * 3.0, 0.0, 1.0));
          a = max(a, lead * 0.75);
          if (a < 0.03) discard;
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
    }),
  )
  tele.rotation.x = -Math.PI / 2
  tele.frustumCulled = false
  tele.visible = false
  tele.renderOrder = 3

  const spec = TUNING.espalier
  let hp: number = spec.hp
  let woken = false
  let dead = false
  let x = 0
  let z = -24
  let phase: 0 | 1 | 2 | 3 = 0
  let upper = false
  let exposed = false
  let playerZ = 0
  let attack = 1.2
  let telegraph = 0
  let lane = 0
  let slamming = false
  let addAt = 0
  const seen: number[] = []
  const seenAt: number[] = []
  let areaAt = -10
  let clock = 0

  function enraged(time: number): boolean {
    return time >= spec.enrage
  }

  function place() {
    mesh.position.set(x + VIS_X, hooks.floor(z), z + VIS_Z)
    mesh.visible = woken && !dead
    uPhase.value = phase
    const show = telegraph > 0 && woken && !dead
    tele.visible = show
    if (!show) return
    const y = hooks.floor(slamming ? z : -16) + 0.12
    const dur = slamming ? spec.slamTele : spec.rakeTele
    uFill.value = 1 - Math.min(1, telegraph / Math.max(0.01, dur))
    if (slamming) {
      tele.position.set(x, y, z)
      const d = spec.slamRange * 2
      tele.scale.set(d, d, 1)
      uRound.value = 1
    } else {
      const laneX = LANES[lane] ?? 0
      tele.position.set(laneX, y, -15.5)
      tele.scale.set(spec.rakeWidth, 15, 1)
      uRound.value = 0
    }
  }

  function setPhase(next: 1 | 2 | 3) {
    if (next === phase) return
    phase = next
    if (next === 1) hooks.cover(0)
    else if (next === 2) hooks.cover(spec.insetPrune)
    else hooks.cover(spec.insetOpen)
    uShudder.value = 1
    shed(next === 1 ? 10 : 16)
  }

  function phaseNow(): 1 | 2 | 3 {
    const ratio = hp / spec.hp
    if (ratio > 0.6) return 1
    if (ratio > 0.25) return 2
    return 3
  }

  return {
    mesh,
    tele,
    alive: () => woken && !dead,
    awake: () => woken,
    reset() {
      hp = spec.hp
      woken = false
      dead = false
      x = 0
      z = -24
      phase = 0
      upper = false
      exposed = false
      telegraph = 0
      slamming = false
      attack = 1.2
      addAt = 0
      lane = 0
      seen.length = 0
      seenAt.length = 0
      areaAt = -10
      uHit.value = 0
      uShudder.value = 0
      uPhase.value = 1
      plantLeaves()
      hooks.cover(0)
      mesh.visible = false
      tele.visible = false
    },
    info: () => ({
      hp,
      max: spec.hp,
      phase,
      x,
      z,
      r: spec.body,
      exposed,
      tele: telegraph > 0,
      lane: slamming ? -1 : (LANES[lane] ?? 0),
      dead,
    }),
    update(dt, time, px, pz, upperOpen) {
      uTime.value = time
      uHit.value = Math.max(0, uHit.value - dt * 3.2)
      uShudder.value = Math.max(0, uShudder.value - dt * 1.7)
      stepLeaves(dt)
      upper = upperOpen
      playerZ = pz
      clock = time
      if (dead) {
        place()
        return
      }
      if (!woken) {
        if (time < spec.wake) return
        woken = true
        hp = spec.hp
        setPhase(1)
        hooks.cull()
        hooks.wake()
        addAt = time
      }
      const next = phaseNow()
      if (phase !== 0 && next !== phase) {
        if (next === 3) {
          telegraph = 0
          slamming = false
        }
        setPhase(next)
      }
      const fast = enraged(time) ? 1.5 : 1
      exposed = upper || hooks.lit(x, z)
      if (phase === 3) {
        const dx = px - x
        const dz = pz - z
        const dist = Math.hypot(dx, dz) || 1
        const step = spec.speed * fast * dt
        const ox = x
        const oz = z
        x = ox + (dx / dist) * step
        z = oz + (dz / dist) * step
        const slid = slideCircle(ox, oz, x, z, 0.8)
        x = slid.x
        z = slid.z
        mesh.rotation.y = yawFromDirection(dx, dz)
      } else {
        mesh.rotation.y = 0
      }
      if (phase === 2 && time - addAt >= 8 / fast) {
        addAt = time
        hooks.spawn(x - 6, -6)
        hooks.spawn(x + 6, -6)
      }
      attack -= dt
      if (telegraph > 0) {
        telegraph -= dt
        if (telegraph <= 0) {
          if (slamming) {
            const dx = px - x
            const dz = pz - z
            if (dx * dx + dz * dz <= spec.slamRange * spec.slamRange) hooks.hurt(spec.slam)
            slamming = false
          } else {
            const laneX = LANES[lane] ?? 0
            const half = spec.rakeWidth * 0.5
            if (Math.abs(px - laneX) <= half && pz <= -8 && pz >= -23) hooks.hurt(spec.rake)
            lane = (lane + 1) % LANES.length
          }
          attack = (phase === 3 ? 3.2 : spec.rakeEvery) / fast
        }
      } else if (attack <= 0) {
        telegraph = phase === 3 ? spec.slamTele : spec.rakeTele
        slamming = phase === 3
        if (slamming) hooks.slam()
        else hooks.rake()
      }
      place()
    },
    hit(hx, hz, radius, base, source, might, stamp) {
      void source
      if (!woken || dead) return false
      const dx = hx - x
      const dz = hz - z
      const reach = radius + spec.body
      if (dx * dx + dz * dz > reach * reach) return false
      if (phase < 3 && playerZ > -8) return false
      const now = clock
      if (stamp === 0) {
        if (now - areaAt < 0.35) return false
        areaAt = now
      } else if (stamp >= 10 && stamp < 20) {
        const prev = seenAt[stamp] ?? -10
        if (now - prev < TUNING.halo.hitEvery) return false
        seenAt[stamp] = now
      } else if (seen.includes(stamp)) {
        return false
      } else {
        if (seen.length >= SEEN) {
          seen.shift()
        }
        seen.push(stamp)
      }
      const light = exposed ? TUNING.exposedDamage : 0.35
      const amount = base * (1 + TUNING.passive.might * might) * light
      hp -= amount
      uHit.value = 1
      shed(8)
      if (hp <= 0) {
        hp = 0
        dead = true
        telegraph = 0
        tele.visible = false
      }
      return true
    },
  }
}
