// advection.frag — Move a field along the velocity field by one time step.
// For each output cell we ask: "where was this stuff one step ago?" and
// fetch whatever was there. Used both to carry milk along the flow and to
// carry the velocity field along itself.
//
// Reads:  uVelocity (sim grid), uSource (the field being moved — velocity
//         or dye), uVelTexelSize, uDyeTexelSize (only used by the manual
//         bilinear fallback), uDt, uDissipation, cup uniforms.
// Writes: the moved field, optionally faded by uDissipation.
// Note:   uVelTexelSize is always the velocity grid (set from JS). That way
//         the same velocity value traces the same UV distance whether we're
//         moving the small velocity grid or the bigger dye grid.
// Note:   #ifdef MANUAL_FILTERING is the fallback for hardware that doesn't
//         support hardware bilinear filtering on float textures (rare today).
// Cup walls: trajectories that leave the cup are pulled back to the rim,
// so dye can't smear into the saucer.

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
