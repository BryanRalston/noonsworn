import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type Camera,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COLOR } from '../data/palette'
import { toonMap } from '../render/toon'

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
  const body = new BoxGeometry(1.05, 0.42, 1.2)
  body.translate(0, 0.4, 0.02)
  const ridge = new BoxGeometry(0.28, 0.16, 0.9)
  ridge.translate(0, 0.66, 0.02)
  const head = new BoxGeometry(0.32, 0.24, 0.42)
  head.translate(0, 0.48, -0.58)
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
    const leg = new BoxGeometry(0.12, 0.28, 0.12)
    leg.translate(s[0] * 1.6, 0.14, s[2])
    legs.push(stamp(leg, 0, i < 2 ? 1 : -1))
  }
  const eyeL = new BoxGeometry(0.06, 0.04, 0.04)
  eyeL.translate(-0.06, 0.42, -0.66)
  const eyeR = new BoxGeometry(0.06, 0.04, 0.04)
  eyeR.translate(0.06, 0.42, -0.66)
  return mergeParts([
    stamp(body, 0, 0),
    stamp(ridge, 0, 0),
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
  halo: Mesh
  blade: Mesh
  tris: number
  bob: (time: number, speed: number, cutting: number) => void
  swing: (time: number) => void
  placeHalo: (camera: Camera, x: number, z: number) => void
}

export function createSela(): SelaView {
  const pts = [
    new Vector2(0.2, 0.02),
    new Vector2(0.98, 0.05),
    new Vector2(0.9, 0.42),
    new Vector2(0.78, 0.95),
    new Vector2(0.46, 1.28),
    new Vector2(0.28, 1.52),
    new Vector2(0.18, 1.66),
  ]
  const linen = new MeshToonMaterial({ color: COLOR.linen.clone().multiplyScalar(0.48), gradientMap: toonMap() })
  linen.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);
outgoingLight += vec3(fres * 0.18);
#include <opaque_fragment>`,
    )
  }
  const robeGeo = new LatheGeometry(pts, 12)
  const hoodGeo = new SphereGeometry(0.34, 8, 6)
  hoodGeo.scale(1.12, 0.92, 1.18)
  hoodGeo.translate(0, 1.78, 0.06)
  const cowl = new SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  cowl.scale(1.05, 0.7, 1.05)
  cowl.translate(0, 1.72, 0.2)
  const robe = new Mesh(mergeParts([robeGeo, hoodGeo, cowl]), linen)
  const halo = new Mesh(
    new TorusGeometry(0.3, 0.022, 4, 12),
    new MeshBasicMaterial({ color: COLOR.gold, toneMapped: false, side: DoubleSide }),
  )
  halo.position.set(0, 1.86, -0.04)
  const face = new Mesh(
    new SphereGeometry(0.11, 8, 6),
    new MeshToonMaterial({ color: COLOR.umbral, gradientMap: toonMap() }),
  )
  face.position.set(0, 1.8, 0.3)
  face.scale.set(1.35, 0.5, 0.4)
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
  root.scale.setScalar(1.45)
  root.add(ring, robe, face, blade, halo)
  let swingUntil = 0
  const tris = trisOf(robe.geometry) + trisOf(halo.geometry) + trisOf(blade.geometry) + trisOf(ring.geometry) + trisOf(face.geometry)
  return {
    root,
    halo,
    blade,
    tris,
    swing(time) {
      swingUntil = time + 0.22
    },
    placeHalo(camera, x, z) {
      void camera
      void x
      void z
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
