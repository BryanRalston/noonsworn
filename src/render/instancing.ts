import {
  BufferGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  MeshToonMaterial,
  Object3D,
  ShaderMaterial,
  type Material,
} from 'three'

const dummy = new Object3D()
const time = { value: 0 }

function enemyVertex(): string {
  return /* glsl */ `
      attribute vec3 color;
      attribute float aEmit;
      attribute float iFlash;
      attribute float iLit;
      varying vec3 vColor;
      varying float vEmit;
      varying float vLit;
      varying float vFlash;
      void main() {
        vColor = color;
        vEmit = aEmit;
        vLit = iLit;
        vFlash = iFlash;
        vec4 mvPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * mvPosition;
      }
    `
}

export function enemyTime(): { value: number } {
  return time
}

export function setEnemyLegSwing(_on: boolean) {}

export function createEnemyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: enemyVertex(),
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      varying float vEmit;
      varying float vLit;
      varying float vFlash;
      void main() {
        vec3 col = vColor;
        if (vEmit > 0.5) col *= 1.7;
        else if (vLit < 0.5) col *= 0.72;
        col = mix(col, vec3(1.0, 0.78, 0.38), vFlash * 0.7);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
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
  lean = 0,
) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(lean, yaw, 0)
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
