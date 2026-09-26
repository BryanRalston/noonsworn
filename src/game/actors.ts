import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  Color,
  LatheGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type Camera,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COLOR } from '../data/palette'
import { toonMap } from '../render/toon'

function stamp(geo: BufferGeometry, eye: number, leg: number, tele = 0): BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo
  const n = flat.getAttribute('position').count
  const eyes = new Float32Array(n)
  const legs = new Float32Array(n)
  const teles = new Float32Array(n)
  eyes.fill(eye)
  legs.fill(leg)
  teles.fill(tele)
  flat.setAttribute('aEye', new BufferAttribute(eyes, 1))
  flat.setAttribute('aLeg', new BufferAttribute(legs, 1))
  flat.setAttribute('aTele', new BufferAttribute(teles, 1))
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
  const body = new BoxGeometry(0.46, 0.3, 1.46)
  body.translate(0, 0.36, 0.05)
  const ridge = new BoxGeometry(0.08, 0.07, 1.15)
  ridge.translate(0, 0.66, 0.02)
  const head = new BoxGeometry(0.28, 0.2, 0.4)
  head.translate(0, 0.4, -0.82)
  const headPos = head.getAttribute('position')
  for (let i = 0; i < headPos.count; i++) {
    if (headPos.getZ(i) < -0.95) {
      headPos.setX(i, headPos.getX(i) * 0.35)
      headPos.setY(i, 0.34 + (headPos.getY(i) - 0.4) * 0.55)
    }
  }
  const snout = new BoxGeometry(0.12, 0.08, 0.22)
  snout.translate(0, 0.34, -1.08)
  const tail = new BoxGeometry(0.06, 0.06, 0.42)
  tail.translate(0, 0.4, 0.88)
  const legs: BufferGeometry[] = []
  const spots: Array<[number, number, number]> = [
    [-0.3, 0.14, -0.42],
    [0.3, 0.14, -0.42],
    [-0.3, 0.14, 0.5],
    [0.3, 0.14, 0.5],
  ]
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i]
    if (!s) continue
    const leg = new BoxGeometry(0.1, 0.3, 0.1)
    leg.translate(s[0], s[1], s[2])
    legs.push(stamp(leg, 0, i < 2 ? 1 : -1))
  }
  const eyeL = new BoxGeometry(0.05, 0.04, 0.04)
  eyeL.translate(-0.08, 0.46, -0.96)
  const eyeR = new BoxGeometry(0.05, 0.04, 0.04)
  eyeR.translate(0.08, 0.46, -0.96)
  const tele = new PlaneGeometry(0.7, 4.4)
  tele.rotateX(-Math.PI / 2)
  tele.translate(0, 0.06, -2.7)
  return mergeParts([
    stamp(body, 0, 0),
    stamp(ridge, 0, 0),
    stamp(head, 0, 0),
    stamp(snout, 0, 0),
    stamp(tail, 0, 0),
    ...legs,
    stamp(eyeL, 1, 0),
    stamp(eyeR, 1, 0),
    stamp(tele, 0, 0, 1),
  ])
}

export interface SelaView {
  root: Group
  halo: Mesh
  blade: Mesh
  tris: number
  bob: (time: number, speed: number, cutting: number) => void
  swing: (time: number) => void
  placeHalo: (camera: Camera) => void
}

function flat(geo: BufferGeometry): BufferGeometry {
  return geo.index ? geo.toNonIndexed() : geo
}

function paint(geo: BufferGeometry, color: Color): BufferGeometry {
  const n = geo.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r
    col[i * 3 + 1] = color.g
    col[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new BufferAttribute(col, 3))
  return geo
}

const haloSpin = new Quaternion()

export function createSela(): SelaView {
  const pts = [
    new Vector2(0.18, 0.02),
    new Vector2(0.94, 0.05),
    new Vector2(0.86, 0.42),
    new Vector2(0.72, 0.95),
    new Vector2(0.42, 1.28),
    new Vector2(0.26, 1.52),
    new Vector2(0.16, 1.66),
  ]
  const linen = new Color(0.3, 0.24, 0.18)
  const hoodInk = new Color(0.16, 0.12, 0.1)
  const bodyMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap(), vertexColors: true })
  bodyMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
outgoingLight += vec3(fres * 0.72);
#include <opaque_fragment>`,
    )
  }
  const robeGeo = paint(flat(new LatheGeometry(pts, 12)), linen)
  const hoodGeo = flat(new SphereGeometry(0.34, 8, 6))
  hoodGeo.scale(1.12, 0.92, 1.18)
  hoodGeo.translate(0, 1.78, 0.06)
  const cowl = flat(new SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55))
  cowl.scale(1.05, 0.7, 1.05)
  cowl.translate(0, 1.72, 0.2)
  const faceGeo = flat(new SphereGeometry(0.11, 8, 6))
  faceGeo.scale(1.35, 0.5, 0.4)
  faceGeo.translate(0, 1.8, 0.3)
  const ringGeo = flat(new RingGeometry(0.42, 0.58, 20))
  ringGeo.rotateX(-Math.PI / 2)
  ringGeo.translate(0, 0.04, 0)
  const body = new Mesh(
    mergeParts([
      robeGeo,
      paint(hoodGeo, hoodInk),
      paint(cowl, hoodInk),
      paint(faceGeo, COLOR.umbral),
      paint(ringGeo, COLOR.gold),
    ]),
    bodyMat,
  )
  const blade = new Mesh(
    new BoxGeometry(0.16, 0.05, 2.45),
    new MeshToonMaterial({ color: COLOR.bronze, gradientMap: toonMap(), emissive: COLOR.gold, emissiveIntensity: 0.35 }),
  )
  blade.position.set(0.48, 1.05, -0.15)
  blade.rotation.x = 0.35
  const halo = new Mesh(
    new TorusGeometry(0.5 / 1.15, 0.03 / 1.15, 8, 24),
    new MeshBasicMaterial({ color: new Color(3.4, 2.5, 0.7), toneMapped: false, side: DoubleSide }),
  )
  halo.position.set(0, 2.12, -0.16)
  const root = new Group()
  root.scale.setScalar(1.15)
  root.add(body, blade, halo)
  let swingUntil = 0
  const tris = trisOf(body.geometry) + trisOf(halo.geometry) + trisOf(blade.geometry)
  return {
    root,
    halo,
    blade,
    tris,
    swing(time) {
      swingUntil = time + 0.22
    },
    placeHalo(camera) {
      root.updateWorldMatrix(true, false)
      haloSpin.copy(root.quaternion).invert().multiply(camera.quaternion)
      halo.quaternion.copy(haloSpin)
    },
    bob(time, speed, cutting) {
      const moving = Math.min(1, speed / 3)
      root.position.y = Math.sin(time * 8) * 0.035 * moving
      root.rotation.z = Math.max(-0.14, Math.min(0.14, speed * 0.018))
      body.rotation.x = Math.sin(time * 6.5) * 0.035 * (0.35 + moving)
      const swinging = cutting > 0 || time < swingUntil
      blade.rotation.z = swinging ? -1.15 : Math.sin(time * 6) * 0.08 * moving
    },
  }
}
