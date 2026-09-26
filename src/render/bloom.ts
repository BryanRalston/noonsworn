import {
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from 'three'
import { TUNING } from '../data/tuning'

const quadGeo = new PlaneGeometry(2, 2)
const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
const quadScene = new Scene()

const blurVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const extractFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform float uThreshold;
void main() {
  vec3 c = texture(tScene, vUv).rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uThreshold, uThreshold + 0.18, luma);
  gl_FragColor = vec4(c * k, 1.0);
}
`

const blurFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
void main() {
  vec3 acc = texture(tDiffuse, vUv).rgb * 0.227;
  acc += texture(tDiffuse, vUv + uTexel * 1.384).rgb * 0.316;
  acc += texture(tDiffuse, vUv - uTexel * 1.384).rgb * 0.316;
  acc += texture(tDiffuse, vUv + uTexel * 3.230).rgb * 0.070;
  acc += texture(tDiffuse, vUv - uTexel * 3.230).rgb * 0.070;
  gl_FragColor = vec4(acc, 1.0);
}
`

const compositeFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uStrength;
void main() {
  vec3 scene = texture(tScene, vUv).rgb;
  vec3 bloom = texture(tBloom, vUv).rgb;
  gl_FragColor = vec4(scene + bloom * uStrength, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float viewN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  gl_FragColor.rgb += (viewN - 0.5) * (1.0 / 255.0);
}
`

function rt(w: number, h: number, depth: boolean): WebGLRenderTarget {
  const target = new WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    format: RGBAFormat,
    type: HalfFloatType,
    depthBuffer: depth,
    stencilBuffer: false,
  })
  target.texture.colorSpace = LinearSRGBColorSpace
  return target
}

export interface Bloom {
  render: (renderer: WebGLRenderer, scene: Scene, camera: Camera) => void
  setSize: (width: number, height: number) => void
  setStrength: (strength: number) => void
}

export function createBloom(): Bloom {
  let width = 2
  let height = 2
  let sceneTarget = rt(2, 2, true)
  let ping = rt(2, 2, false)
  let pong = rt(2, 2, false)
  const texel = new Vector2(1, 0)
  const extract = new ShaderMaterial({
    uniforms: {
      tScene: { value: sceneTarget.texture },
      uThreshold: { value: TUNING.look.bloomThreshold },
    },
    vertexShader: blurVert,
    fragmentShader: extractFrag,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const blur = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: ping.texture },
      uTexel: { value: texel },
    },
    vertexShader: blurVert,
    fragmentShader: blurFrag,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const composite = new ShaderMaterial({
    uniforms: {
      tScene: { value: sceneTarget.texture },
      tBloom: { value: pong.texture },
      uStrength: { value: TUNING.look.bloomStrength },
    },
    vertexShader: blurVert,
    fragmentShader: compositeFrag,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new Mesh(quadGeo, extract)
  mesh.frustumCulled = false
  quadScene.add(mesh)

  function resizeBuffers() {
    const bw = Math.max(1, Math.floor(width / 2))
    const bh = Math.max(1, Math.floor(height / 2))
    if (sceneTarget.width !== width || sceneTarget.height !== height) sceneTarget.setSize(width, height)
    if (ping.width !== bw || ping.height !== bh) {
      ping.setSize(bw, bh)
      pong.setSize(bw, bh)
    }
  }

  return {
    setSize(w, h) {
      width = Math.max(2, w)
      height = Math.max(2, h)
    },
    setStrength(strength) {
      composite.uniforms.uStrength!.value = strength
    },
    render(renderer, scene, camera) {
      resizeBuffers()
      extract.uniforms.tScene!.value = sceneTarget.texture
      composite.uniforms.tScene!.value = sceneTarget.texture
      const prevTarget = renderer.getRenderTarget()
      const prevAuto = renderer.autoClear
      renderer.autoClear = true
      renderer.setRenderTarget(sceneTarget)
      renderer.render(scene, camera)
      const bw = ping.width
      const bh = ping.height
      mesh.material = extract
      renderer.setRenderTarget(ping)
      renderer.render(quadScene, quadCam)
      mesh.material = blur
      blur.uniforms.tDiffuse!.value = ping.texture
      texel.set(1 / bw, 0)
      renderer.setRenderTarget(pong)
      renderer.render(quadScene, quadCam)
      blur.uniforms.tDiffuse!.value = pong.texture
      texel.set(0, 1 / bh)
      renderer.setRenderTarget(ping)
      renderer.render(quadScene, quadCam)
      mesh.material = composite
      composite.uniforms.tBloom!.value = ping.texture
      renderer.setRenderTarget(null)
      renderer.render(quadScene, quadCam)
      renderer.setRenderTarget(prevTarget)
      renderer.autoClear = prevAuto
    },
  }
}
