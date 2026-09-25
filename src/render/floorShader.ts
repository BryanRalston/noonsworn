import { Color, ShaderMaterial, Vector2, Vector3 } from 'three'
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
uniform vec3 uPillars[4];
uniform vec3 uSand;
uniform vec3 uSunlit;
uniform vec3 uShade;
uniform vec3 uShadeDeep;
uniform vec3 uGold;
uniform vec3 uFogColor;
uniform float uFog;

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
  float shadow = smoothstep(-0.4, 0.4, clearN);
  float checker = mod(floor(p.x * 0.5) + floor(p.y * 0.5), 2.0);
  float bright = checker < 0.5 ? 0.96 : 1.04;
  vec3 sand = uSand * bright;
  vec3 litCol = mix(sand, uSunlit, 0.62);
  vec3 shadeCol = mix(sand, uShade, 0.7);
  vec3 shCol = mix(sand, uShadeDeep, 0.82);
  vec3 col = mix(shadeCol, litCol, clamp(cone, 0.0, 1.0));
  col = mix(shCol, col, clamp(shadow, 0.0, 1.0));
  float ang = atan(p.y, p.x);
  float frac = abs(fract(ang / (3.14159265 / 6.0) + 0.5) - 0.5);
  float radial = length(p);
  float hour = (1.0 - smoothstep(0.0, 0.015, frac)) * smoothstep(0.6, 1.8, radial) * (1.0 - smoothstep(22.0, 24.0, radial));
  col = mix(col, uGold, hour * 0.9);
  float fogF = smoothstep(40.0, 78.0, length(cameraPosition - vWorld)) * uFog;
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export interface FloorUniforms {
  uSun: { value: Vector2 }
  uDir: { value: Vector2 }
  uCosBeta: { value: number }
  uPillars: { value: Vector3[] }
  uSand: { value: Color }
  uSunlit: { value: Color }
  uShade: { value: Color }
  uShadeDeep: { value: Color }
  uGold: { value: Color }
  uFogColor: { value: Color }
  uFog: { value: number }
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
      ],
    },
    uSand: { value: COLOR.sandstone.clone() },
    uSunlit: { value: COLOR.sunlit.clone() },
    uShade: { value: COLOR.shade.clone() },
    uShadeDeep: { value: COLOR.shadeDeep.clone() },
    uGold: { value: COLOR.gold.clone() },
    uFogColor: { value: COLOR.shadeDeep.clone() },
    uFog: { value: 0 },
  }
  const material = new ShaderMaterial({
    uniforms: uniforms as unknown as ShaderMaterial['uniforms'],
    vertexShader: vertex,
    fragmentShader: fragment,
  })
  return { material, uniforms }
}
