import {
  LinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from 'three'

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
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 acc = vec3(0.0);
  float w0 = 0.227;
  float w1 = 0.316;
  float w2 = 0.070;
  vec2 o1 = uTexel * 1.384;
  vec2 o2 = uTexel * 3.230;
  acc += texture(tScene, vUv).rgb * w0;
  acc += texture(tScene, vUv + o1).rgb * w1;
  acc += texture(tScene, vUv - o1).rgb * w1;
  acc += texture(tScene, vUv + o2).rgb * w2;
  acc += texture(tScene, vUv - o2).rgb * w2;
  float luma = dot(acc, vec3(0.2126, 0.7152, 0.0722));
  float chroma = max(acc.r, max(acc.g, acc.b)) - min(acc.r, min(acc.g, acc.b));
  float hot = smoothstep(uThreshold, 1.0, luma) * smoothstep(0.14, 0.32, chroma);
  float gold = smoothstep(0.78, 0.96, acc.r) * smoothstep(0.6, 0.9, acc.g) * step(0.18, acc.r - acc.b);
  float gem = smoothstep(0.5, 0.8, acc.g) * smoothstep(0.5, 0.85, acc.b) * (1.0 - smoothstep(0.25, 0.55, acc.r));
  gl_FragColor = vec4(acc * max(hot, max(gold, gem)), 1.0);
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
}
`

function rt(w: number, h: number, depth: boolean): WebGLRenderTarget {
  const target = new WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: depth,
    stencilBuffer: false,
  })
  target.texture.colorSpace = NoColorSpace
  return target
}

export interface Bloom {
  render: (renderer: WebGLRenderer, scene: Scene, camera: Camera, full: boolean) => void
  setSize: (width: number, height: number) => void
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
      uTexel: { value: new Vector2(1, 0) },
      uThreshold: { value: 0.85 },
    },
    vertexShader: blurVert,
    fragmentShader: extractFrag,
    depthTest: false,
    depthWrite: false,
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
  })
  const composite = new ShaderMaterial({
    uniforms: {
      tScene: { value: sceneTarget.texture },
      tBloom: { value: pong.texture },
      uStrength: { value: 0.35 },
    },
    vertexShader: blurVert,
    fragmentShader: compositeFrag,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new Mesh(quadGeo, extract)
  mesh.frustumCulled = false
  quadScene.add(mesh)

  function resizeBuffers(full: boolean) {
    const bw = Math.max(1, full ? width : Math.floor(width / 2))
    const bh = Math.max(1, full ? height : Math.floor(height / 2))
    if (sceneTarget.width !== width || sceneTarget.height !== height) {
      sceneTarget.setSize(width, height)
    }
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
    render(renderer, scene, camera, full) {
      resizeBuffers(full)
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
      extract.uniforms.uTexel!.value.set(1 / bw, 0)
      renderer.setRenderTarget(ping)
      renderer.render(quadScene, quadCam)
      mesh.material = blur
      blur.uniforms.tDiffuse!.value = ping.texture
      texel.set(0, 1 / bh)
      renderer.setRenderTarget(pong)
      renderer.render(quadScene, quadCam)
      mesh.material = composite
      composite.uniforms.tBloom!.value = pong.texture
      renderer.setRenderTarget(null)
      renderer.render(quadScene, quadCam)
      renderer.setRenderTarget(prevTarget)
      renderer.autoClear = prevAuto
    },
  }
}
