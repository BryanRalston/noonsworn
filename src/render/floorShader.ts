import { Color, DataTexture, RepeatWrapping, ShaderMaterial, Texture, Vector2, Vector3, Vector4 } from 'three'
import { COLOR } from '../data/palette'
import { TUNING } from '../data/tuning'

const vertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragment = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec2 uSun;
uniform vec2 uDir;
uniform float uCosBeta;
uniform vec3 uPillars[12];
uniform float uPillarN;
uniform vec3 uSand;
uniform vec3 uSunlit;
uniform vec3 uShade;
uniform vec3 uShadeDeep;
uniform vec3 uGold;
uniform vec3 uFogColor;
uniform float uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform sampler2D uAlbedo;
uniform float uTexMix;
uniform float uEdgeBoost;

float clearance(vec2 s, vec2 p, vec2 c, float r) {
  vec2 d = p - s;
  float len2 = dot(d, d);
  if (len2 < 1e-6) return length(s - c) - r;
  float t = clamp(dot(c - s, d) / len2, 0.0, 1.0);
  return length(s + d * t - c) - r;
}

void main() {
  vec2 p = vWorld.xz;
  vec2 toP = p - uSun;
  float dist = length(toP);
  vec2 nrm = dist > 1e-4 ? toP / dist : uDir;
  float cosAng = dot(nrm, uDir);
  float cone = smoothstep(0.0, 0.4, (cosAng - uCosBeta) * max(dist, 0.001));
  float clearN = 40.0;
  for (int i = 0; i < 4; i++) {
    clearN = min(clearN, clearance(uSun, p, uPillars[i].xy, uPillars[i].z));
  }
  if (uPillarN > 4.5) {
    for (int i = 4; i < 12; i++) {
      if (float(i) >= uPillarN) break;
      clearN = min(clearN, clearance(uSun, p, uPillars[i].xy, uPillars[i].z));
    }
  }
  float shadow = smoothstep(-0.4, 0.4, clearN);
  float checker = mod(floor(p.x * 0.5) + floor(p.y * 0.5), 2.0);
  float bright = checker < 0.5 ? 0.96 : 1.04;
  vec3 sand = uSand * bright;
  vec3 litCol = mix(sand, uSunlit, 0.28);
  vec3 shadeCol = mix(sand, uShade, 0.7);
  vec3 shCol = mix(sand, uShadeDeep, 0.82);
  vec3 col = mix(shadeCol, litCol, clamp(cone, 0.0, 1.0));
  col = mix(shCol, col, clamp(shadow, 0.0, 1.0));
  float edge = smoothstep(4.2, 0.0, abs((cosAng - uCosBeta) * max(dist, 0.35)));
  col += uGold * edge * clamp(cone, 0.0, 1.0) * clamp(shadow, 0.0, 1.0) * (0.22 + uEdgeBoost);
  vec3 albedo = texture(uAlbedo, p * 0.08).rgb;
  col = mix(col, col * albedo, uTexMix);
  col *= mix(1.22, 1.05, clamp(cone, 0.0, 1.0));
  float medR = length(p);
  float medDisc = 1.0 - smoothstep(7.35, 7.5, medR);
  float ax = abs(p.x);
  float az = abs(p.y);
  float band = 0.0;
  if (az > 22.5 && az < 23.8 && ax < 23.9) band = 1.0;
  if (ax > 22.5 && ax < 23.8 && az < 23.9) band = 1.0;
  float medMask = max(medDisc, band);
  if (medMask > 0.001) {
    float rings = 0.985 + 0.015 * sin(medR * 5.0);
    vec3 sunMedal = uSand * rings;
    vec3 shadeOnly = mix(shCol, shadeCol, clamp(shadow, 0.0, 1.0));
    shadeOnly = mix(shadeOnly, shadeOnly * albedo, uTexMix);
    shadeOnly *= 1.05;
    float sunW = clamp(cone, 0.0, 1.0) * clamp(shadow, 0.0, 1.0);
    vec3 medal = mix(shadeOnly, sunMedal, sunW);
    col = mix(col, medal, medMask);
  }
  float fogF = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)) * uFog;
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface FloorUniforms {
  uSun: { value: Vector2 }
  uDir: { value: Vector2 }
  uCosBeta: { value: number }
  uPillars: { value: Vector3[] }
  uPillarN: { value: number }
  uSand: { value: Color }
  uSunlit: { value: Color }
  uShade: { value: Color }
  uShadeDeep: { value: Color }
  uGold: { value: Color }
  uFogColor: { value: Color }
  uFog: { value: number }
  uFogNear: { value: number }
  uFogFar: { value: number }
  uAlbedo: { value: Texture }
  uTexMix: { value: number }
  uEdgeBoost: { value: number }
  uWing: { value: Vector4 }
  uKind: { value: Vector4 }
}

function whiteTex(): DataTexture {
  const tex = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.needsUpdate = true
  return tex
}

