import {
  BoxGeometry,
  BufferAttribute,
  CapsuleGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  type Scene,
} from 'three'
import { TUNING } from '../data/tuning'
import { COLOR } from '../data/palette'
import { forwardFromYaw } from '../core/math'
import { hashBuild, hashQuery } from './spatialHash'
import {
  PILLARS,
  gateOpen,
  insideArena,
  resolveCircle,
  segmentBlocked,
  setSlabs,
  type AABB,
} from './collision'
import type { Horde, HordeCtx } from './enemies/horde'
import type { Player } from './player'
import { toonMap } from '../render/toon'
import { noteBlocks, type Temple } from './temple'

const MAX_PLATE = 12
const QUERY = new Int16Array(48)
const SEEN = new Int32Array(TUNING.hordeCap)
let seenStamp = 1
const face = { x: 0, z: 0 }
const dummy = new Object3D()
const slabBoxes: AABB[] = []

function paintSlab(geo: BoxGeometry, warn: InstancedBufferAttribute) {
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const rim = new Float32Array(pos.count)
  const tmp = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const edge = Math.max(Math.abs(x) / 1.5, Math.abs(z) / 1.5)
    const onTop = y > 0.2
    const isRim = onTop && edge > 0.78
    if (isRim) tmp.copy(COLOR.gold)
    else if (onTop) tmp.copy(COLOR.sandstone).lerp(COLOR.goldHot, 0.22)
    else tmp.copy(COLOR.bronze).lerp(COLOR.sandstone, 0.4 + 0.45 * ((y + 0.275) / 0.55))
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
    rim[i] = isRim ? 1 : 0
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  geo.setAttribute('aRim', new BufferAttribute(rim, 1))
  geo.setAttribute('iWarn', warn)
}

const plateVert = /* glsl */ `
attribute float iType;
attribute float iCharge;
attribute float iLit;
attribute float iAng;
varying vec2 vQ;
varying float vType;
varying float vCharge;
varying float vLit;
varying float vAng;
void main() {
  vQ = position.xz;
  vType = iType;
  vCharge = iCharge;
  vLit = iLit;
  vAng = iAng;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`
