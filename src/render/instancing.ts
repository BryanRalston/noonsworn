import {
  BufferGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  type Material,
} from 'three'
import { COLOR } from '../data/palette'

const dummy = new Object3D()
const time = { value: 0 }

export function enemyTime(): { value: number } {
  return time
}

export function createEnemyMaterial(): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true, color: 0xffffff })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uGold = { value: COLOR.goldHot }
    shader.uniforms.uUmbral = { value: COLOR.umbral }
    shader.vertexShader =
      'attribute float iFlash;\nattribute float iLit;\nattribute float iPhase;\nattribute float aEye;\nuniform float uTime;\nuniform vec3 uGold;\nuniform vec3 uUmbral;\n' +
      shader.vertexShader
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nfloat bob = sin(uTime * 5.0 + iPhase) * 0.05;\ntransformed.y += bob;\ntransformed.y *= 0.94 + 0.06 * sin(uTime * 3.2 + iPhase);',
        )
        .replace(
          '#include <color_vertex>',
          '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, uGold, iLit * (1.0 - aEye) * 0.72);\nvColor.rgb = mix(vColor.rgb, uUmbral, aEye * (1.0 - iLit));\nvColor.rgb = mix(vColor.rgb, vec3(1.0), iFlash);',
        )
  }
  return material
}

export function makeCrowd(geo: BufferGeometry, material: Material, capacity: number): InstancedMesh {
  const mesh = new InstancedMesh(geo, material, capacity)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  return mesh
}

export function writeInstance(mesh: InstancedMesh, index: number, x: number, y: number, z: number, yaw: number, scale: number) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(0, yaw, 0)
  dummy.scale.set(scale, scale, scale)
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
