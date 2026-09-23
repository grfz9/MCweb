// Shaders GLSL ES 3.0.

const LIGHT_FN = `
uniform float u_gamma;
float lightCurve(float l) {
  float b = l / (4.0 - 3.0 * l);
  return mix(b, 1.0 - pow(1.0 - b, 4.0), u_gamma);
}
`;

export const CHUNK_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_pos;
layout(location = 1) in vec4 a_uv;
layout(location = 2) in vec4 a_light;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
uniform vec3 u_chunkWorld;
uniform float u_time;
uniform vec2 u_fog;
out vec3 v_uv;
out vec3 v_light;
out float v_fog;
void main() {
  vec3 p = a_pos.xyz / 16.0;
  vec3 pos = p + u_offset;
  vec2 uv = a_uv.xy / 16.0;
  float anim = a_uv.z;
  vec3 wp = p + u_chunkWorld;
  if (anim == 1.0) {
    uv += vec2(u_time * 0.015, u_time * 0.04);
  } else if (anim == 2.0) {
    uv += vec2(u_time * 0.006, u_time * 0.012);
  } else if (anim == 3.0) {
    pos.x += sin(u_time * 1.3 + wp.x * 0.6 + wp.y * 0.4) * 0.018;
    pos.z += cos(u_time * 1.1 + wp.z * 0.6 + wp.y * 0.3) * 0.018;
  } else if (anim == 4.0) {
    pos.x += sin(u_time * 1.8 + wp.x * 0.7 + wp.z * 0.3) * 0.07;
    pos.z += cos(u_time * 1.5 + wp.z * 0.7 + wp.x * 0.2) * 0.05;
  }
  gl_Position = u_viewProj * vec4(pos, 1.0);
  v_uv = vec3(uv, a_pos.w);
  v_light = vec3(a_light.x / 240.0, a_light.y / 240.0, a_light.z / 255.0);
  float d = length(pos);
  v_fog = clamp((d - u_fog.x) / (u_fog.y - u_fog.x), 0.0, 1.0);
}`;

export const CHUNK_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray u_tex;
uniform float u_sun;
uniform vec3 u_skyLightColor;
uniform vec3 u_fogColor;
uniform float u_alphaTest;
in vec3 v_uv;
in vec3 v_light;
in float v_fog;
out vec4 o_color;
${LIGHT_FN}
void main() {
  vec4 c = texture(u_tex, v_uv);
  if (c.a < u_alphaTest) discard;
  float sky = lightCurve(clamp(v_light.x * u_sun, 0.0, 1.0));
  float blk = lightCurve(clamp(v_light.y, 0.0, 1.0));
  vec3 light = max(sky * u_skyLightColor, blk * vec3(1.0, 0.87, 0.68));
  light = max(light, vec3(0.045));
  vec3 col = c.rgb * light * v_light.z;
  col = mix(col, u_fogColor, v_fog * v_fog);
  o_color = vec4(col, c.a);
}`;