const plateFrag = /* glsl */ `
precision highp float;
varying vec2 vQ;
varying float vType;
varying float vCharge;
varying float vLit;
varying float vAng;
void main() {
  vec2 p = vQ;
  float c = cos(vAng);
  float s = sin(vAng);
  vec2 r = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  vec3 bronze = vec3(0.30, 0.16, 0.07);
  vec3 gold = vec3(0.96, 0.74, 0.28);
  vec3 hot = vec3(1.0, 0.86, 0.45);
  float body = 1.0;
  float glyph = 0.0;
  if (vType < 0.5) {
    body = smoothstep(1.0, 0.86, length(p));
    glyph = smoothstep(0.46, 0.34, length(r * vec2(1.15, 2.2)));
    float pipA = smoothstep(0.11, 0.07, length(p - vec2(-0.38, -0.62)));
    float pipB = smoothstep(0.11, 0.07, length(p - vec2(0.38, -0.62)));
    glyph = max(glyph, pipA * step(0.5, vCharge));
    glyph = max(glyph, pipB * step(1.5, vCharge));
  } else if (vType < 1.5) {
    body = step(abs(p.x), 0.92) * step(abs(p.y), 0.92);
    float hatch = step(0.55, abs(fract((p.x + p.y) * 3.5) - 0.5) * 2.0);
    glyph = step(max(abs(p.x), abs(p.y)), 0.55) * hatch;
  } else if (vType < 2.5) {
    float fill = clamp(vCharge, 0.0, 1.0);
    body = smoothstep(1.0, 0.88, length(p));
    float core = smoothstep(fill, fill - 0.08, length(p));
    glyph = core;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec2 dir = vec2(cos(a), sin(a));
      float along = dot(p, dir);
      float side = abs(p.x * dir.y - p.y * dir.x);
      float ray = step(0.28, along) * step(along, 0.78) * step(side, 0.07);
      glyph = max(glyph, ray);
    }
  } else {
    body = step(abs(p.x) + abs(p.y), 0.92);
    float t = clamp(vCharge, 0.0, 1.0);
    glyph = step(abs(p.x) + abs(p.y), 0.35 + t * 0.4);
  }
  if (body < 0.5) discard;
  vec3 base = mix(bronze, gold, clamp(vLit, 0.0, 1.0));
  vec3 mark = mix(hot, bronze, clamp(vLit, 0.0, 1.0));
  vec3 col = mix(base, mark, glyph);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface TrapEvents {
  fire: number
  warn: number
  slam: number
  launch: boolean
  land: boolean
  relic: boolean
  mirage: boolean
  hum: number
  shake: number
  stop: number
  dustX: number
  dustZ: number
}

export interface TrapBlobs {
  x: number
  z: number
  scale: number
}

export interface Traps {
  attach: (scene: Scene) => void
  reset: (temple: Temple) => void
  begin: (dt: number, player: Player) => boolean
  after: (
    dt: number,
    player: Player,
    wishX: number,
    wishZ: number,
    horde: Horde,
    ctx: HordeCtx,
    isLit: (x: number, z: number) => boolean,
    owned: boolean,
    haste: number,
    use: boolean,
  ) => void
  blocksCut: () => boolean
  phasing: () => boolean
  lift: () => number
  decoyX: () => number
  decoyZ: () => number
  decoyR2: () => number
  ready: () => number
  ring: () => { x: number; z: number; on: boolean }
  phases: () => number[]
  events: TrapEvents
  blobs: TrapBlobs[]
}

function emptyEvents(): TrapEvents {
  return { fire: 0, warn: 0, slam: 0, launch: false, land: false, relic: false, mirage: false, hum: 0, shake: 0, stop: 0, dustX: 0, dustZ: 0 }
}

function beamReach(x: number, z: number, dx: number, dz: number, maxLen: number): number {
  const endX = x + dx * maxLen
  const endZ = z + dz * maxLen
  if (!segmentBlocked(x, z, endX, endZ)) return maxLen
  let lo = 0.4
  let hi = maxLen
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) * 0.5
    if (segmentBlocked(x, z, x + dx * mid, z + dz * mid)) hi = mid
    else lo = mid
  }
  return lo
}

export function createTraps(): Traps {
  const pips = new Float32Array(MAX_PLATE)
  const frac = new Float32Array(MAX_PLATE)
  const lock = new Float32Array(MAX_PLATE)
  const phase = new Uint8Array(MAX_PLATE)
  const timer = new Float32Array(MAX_PLATE)
  const aimX = new Float32Array(MAX_PLATE)
  const aimZ = new Float32Array(MAX_PLATE)
  const beamOf = new Int8Array(MAX_PLATE)
  beamOf.fill(-1)
  const bOn = [false, false, false]
  const bX = [0, 0, 0]
  const bZ = [0, 0, 0]
  const bDx = [1, 0, 0]
  const bDz = [0, 0, 0]
  const bLen = [1, 1, 1]
  const bLife = [0, 0, 0]
  const bWind = [0, 0, 0]
  const bPlate = [-1, -1, -1]
  let plates: Temple['plates'] = []
  let flying = false
  let flightT = 0
  let fromX = 0
  let fromZ = 0
  let toX = 0
  let toZ = 0
  let liftY = 0
  let stepLeft = 0
  let stepDx = 0
  let stepDz = 0
  let stepSpeed = 0
  let ghost = 0
  let decoyT = 0
  let decoyAtX = 0
  let decoyAtZ = 0
  let mirageCd = 0
  let mirageSpan: number = TUNING.temple.mirageCd
  let lastAx = 0
  let lastAz = -1
  let slabMark = -1
  let pendingLand = false
  let gotRelic = false
  let landSeq = 1
  const landedAt = new Float32Array(MAX_PLATE)
  const events = emptyEvents()
  const blobs: TrapBlobs[] = []
  const plateGeo = new PlaneGeometry(2, 2)
  plateGeo.rotateX(-Math.PI / 2)
  const typeA = new InstancedBufferAttribute(new Float32Array(MAX_PLATE), 1)
  const chargeA = new InstancedBufferAttribute(new Float32Array(MAX_PLATE), 1)
  const litA = new InstancedBufferAttribute(new Float32Array(MAX_PLATE), 1)
  const angA = new InstancedBufferAttribute(new Float32Array(MAX_PLATE), 1)
  plateGeo.setAttribute('iType', typeA)
  plateGeo.setAttribute('iCharge', chargeA)
  plateGeo.setAttribute('iLit', litA)
  plateGeo.setAttribute('iAng', angA)
  const plateMat = new ShaderMaterial({ vertexShader: plateVert, fragmentShader: plateFrag })
  const plateMesh = new InstancedMesh(plateGeo, plateMat, MAX_PLATE)
  plateMesh.count = 0
  plateMesh.visible = false
  plateMesh.frustumCulled = false
  const slabGeo = new BoxGeometry(3, 0.55, 3)
  const slabWarn = new InstancedBufferAttribute(new Float32Array(4), 1)
  paintSlab(slabGeo, slabWarn)
  const slabClock = { value: 0 }
  const slabMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap(), vertexColors: true })
  slabMat.customProgramCacheKey = () => 'slab-rim'
  slabMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSlabTime = slabClock
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRim;\nattribute float iWarn;\nvarying float vSlabPulse;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlabPulse = aRim * iWarn;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSlabTime;\nvarying float vSlabPulse;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb += vec3(1.0, 0.58, 0.16) * vSlabPulse * (0.45 + 0.55 * sin(uSlabTime * 9.0));',
      )
  }
  const slabMesh = new InstancedMesh(slabGeo, slabMat, 4)
  slabMesh.count = 0
  slabMesh.visible = false
  slabMesh.frustumCulled = false
  const beamGeo = new BoxGeometry(TUNING.temple.mirrorWide, 0.12, 1)
  const beamMesh = new InstancedMesh(beamGeo, new MeshBasicMaterial({ color: COLOR.gold, toneMapped: false }), 3)
  beamMesh.count = 0
  beamMesh.visible = false
  beamMesh.frustumCulled = false
  const ring = new Mesh(
    new RingGeometry(TUNING.temple.springRadius - 0.45, TUNING.temple.springRadius, 28),
    new MeshBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.85, depthWrite: false }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.06
  ring.visible = false
  const decoy = new Mesh(
    new CapsuleGeometry(0.32, 0.7, 2, 6),
    new MeshLambertMaterial({ color: COLOR.linen, transparent: true, opacity: 0.55 }),
  )
  decoy.position.y = 0.75
  decoy.visible = false
  const altarRing = new Mesh(
    new RingGeometry(0.7, 0.95, 20),
    new MeshBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.9, depthWrite: false }),
  )
  altarRing.rotation.x = -Math.PI / 2
  altarRing.position.y = 0.08
  altarRing.visible = false

  function clearEvents() {
    events.fire = 0
    events.warn = 0
    events.slam = 0
    events.launch = false
    events.land = false
    events.relic = false
    events.mirage = false
    events.hum = 0
    events.shake = 0
    events.stop = 0
    events.dustX = 0
    events.dustZ = 0
    blobs.length = 0
  }

  function anyOpen(): boolean {
    return gateOpen[0] || gateOpen[1] || gateOpen[2] || gateOpen[3]
  }

  function syncSlabs() {
    slabBoxes.length = 0
    let newest = -1
    let newestAt = -1
    let mark = 0
    for (let i = 0; i < plates.length; i++) {
      const plate = plates[i]
      if (!plate || plate.kind !== 'slab' || phase[i] !== 2) continue
      slabBoxes.push({
        minX: plate.boxX - 1.5,
        maxX: plate.boxX + 1.5,
        minZ: plate.boxZ - 1.5,
        maxZ: plate.boxZ + 1.5,
      })
      if ((landedAt[i] ?? 0) >= newestAt) {
        newestAt = landedAt[i] ?? 0
        newest = i
      }
      mark++
    }
    setSlabs(slabBoxes)
    for (let i = PILLARS.length - 1; i >= 4; i--) {
      if (PILLARS[i]?.wing === 99) PILLARS.splice(i, 1)
    }
    if (newest >= 0 && PILLARS.length < 12) {
      const plate = plates[newest]
      if (plate) PILLARS.push({ x: plate.boxX, z: plate.boxZ, r: 1.7, wing: 99 })
    }
    if (mark !== slabMark) {
      slabMark = mark
      noteBlocks()
    }
  }

  function freeBeam(): number {
    for (let i = 0; i < 3; i++) if (!bOn[i]) return i
    return -1
  }

  function launch(player: Player, wishX: number, wishZ: number) {
    let dx = wishX
    let dz = wishZ
    let mag = Math.hypot(dx, dz)
    if (mag < 0.12) {
      dx = -player.x
      dz = -player.z
      mag = Math.hypot(dx, dz)
      if (mag < 0.25) {
        dx = 0
        dz = -1
        mag = 1
      }
    }
    dx /= mag
    dz /= mag
    let dist = TUNING.temple.springDist
    let lx = player.x
    let lz = player.z
    let ok = false
    while (dist >= 0) {
      const tx = player.x + dx * dist
      const tz = player.z + dz * dist
      if (insideArena(tx, tz, player.radius)) {
        lx = tx
        lz = tz
        ok = true
        break
      }
      dist -= 0.5
    }
    if (!ok) return
    flying = true
    flightT = 0
    fromX = player.x
    fromZ = player.z
    toX = lx
    toZ = lz
    liftY = 0
    events.launch = true
    ring.position.x = toX
    ring.position.z = toZ
    ring.visible = true
  }

  function startMirage(player: Player, wishX: number, wishZ: number, haste: number) {
    let dx = wishX
    let dz = wishZ
    let mag = Math.hypot(dx, dz)
    if (mag < 0.12) {
      forwardFromYaw(player.yaw, face)
      dx = lastAx || face.x
      dz = lastAz || face.z
      mag = Math.hypot(dx, dz) || 1
    }
    dx /= mag
    dz /= mag
    let dist = TUNING.temple.mirageDist
    while (dist > 0 && !insideArena(player.x + dx * dist, player.z + dz * dist, player.radius)) dist -= 0.5
    stepDx = dx
    stepDz = dz
    stepSpeed = Math.max(0, dist) / TUNING.temple.mirageStep
    stepLeft = TUNING.temple.mirageStep
    ghost = TUNING.temple.mirageIframe
    decoyT = TUNING.temple.mirageLife
    decoyAtX = player.x
    decoyAtZ = player.z
    const hasteCut = 1 - TUNING.temple.mirageHaste * haste
    mirageSpan = Math.max(TUNING.temple.mirageFloor, TUNING.temple.mirageCd * hasteCut)
    mirageCd = mirageSpan
    events.mirage = true
    decoy.visible = true
    decoy.position.x = decoyAtX
    decoy.position.z = decoyAtZ
  }

  function damageBeams(horde: Horde, ctx: HordeCtx, dt: number) {
    let live = 0
    for (let i = 0; i < 3; i++) if (bOn[i] && (bWind[i] ?? 0) <= 0 && (bLife[i] ?? 0) > 0) live++
    if (live === 0) return
    hashBuild(horde.x, horde.z, horde.alive, horde.x.length)
    seenStamp++
    if (seenStamp > 1e9) {
      SEEN.fill(0)
      seenStamp = 1
    }
    const half = TUNING.temple.mirrorWide * 0.5
    const r2 = half * half
    for (let b = 0; b < 3; b++) {
      if (!bOn[b] || (bWind[b] ?? 0) > 0 || (bLife[b] ?? 0) <= 0) continue
      const len = bLen[b] ?? 1
      const ox = bX[b] ?? 0
      const oz = bZ[b] ?? 0
      const dx = bDx[b] ?? 1
      const dz = bDz[b] ?? 0
      const steps = Math.max(1, Math.ceil(len / 1.5))
      for (let s = 0; s <= steps; s++) {
        const u = s / steps
        const qx = ox + dx * len * u
        const qz = oz + dz * len * u
        const n = hashQuery(qx, qz, half + 0.6, QUERY)
        for (let k = 0; k < n; k++) {
          const idx = QUERY[k] ?? -1
          if (idx < 0 || idx >= SEEN.length || SEEN[idx] === seenStamp) continue
          const ex = horde.x[idx] ?? 0
          const ez = horde.z[idx] ?? 0
          let t = (ex - ox) * dx + (ez - oz) * dz
          if (t < 0) t = 0
          else if (t > len) t = len
          const cx = ox + dx * t
          const cz = oz + dz * t
          const ddx = ex - cx
          const ddz = ez - cz
          if (ddx * ddx + ddz * ddz > r2) continue
          SEEN[idx] = seenStamp
          horde.soak(idx, TUNING.temple.mirrorDps * dt, true, ctx)
        }
      }
    }
  }

  function paintPlates(isLit: (x: number, z: number) => boolean) {
    let n = 0
    let slabs = 0
    let hum = 0
    for (let i = 0; i < plates.length; i++) {
      const plate = plates[i]
      if (!plate || !gateOpen[plate.side]) continue
      const lit = isLit(plate.x, plate.z) ? 1 : 0
      let type = 0
      let charge = 0
      if (plate.kind === 'mirror') type = 0
      else if (plate.kind === 'slab') type = 1
      else if (plate.kind === 'spring') type = 2
      else type = 3
      if (plate.kind === 'mirror') charge = pips[i] ?? 0
      else if (plate.kind === 'spring') charge = frac[i] ?? 0
      else if (plate.kind === 'altar') charge = Math.min(1, (timer[i] ?? 0) / TUNING.temple.altar)
      else charge = phase[i] === 0 ? 1 : 0.35
      const scale = plate.kind === 'spring' ? 1.25 : 1
      dummy.position.set(plate.x, 0.045, plate.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(scale, 1, scale)
      dummy.updateMatrix()
      plateMesh.setMatrixAt(n, dummy.matrix)
      typeA.setX(n, type)
      chargeA.setX(n, charge)
      litA.setX(n, lit)
      angA.setX(n, Math.atan2(aimX[i] ?? 0, aimZ[i] ?? 1))
      n++
      if (plate.kind === 'slab') {
        let y = 3.25
        if (phase[i] === 1) y = 3.25 - 0.35 * (1 - (timer[i] ?? 0) / TUNING.temple.slabTele)
        else if (phase[i] === 2) y = 0.32
        else if (phase[i] === 3) {
          const u = 1 - (timer[i] ?? 0) / TUNING.temple.slabRise
          y = 0.32 + (3.25 - 0.32) * u
        }
        dummy.position.set(plate.boxX, y, plate.boxZ)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        slabMesh.setMatrixAt(slabs, dummy.matrix)
        slabWarn.setX(slabs, phase[i] === 1 ? 1 : 0)
        slabs++
        if (phase[i] === 1) {
          const u = 1 - (timer[i] ?? 0) / TUNING.temple.slabTele
          blobs.push({ x: plate.boxX, z: plate.boxZ, scale: 1.2 + 2.2 * u })
          events.dustX = plate.boxX
          events.dustZ = plate.boxZ
        }
      }
      if (plate.kind === 'altar' && (timer[i] ?? 0) > 0 && (timer[i] ?? 0) < TUNING.temple.altar) {
        altarRing.visible = true
        altarRing.position.x = plate.x
        altarRing.position.z = plate.z
        const s = 0.4 + 0.8 * ((timer[i] ?? 0) / TUNING.temple.altar)
        altarRing.scale.set(s, s, s)
      }
    }
    plateMesh.count = n
    plateMesh.visible = n > 0
    plateMesh.instanceMatrix.needsUpdate = n > 0
    typeA.needsUpdate = n > 0
    chargeA.needsUpdate = n > 0
    litA.needsUpdate = n > 0
    angA.needsUpdate = n > 0
    slabMesh.count = slabs
    slabMesh.visible = slabs > 0
    slabMesh.instanceMatrix.needsUpdate = slabs > 0
    slabWarn.needsUpdate = slabs > 0
    let beams = 0
    for (let i = 0; i < 3; i++) {
      if (!bOn[i]) continue
      if ((bWind[i] ?? 0) <= 0) hum++
      const len = Math.max(0.4, bLen[i] ?? 1)
      dummy.position.set((bX[i] ?? 0) + (bDx[i] ?? 0) * len * 0.5, 0.9, (bZ[i] ?? 0) + (bDz[i] ?? 0) * len * 0.5)
      dummy.rotation.set(0, Math.atan2(bDx[i] ?? 0, bDz[i] ?? 1), 0)
      dummy.scale.set((bWind[i] ?? 0) > 0 ? 0.35 : 1, 1, len)
      dummy.updateMatrix()
      beamMesh.setMatrixAt(beams, dummy.matrix)
      beams++
    }
    beamMesh.count = beams
    beamMesh.visible = beams > 0
    beamMesh.instanceMatrix.needsUpdate = beams > 0
    events.hum = Math.min(2, hum)
    if (!altarRing.visible) altarRing.visible = false
  }

  const traps: Traps = {
    events,
    blobs,
    attach(scene) {
      scene.add(plateMesh, slabMesh, beamMesh, ring, decoy, altarRing)
    },
    reset(temple) {
      plates = temple.plates
      pips.fill(0)
      frac.fill(0)
      lock.fill(0)
      phase.fill(0)
      timer.fill(0)
      aimX.fill(0)
      aimZ.fill(-1)
      beamOf.fill(-1)
      for (let i = 0; i < 3; i++) bOn[i] = false
      flying = false
      flightT = 0
      liftY = 0
      stepLeft = 0
      ghost = 0
      decoyT = 0
      mirageCd = 0
      mirageSpan = TUNING.temple.mirageCd
      slabMark = -1
      pendingLand = false
      gotRelic = false
      landSeq = 1
      landedAt.fill(0)
      ring.visible = false
      decoy.visible = false
      altarRing.visible = false
      plateMesh.count = 0
      plateMesh.visible = false
      slabMesh.count = 0
      slabMesh.visible = false
      beamMesh.count = 0
      beamMesh.visible = false
      setSlabs([])
      clearEvents()
    },
    blocksCut() {
      return flying || stepLeft > 0
    },
    phasing() {
      return flying || ghost > 0
    },
    lift: () => liftY,
    decoyX: () => decoyAtX,
    decoyZ: () => decoyAtZ,
    decoyR2: () => (decoyT > 0 ? TUNING.temple.miragePull * TUNING.temple.miragePull : 0),
    ready() {
      if (mirageCd <= 0) return 1
      return Math.max(0, 1 - mirageCd / mirageSpan)
    },
    ring: () => ({ x: ring.position.x, z: ring.position.z, on: ring.visible }),
    phases: () => Array.from(phase),
    begin(dt, player) {
      if (mirageCd > 0) mirageCd = Math.max(0, mirageCd - dt)
      if (ghost > 0) ghost = Math.max(0, ghost - dt)
      if (decoyT > 0) {
        decoyT = Math.max(0, decoyT - dt)
        decoy.visible = decoyT > 0
      }
      if (flying) {
        flightT += dt
        const u = Math.min(1, flightT / TUNING.temple.springTime)
        player.x = fromX + (toX - fromX) * u
        player.z = fromZ + (toZ - fromZ) * u
        player.vx = 0
        player.vz = 0
        liftY = 4 * TUNING.temple.springApex * u * (1 - u)
        if (u >= 1) {
          player.x = toX
          player.z = toZ
          flying = false
          liftY = 0
          ring.visible = false
          pendingLand = true
        }
        return true
      }
      if (stepLeft > 0) {
        const slice = Math.min(dt, stepLeft)
        player.x += stepDx * stepSpeed * slice
        player.z += stepDz * stepSpeed * slice
        const slid = resolveCircle(player.x, player.z, player.radius)
        player.x = slid.x
        player.z = slid.z
        player.vx = stepDx * stepSpeed
        player.vz = stepDz * stepSpeed
        stepLeft -= slice
        liftY = 0
        return true
      }
      liftY = 0
      return false
    },
    after(dt, player, wishX, wishZ, horde, ctx, isLit, owned, haste, use) {
      slabClock.value += dt
      const hitLand = pendingLand
      pendingLand = false
      clearEvents()
      const wish = Math.hypot(wishX, wishZ)
      if (wish > 0.12) {
        lastAx = wishX / wish
        lastAz = wishZ / wish
      }
      if (hitLand) {
        events.land = true
        events.shake = TUNING.temple.springShake
        events.stop = TUNING.temple.springStop
        horde.hurtRadius(player.x, player.z, TUNING.temple.springRadius, TUNING.temple.springDmg, ctx)
        horde.knockFrom(player.x, player.z, TUNING.temple.springRadius, TUNING.temple.springKnock)
        horde.staggerRing(player.x, player.z, 0, TUNING.temple.springRadius, TUNING.temple.slabStagger)
      }
      if (!anyOpen() && !use && decoyT <= 0 && !flying) {
        plateMesh.visible = false
        slabMesh.visible = false
        beamMesh.visible = false
        altarRing.visible = false
        return
      }
      altarRing.visible = false
      for (let i = 0; i < 3; i++) {
        if (!bOn[i]) continue
        if ((bWind[i] ?? 0) > 0) {
          bWind[i] = (bWind[i] ?? 0) - dt
          if ((bWind[i] ?? 0) <= 0) events.fire++
        } else {
          bLife[i] = (bLife[i] ?? 0) - dt
          if ((bLife[i] ?? 0) <= 0) {
            bOn[i] = false
            const plate = bPlate[i] ?? -1
            if (plate >= 0) {
              lock[plate] = TUNING.temple.mirrorLock
              beamOf[plate] = -1
            }
          }
        }
      }
      damageBeams(horde, ctx, dt)
      let launched = false
      for (let i = 0; i < plates.length; i++) {
        const plate = plates[i]
        if (!plate || !gateOpen[plate.side]) continue
        const lit = isLit(plate.x, plate.z)
        if ((lock[i] ?? 0) > 0) lock[i] = Math.max(0, (lock[i] ?? 0) - dt)
        if (plate.kind === 'mirror') {
          const firing = (beamOf[i] ?? -1) >= 0
          if (!firing && (lock[i] ?? 0) <= 0 && lit && (pips[i] ?? 0) < 2) {
            frac[i] = (frac[i] ?? 0) + dt
            if ((frac[i] ?? 0) >= TUNING.temple.mirrorCharge) {
              frac[i] = (frac[i] ?? 0) - TUNING.temple.mirrorCharge
              pips[i] = Math.min(2, (pips[i] ?? 0) + 1)
            }
          }
          const dx = player.x - plate.x
          const dz = player.z - plate.z
          if (!firing && (pips[i] ?? 0) >= 1 && dx * dx + dz * dz <= 1) {
            const slot = freeBeam()
            if (slot >= 0) {
              let ax = wishX
              let az = wishZ
              let mag = Math.hypot(ax, az)
              if (mag < 0.12) {
                ax = lastAx
                az = lastAz
                mag = Math.hypot(ax, az) || 1
              }
              ax /= mag
              az /= mag
              aimX[i] = ax
              aimZ[i] = az
              const spent = pips[i] ?? 1
              pips[i] = 0
              frac[i] = 0
              bOn[slot] = true
              bX[slot] = plate.x
              bZ[slot] = plate.z
              bDx[slot] = ax
              bDz[slot] = az
              bLen[slot] = beamReach(plate.x, plate.z, ax, az, TUNING.temple.mirrorLen)
              bWind[slot] = TUNING.temple.mirrorWind
              bLife[slot] = TUNING.temple.mirrorPip * spent
              bPlate[slot] = i
              beamOf[i] = slot
            }
          }
        } else if (plate.kind === 'slab') {
          const on = Math.abs(player.x - plate.x) <= 1 && Math.abs(player.z - plate.z) <= 1
          if (phase[i] === 0 && on) {
            phase[i] = 1
            timer[i] = TUNING.temple.slabTele
            events.warn++
          } else if (phase[i] === 1) {
            timer[i] = (timer[i] ?? 0) - dt
            if ((timer[i] ?? 0) <= 0) {
              phase[i] = 2
              timer[i] = TUNING.temple.slabHold
              landedAt[i] = landSeq++
              const hx = 1.5
              if (Math.abs(player.x - plate.boxX) <= hx && Math.abs(player.z - plate.boxZ) <= hx) {
                const pdx = player.x - plate.boxX
                const pdz = player.z - plate.boxZ
                const edge = hx + player.radius + 0.2
                if (Math.abs(pdx) > Math.abs(pdz)) player.x = plate.boxX + Math.sign(pdx || 1) * edge
                else player.z = plate.boxZ + Math.sign(pdz || 1) * edge
                const slid = resolveCircle(player.x, player.z, player.radius)
                player.x = slid.x
                player.z = slid.z
              }
              horde.punishBox(plate.boxX, plate.boxZ, 1.5, 1.5, TUNING.temple.slabDmg, ctx)
              horde.staggerRing(plate.boxX, plate.boxZ, 1.5, 3, TUNING.temple.slabStagger)
              events.slam++
              syncSlabs()
            }
          } else if (phase[i] === 2) {
            timer[i] = (timer[i] ?? 0) - dt
            if ((timer[i] ?? 0) <= 0) {
              phase[i] = 3
              timer[i] = TUNING.temple.slabRise
              syncSlabs()
            }
          } else if (phase[i] === 3) {
            timer[i] = (timer[i] ?? 0) - dt
            if ((timer[i] ?? 0) <= 0) {
              phase[i] = 4
              timer[i] = 0
            }
          } else if (phase[i] === 4) {
            if (lit) timer[i] = (timer[i] ?? 0) + dt
            if ((timer[i] ?? 0) >= TUNING.temple.slabRearm) {
              phase[i] = 0
              timer[i] = 0
            }
          }
        } else if (plate.kind === 'spring') {
          const rate = lit ? 1 / TUNING.temple.springLight : 1 / TUNING.temple.springShade
          frac[i] = Math.min(1, (frac[i] ?? 0) + dt * rate)
          const dx = player.x - plate.x
          const dz = player.z - plate.z
          if (!launched && !flying && (frac[i] ?? 0) >= 1 && dx * dx + dz * dz <= 1.25 * 1.25) {
            launch(player, wishX, wishZ)
            if (flying) {
              frac[i] = 0
              launched = true
            }
          }
        } else if (!owned) {
          const dx = player.x - plate.x
          const dz = player.z - plate.z
          const on = dx * dx + dz * dz <= 1.15 * 1.15
          if (on && lit) timer[i] = (timer[i] ?? 0) + dt
          else timer[i] = 0
          if (!gotRelic && (timer[i] ?? 0) >= TUNING.temple.altar) {
            gotRelic = true
            timer[i] = TUNING.temple.altar
            events.relic = true
          }
        }
      }
      if (use && owned && mirageCd <= 0 && stepLeft <= 0 && !flying) startMirage(player, wishX, wishZ, haste)
      paintPlates(isLit)
    },
  }
  return traps
}
