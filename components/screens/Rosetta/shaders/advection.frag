// advection.frag — Semi-Lagrangian advection of uSource by uVelocity.
// Reads:  uVelocity (sim grid), uSource (sim or dye grid), uVelTexelSize,
//         uDyeTexelSize (only used by MANUAL_FILTERING bilerp), uDt,
//         uDissipation, cup uniforms.
// Writes: advected field, divided by (1 + uDissipation*uDt) for decay.
// Math:   coord = vUv − uDt * vel(vUv) * uVelTexelSize.
//         uVelTexelSize is the velocity grid's 1/dim — bound from JS, NOT
//         the target FBO's texel size — so dye and velocity advection trace
//         the same UV distance for the same velocity value.
//         Trajectories that leave the cup are clamped to the cup wall.

precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uVelTexelSize;
uniform vec2 uDyeTexelSize;
uniform float uDt;
uniform float uDissipation;
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;

vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

void main () {
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  if (length(cupOff) > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - uDt * bilerp(uVelocity, vUv, uVelTexelSize).xy * uVelTexelSize;
  vec2 dC = (coord - uCupCenter) / uCupRadiusUV;
  float rC = length(dC);
  if (rC > 1.0) {
    coord = uCupCenter + (dC / rC) * uCupRadiusUV;
  }
  vec4 result = bilerp(uSource, coord, uDyeTexelSize);
#else
  vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uVelTexelSize;
  vec2 dC = (coord - uCupCenter) / uCupRadiusUV;
  float rC = length(dC);
  if (rC > 1.0) {
    coord = uCupCenter + (dC / rC) * uCupRadiusUV;
  }
  vec4 result = texture2D(uSource, coord);
#endif
  float decay = 1.0 + uDissipation * uDt;
  gl_FragColor = result / decay;
}