export function createFloorMaterial(): { material: ShaderMaterial; uniforms: FloorUniforms } {
  const at = TUNING.arena.pillarAt
  const r = TUNING.arena.pillarR
  const uniforms: FloorUniforms = {
    uSun: { value: new Vector2(TUNING.sunRadius, 0) },
    uDir: { value: new Vector2(-1, 0) },
    uCosBeta: { value: Math.cos((TUNING.beamDeg * Math.PI) / 180) },
    uPillars: {
      value: [
        new Vector3(-at, -at, r),
        new Vector3(-at, at, r),
        new Vector3(at, -at, r),
        new Vector3(at, at, r),
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 0),
      ],
    },
    uPillarN: { value: 4 },
    uSand: { value: COLOR.sandstone.clone() },
    uSunlit: { value: COLOR.sunlit.clone() },
    uShade: { value: COLOR.shade.clone() },
    uShadeDeep: { value: COLOR.shadeDeep.clone() },
    uGold: { value: COLOR.gold.clone() },
    uFogColor: { value: COLOR.horizon.clone() },
    uFog: { value: 0 },
    uFogNear: { value: TUNING.camera.distance + TUNING.arena.fogAhead },
    uFogFar: { value: TUNING.camera.distance + TUNING.arena.fogSpan },
    uAlbedo: { value: whiteTex() },
    uTexMix: { value: 0 },
    uEdgeBoost: { value: 0 },
    uWing: { value: new Vector4(0, 0, 0, 0) },
    uKind: { value: new Vector4(0, 1, 2, 3) },
  }
  const material = new ShaderMaterial({
    uniforms: uniforms as unknown as ShaderMaterial['uniforms'],
    vertexShader: vertex,
    fragmentShader: fragment,
  })
  return { material, uniforms }
}

/** Same sun shader as the sanctum, tinted, drawn only for wings that are opening. */
export function createWingFloorMaterial(uniforms: FloorUniforms): ShaderMaterial {
  const frag = fragment
    .replace('uniform float uEdgeBoost;', 'uniform float uEdgeBoost;\nuniform vec4 uWing;\nuniform vec4 uKind;')
    .replace(
      'void main() {\n  vec2 p = vWorld.xz;',
      `void main() {
  vec2 p = vWorld.xz;
  float wingShow = 1.0;
  if (p.x > 24.15) wingShow = uWing.x;
  else if (p.x < -24.15) wingShow = uWing.z;
  else if (p.y > 24.15) wingShow = uWing.y;
  else if (p.y < -24.15) wingShow = uWing.w;
  if (wingShow < 0.5) discard;`,
    )
    .replace(
      'col *= mix(1.22, 1.05, clamp(cone, 0.0, 1.0));',
      `col *= mix(1.22, 1.05, clamp(cone, 0.0, 1.0));
  float depth = 0.0;
  float lat = 0.0;
  float kind = uKind.x;
  if (p.x > 24.15) { depth = p.x - 24.0; lat = p.y; kind = uKind.x; }
  else if (p.x < -24.15) { depth = -p.x - 24.0; lat = -p.y; kind = uKind.z; }
  else if (p.y > 24.15) { depth = p.y - 24.0; lat = -p.x; kind = uKind.y; }
  else { depth = -p.y - 24.0; lat = p.x; kind = uKind.w; }
  vec3 accent = vec3(0.78, 0.82, 0.88);
  float mark = 0.0;
  if (kind < 0.5) {
    float rr = length(vec2(depth - 9.0, lat * 0.85));
    mark = smoothstep(0.16, 0.0, abs(fract(rr * 0.28) - 0.5) - 0.32);
    accent = mix(vec3(0.70, 0.75, 0.82), vec3(0.96, 0.78, 0.36), mark);
  } else if (kind < 1.5) {
    float gx = abs(fract(depth * 0.24) - 0.5);
    float gy = abs(fract(lat * 0.30) - 0.5);
    mark = 1.0 - smoothstep(0.40, 0.48, min(gx, gy));
    accent = mix(vec3(0.66, 0.44, 0.18), vec3(0.40, 0.26, 0.11), mark);
  } else if (kind < 2.5) {
    float rip = sin(depth * 1.35 + lat * 0.45) * 0.5 + sin(lat * 1.15) * 0.5;
    mark = smoothstep(0.25, 0.85, rip);
    accent = mix(vec3(0.14, 0.40, 0.40), vec3(0.21, 0.84, 0.77), mark);
  } else {
    float d1 = abs(fract((depth + lat) * 0.16) - 0.5);
    float d2 = abs(fract((depth - lat) * 0.16) - 0.5);
    mark = 1.0 - smoothstep(0.015, 0.07, min(d1, d2));
    accent = mix(vec3(0.42, 0.07, 0.11), vec3(0.95, 0.72, 0.22), mark);
  }
  col = mix(col, col * accent * 1.45, 0.5);`,
    )
  return new ShaderMaterial({
    uniforms: uniforms as unknown as ShaderMaterial['uniforms'],
    vertexShader: vertex,
    fragmentShader: frag,
  })
}