export const SKY_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_ndc;
void main() {
  v_ndc = a_pos;
  gl_Position = vec4(a_pos, 0.9999, 1.0);
}`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec2 v_ndc;
uniform vec3 u_camF;
uniform vec3 u_camR;
uniform vec3 u_camU;
uniform vec2 u_tan;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform vec3 u_sunDir;
uniform vec3 u_glow;
uniform float u_stars;
uniform float u_underwater;
out vec4 o_color;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec3 dir = normalize(u_camF + u_camR * v_ndc.x * u_tan.x + u_camU * v_ndc.y * u_tan.y);
  float h = dir.y;
  vec3 col = mix(u_horizon, u_zenith, smoothstep(-0.02, 0.45, h));
  col = mix(col, u_horizon * 0.55, smoothstep(0.0, -0.35, h));
  float sd = dot(dir, u_sunDir);
  col += u_glow * pow(max(sd, 0.0), 6.0) * (1.0 - smoothstep(0.0, 0.6, abs(h)));
  // Soleil et lune carrés
  vec3 sR = vec3(0.0, 0.0, 1.0);
  vec3 sU = normalize(cross(sR, u_sunDir));
  if (sd > 0.0) {
    vec2 q = vec2(dot(dir, sR), dot(dir, sU)) / sd;
    float m = max(abs(q.x), abs(q.y));
    if (m < 0.09) col = mix(vec3(1.0, 0.98, 0.8), vec3(1.0, 1.0, 0.95), step(m, 0.06));
    else col += vec3(1.0, 0.9, 0.6) * 0.25 * (1.0 - smoothstep(0.09, 0.3, m));
  } else {
    vec2 q = vec2(dot(dir, sR), dot(dir, sU)) / -sd;
    float m = max(abs(q.x), abs(q.y));
    if (m < 0.06) {
      vec2 cell = floor((q + 0.06) / 0.03);
      float spot = step(0.7, hash(vec3(cell, 3.0)));
      col = mix(vec3(0.85, 0.88, 0.95), vec3(0.62, 0.65, 0.72), spot);
    }
  }
  // Étoiles
  if (u_stars > 0.01 && h > 0.0) {
    vec3 cell = floor(dir * 180.0);
    float s = hash(cell);
    if (s > 0.9975) col += vec3(u_stars * (0.5 + 0.5 * fract(s * 1000.0)));
  }
  col = mix(col, vec3(0.05, 0.12, 0.35), u_underwater);
  o_color = vec4(col, 1.0);
}`;

export const CLOUD_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
uniform mat4 u_viewProj;
uniform float u_height;
uniform float u_size;
out vec2 v_xz;
void main() {
  vec3 p = vec3(a_pos.x * u_size, u_height, a_pos.y * u_size);
  v_xz = p.xz;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

export const CLOUD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_clouds;
uniform vec2 u_offset;
uniform vec3 u_color;
uniform vec3 u_fogColor;
uniform float u_size;
in vec2 v_xz;
out vec4 o_color;
void main() {
  vec2 uv = (v_xz + u_offset) / 12.0 / 256.0;
  float c = texture(u_clouds, uv).r;
  if (c < 0.5) discard;
  float d = length(v_xz) / u_size;
  float a = 0.82 * (1.0 - smoothstep(0.55, 1.0, d));
  o_color = vec4(mix(u_color, u_fogColor, smoothstep(0.3, 1.0, d) * 0.6), a);
}`;

export const LINE_VS = `#version 300 es
layout(location = 0) in vec3 a_pos;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
void main() {
  gl_Position = u_viewProj * vec4(a_pos + u_offset, 1.0);
}`;

export const LINE_FS = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 o_color;
void main() { o_color = u_color; }`;

export const MODEL_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_uvl;
layout(location = 2) in float a_shade;
uniform mat4 u_viewProj;
uniform mat4 u_model;
uniform vec2 u_fog;
uniform float u_layer;
out vec3 v_uv;
out float v_shade;
out float v_fog;
void main() {
  vec4 p = u_model * vec4(a_pos, 1.0);
  gl_Position = u_viewProj * p;
  v_uv = vec3(a_uvl.xy, u_layer >= 0.0 ? u_layer : a_uvl.z);
  v_shade = a_shade;
  float d = length(p.xyz);
  v_fog = clamp((d - u_fog.x) / (u_fog.y - u_fog.x), 0.0, 1.0);
}`;

export const MODEL_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray u_tex;
uniform vec2 u_light;
uniform float u_sun;
uniform vec3 u_skyLightColor;
uniform vec4 u_tint;
uniform vec3 u_fogColor;
uniform float u_unlit;
in vec3 v_uv;
in float v_shade;
in float v_fog;
out vec4 o_color;
${LIGHT_FN}
void main() {
  vec4 c = texture(u_tex, v_uv);
  if (c.a < 0.1) discard;
  if (u_unlit > 0.5) { o_color = c; return; }
  float sky = lightCurve(clamp(u_light.x * u_sun, 0.0, 1.0));
  float blk = lightCurve(u_light.y);
  vec3 light = max(max(sky * u_skyLightColor, blk * vec3(1.0, 0.87, 0.68)), vec3(0.06));
  vec3 col = c.rgb * light * v_shade;
  col = mix(col, u_tint.rgb, u_tint.a);
  col = mix(col, u_fogColor, v_fog * v_fog);
  o_color = vec4(col, 1.0);
}`;
