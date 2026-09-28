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

export function enemyTime(): { value: number } {
  return time
}

export function createEnemyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aEmit;
      attribute float aGallop;
      attribute vec4 iAnim;
      varying vec3 vColor;
      varying float vEmit;
      varying float vLit;
      varying float vFlash;
      uniform float uTime;
      void main() {
        vColor = color;
        vEmit = aEmit;
        vLit = iAnim.y;
        vFlash = iAnim.x;
        vec3 transformed = position;
        float phase = fract(uTime * 1.4 + iAnim.z * 0.07);
        float wave = (abs(phase * 2.0 - 1.0) * 2.0 - 1.0) * clamp(iAnim.w, 0.25, 1.0);
        transformed.y += wave * 0.045;
        transformed.y *= 1.0 + wave * 0.07;
        transformed.z += wave * position.y * 0.16;
        transformed.y += aGallop * wave * 0.08;
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      varying float vEmit;
      varying float vLit;
      varying float vFlash;
      void main() {
        vec3 col = vColor * 3.4;
        if (vEmit > 0.5) col = vColor * 1.7;
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
