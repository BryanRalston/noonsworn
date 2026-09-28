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
let enemyMat: ShaderMaterial | null = null
let legSwing = false

function enemyVertex(leg: boolean): string {
  return /* glsl */ `
      attribute vec3 color;
      attribute float aEmit;
      attribute float iFlash;
      attribute float iLit;
      ${leg ? 'attribute float aGallop; attribute float iPhase; uniform float uTime;' : ''}
      varying vec3 vColor;
      varying float vEmit;
      varying float vLit;
      varying float vFlash;
      void main() {
        vColor = color;
        vEmit = aEmit;
        vLit = iLit;
        vFlash = iFlash;
        vec3 transformed = position;
        ${leg ? 'float legOn = step(5.0, iPhase); transformed.y += aGallop * sin(uTime + iPhase - legOn * 10.0) * legOn * 0.08;' : ''}
        vec4 mvPosition = vec4(transformed, 1.0);
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

export function setEnemyLegSwing(on: boolean) {
  if (!enemyMat || on === legSwing) return
  legSwing = on
  enemyMat.vertexShader = enemyVertex(on)
  enemyMat.needsUpdate = true
}

export function createEnemyMaterial(): ShaderMaterial {
  enemyMat = new ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: enemyVertex(false),
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
  return enemyMat
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
