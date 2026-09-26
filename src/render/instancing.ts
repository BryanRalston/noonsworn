import {
  BufferGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  MeshToonMaterial,
  Object3D,
  type Material,
} from 'three'
import { COLOR } from '../data/palette'
import { toonMap } from './toon'

const dummy = new Object3D()
const time = { value: 0 }

export function enemyTime(): { value: number } {
  return time
}

export function createEnemyMaterial(): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: COLOR.umbral,
    gradientMap: toonMap(),
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uGold = { value: COLOR.goldHot }
    shader.uniforms.uUmbral = { value: COLOR.umbral }
    shader.uniforms.uRim = { value: COLOR.umbralRim }
    shader.vertexShader =
      'attribute float iFlash;\nattribute float iLit;\nattribute float iPhase;\nattribute float iMove;\nattribute float iTele;\nattribute float aEye;\nattribute float aLeg;\nattribute float aTele;\nvarying vec3 vLocal;\nvarying float vEye;\nvarying float vLit;\nvarying float vFlash;\nvarying float vTele;\nvarying float vITele;\nuniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vLocal = position;
vEye = aEye;
vLit = iLit;
vFlash = iFlash;
vTele = aTele;
vITele = iTele;
float wave = sin(uTime * 9.0 + iPhase);
float body = step(abs(aLeg), 0.01);
float hop = body * wave;
transformed.y += hop * 0.08;
float squash = 1.0 + hop * 0.16;
transformed.y *= squash;
transformed.x /= squash;
transformed.z /= squash;
float swing = sin(uTime * 12.0 + iPhase);
transformed.x += aLeg * swing * iMove * 0.1;
transformed.z += aLeg * cos(uTime * 12.0 + iPhase) * iMove * 0.05;`,
      )
    shader.fragmentShader =
      'varying vec3 vLocal;\nvarying float vEye;\nvarying float vLit;\nvarying float vFlash;\nvarying float vTele;\nvarying float vITele;\nuniform vec3 uGold;\nuniform vec3 uUmbral;\nuniform vec3 uRim;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float fres = pow(1.0 - facing, 2.0);
float luma = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
if (vTele > 0.5) {
  if (vITele < 0.5) discard;
  outgoingLight = vec3(1.0, 0.24, 0.55);
} else if (vEye > 0.5) {
  outgoingLight = mix(vec3(0.82, 0.7, 1.0), uGold, vLit);
} else if (vLit > 0.5) {
  float band = floor(clamp(luma, 0.0, 0.999) * 3.0);
  outgoingLight = vec3(0.16, 0.09, 0.04) * (0.55 + band * 0.2);
  float crack = step(0.72, fract(sin(dot(vLocal.xz, vec2(19.1, 73.7)) + vLocal.y * 4.0) * 43758.5));
  outgoingLight += uGold * crack * 1.15;
  outgoingLight *= mix(0.2, 1.0, facing);
} else {
  outgoingLight = max(outgoingLight, uUmbral * 0.92);
  outgoingLight += uRim * fres * 1.1;
}
if (vLocal.y > 0.58) outgoingLight = mix(outgoingLight, uRim, 0.92);
outgoingLight = mix(outgoingLight, uGold * 1.8, vFlash);
#include <opaque_fragment>`,
      )
  }
  return material
}

export function whiteRim(material: MeshToonMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
outgoingLight += vec3(fres * 0.55);
#include <opaque_fragment>`,
    )
  }
}

export function makeCrowd(geo: BufferGeometry, material: Material, capacity: number): InstancedMesh {
  const mesh = new InstancedMesh(geo, material, capacity)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  return mesh
}

export function writeInstance(
  mesh: InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
  sy?: number,
) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(0, yaw, 0)
  dummy.scale.set(scale, sy ?? scale, scale)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

export function writeFlat(mesh: InstancedMesh, index: number, x: number, z: number, yaw: number, sx: number, sz: number) {
  dummy.position.set(x, 0, z)
  dummy.rotation.set(0, yaw, 0)
  dummy.scale.set(sx, 1, sz)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}
