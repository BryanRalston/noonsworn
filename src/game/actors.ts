import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshToonMaterial,
  RingGeometry,
  SphereGeometry,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COLOR } from '../data/palette'
import { toonMap } from '../render/toon'
import { whiteRim } from '../render/instancing'

function stamp(geo: BufferGeometry, eye: number, leg: number): BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo
  const n = flat.getAttribute('position').count
  const eyes = new Float32Array(n)
  const legs = new Float32Array(n)
  eyes.fill(eye)
  legs.fill(leg)
  flat.setAttribute('aEye', new BufferAttribute(eyes, 1))
  flat.setAttribute('aLeg', new BufferAttribute(legs, 1))
  return flat
}

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('actor merge failed')
  return merged
}

function trisOf(geo: BufferGeometry): number {
  if (geo.index) return geo.index.count / 3
  return geo.getAttribute('position').count / 3
}

export function miteGeometry(): BufferGeometry {
  const body = new IcosahedronGeometry(0.2, 0)
  body.translate(0, 0.3, 0)
  const spikes: BufferGeometry[] = []
  const dirs: Array<[number, number, number]> = [
    [0.2, 0.55, 0.05],
    [-0.18, 0.52, 0.08],
    [0.05, 0.58, -0.16],
    [0.16, 0.4, 0.16],
    [-0.14, 0.42, -0.16],
    [0.0, 0.62, 0.12],
    [-0.02, 0.38, 0.2],
  ]
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]
    if (!d) continue
    const spike = new ConeGeometry(0.045, 0.16, 3)
    spike.translate(d[0], d[1], d[2])
    spikes.push(stamp(spike, 0, 0))
  }
  const legL = new BoxGeometry(0.07, 0.12, 0.07)
  legL.translate(-0.08, 0.08, 0.04)
  const legR = new BoxGeometry(0.07, 0.12, 0.07)
  legR.translate(0.08, 0.08, -0.04)
  const eyeL = new BoxGeometry(0.05, 0.045, 0.04)
  eyeL.translate(-0.07, 0.34, -0.16)
  const eyeR = new BoxGeometry(0.05, 0.045, 0.04)
  eyeR.translate(0.07, 0.34, -0.16)
  return mergeParts([
    stamp(body, 0, 0),
    ...spikes,
    stamp(legL, 0, 1),
    stamp(legR, 0, -1),
    stamp(eyeL, 1, 0),
    stamp(eyeR, 1, 0),
  ])
}

export function houndGeometry(): BufferGeometry {
  const body = new BoxGeometry(0.42, 0.26, 0.72)
  body.translate(0, 0.34, 0.02)
  const head = new BoxGeometry(0.22, 0.18, 0.36)
  head.translate(0, 0.4, -0.5)
  const headPos = head.getAttribute('position')
  for (let i = 0; i < headPos.count; i++) {
    if (headPos.getZ(i) < -0.62) {
      headPos.setX(i, headPos.getX(i) * 0.45)
      headPos.setY(i, 0.38 + (headPos.getY(i) - 0.4) * 0.7)
    }
  }
  const chest = new BoxGeometry(0.18, 0.14, 0.18)
  chest.translate(0, 0.28, -0.28)
  const tail = new BoxGeometry(0.04, 0.04, 0.46)
  tail.translate(0, 0.42, 0.52)
  const legs: BufferGeometry[] = []
  const spots: Array<[number, number, number]> = [
    [-0.14, 0.12, -0.2],
    [0.14, 0.12, -0.2],
    [-0.14, 0.12, 0.24],
    [0.14, 0.12, 0.24],
  ]
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i]
    if (!s) continue
    const leg = new BoxGeometry(0.07, 0.18, 0.07)
    leg.translate(s[0], s[1], s[2])
    legs.push(stamp(leg, 0, i < 2 ? 1 : -1))
  }
  const eyeL = new BoxGeometry(0.06, 0.04, 0.04)
  eyeL.translate(-0.06, 0.42, -0.66)
  const eyeR = new BoxGeometry(0.06, 0.04, 0.04)
  eyeR.translate(0.06, 0.42, -0.66)
  return mergeParts([
    stamp(body, 0, 0),
    stamp(head, 0, 0),
    stamp(chest, 0, 0),
    stamp(tail, 0, 0),
    ...legs,
    stamp(eyeL, 1, 0),
    stamp(eyeR, 1, 0),
  ])
}

export interface SelaView {
  root: Group
  blade: Mesh
  tris: number
  bob: (time: number, speed: number, cutting: number) => void
  swing: (time: number) => void
}

export function createSela(): SelaView {
  const pts = [
    new Vector2(0.16, 0.02),
    new Vector2(0.78, 0.08),
    new Vector2(0.62, 0.5),
    new Vector2(0.34, 1.05),
    new Vector2(0.24, 1.38),
  ]
  const linen = new MeshToonMaterial({ color: COLOR.linen, gradientMap: toonMap() })
  whiteRim(linen)
  const robeGeo = new LatheGeometry(pts, 12)
  const hoodGeo = new SphereGeometry(0.22, 8, 6)
  hoodGeo.translate(0, 1.58, 0.02)
  const robe = new Mesh(mergeParts([robeGeo, hoodGeo]), linen)
  const haloMat = new MeshToonMaterial({
    color: COLOR.gold,
    gradientMap: toonMap(),
    emissive: COLOR.goldHot,
    emissiveIntensity: 0.55,
  })
  const halo = new Mesh(new CircleGeometry(0.62, 18), haloMat)
  halo.position.set(0, 1.6, 0.18)
  halo.rotation.x = -Math.PI / 2
  const blade = new Mesh(
    new BoxGeometry(0.16, 0.05, 2.45),
    new MeshToonMaterial({ color: COLOR.bronze, gradientMap: toonMap(), emissive: COLOR.gold, emissiveIntensity: 0.2 }),
  )
  blade.position.set(0.48, 1.05, -0.15)
  blade.rotation.x = 0.35
  const ring = new Mesh(
    new RingGeometry(0.5, 0.7, 20),
    new MeshToonMaterial({ color: COLOR.gold, gradientMap: toonMap(), emissive: COLOR.gold, emissiveIntensity: 0.35 }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.04
  const root = new Group()
  root.scale.setScalar(1.35)
  root.add(ring, robe, halo, blade)
  let swingUntil = 0
  const tris = trisOf(robe.geometry) + trisOf(halo.geometry) + trisOf(blade.geometry) + trisOf(ring.geometry)
  return {
    root,
    blade,
    tris,
    swing(time) {
      swingUntil = time + 0.22
    },
    bob(time, speed, cutting) {
      const moving = Math.min(1, speed / 3)
      root.position.y = Math.sin(time * 8) * 0.035 * moving
      root.rotation.z = Math.max(-0.14, Math.min(0.14, speed * 0.018))
      robe.rotation.x = Math.sin(time * 6.5) * 0.035 * (0.35 + moving)
      robe.rotation.z = Math.sin(time * 4.2) * 0.03 * moving
      const swinging = cutting > 0 || time < swingUntil
      blade.rotation.z = swinging ? -1.15 : Math.sin(time * 6) * 0.08 * moving
    },
  }
}
