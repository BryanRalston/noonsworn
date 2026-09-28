import {
  BufferGeometry,
  DynamicDrawUsage,
  GLBufferAttribute,
  InstancedMesh,
  MeshToonMaterial,
  Object3D,
  ShaderMaterial,
  type Material,
  type WebGLRenderer,
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

export function writeInstanceArray(
  out: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  sx: number,
  sy: number,
  lean = 0,
) {
  const o = index * 16
  const a = Math.cos(lean)
  const b = Math.sin(lean)
  const c = Math.cos(yaw)
  const d = Math.sin(yaw)
  out[o] = c * sx
  out[o + 1] = b * d * sx
  out[o + 2] = -a * d * sx
  out[o + 3] = 0
  out[o + 4] = 0
  out[o + 5] = a * sy
  out[o + 6] = b * sy
  out[o + 7] = 0
  out[o + 8] = d * sx
  out[o + 9] = -b * c * sx
  out[o + 10] = a * c * sx
  out[o + 11] = 0
  out[o + 12] = x
  out[o + 13] = y
  out[o + 14] = z
  out[o + 15] = 1
}

/** Replace the buffer store each frame so ANGLE does not stall on the previous draw. */
export function orphanMatrices(mesh: InstancedMesh, cpu: Float32Array) {
  const box: { buf?: WebGLBuffer } = {}
  mesh.onBeforeRender = (renderer: WebGLRenderer) => {
    const gl = renderer.getContext()
    if (!box.buf) {
      const buf = gl.createBuffer()
      if (!buf) return
      box.buf = buf
      const attr = new GLBufferAttribute(buf, gl.FLOAT, 16, 4, cpu.length / 16)
      Object.assign(attr, { isInstancedBufferAttribute: true, meshPerAttribute: 1 })
      mesh.instanceMatrix = attr as unknown as typeof mesh.instanceMatrix
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, box.buf)
    gl.bufferData(gl.ARRAY_BUFFER, cpu, gl.DYNAMIC_DRAW)
  }
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
