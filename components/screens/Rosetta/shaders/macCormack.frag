// macCormack.frag — MacCormack correction step (advection limiter).
// Reads:  uField (φ⁰, original), uHat (φ̂, forward-advected), uBar (φ̄,
//         round-trip), uVelocity, uVelTexelSize, uTexelSize (target/field
//         grid — used for the limiter neighborhood), uDt, uDissipation,
//         cup uniforms.
// Writes: clamped, decayed corrected field.
// Math:   φ_corrected = φ̂ + 0.5 * (φ⁰ − φ̄), then clamped to the
//         min/max of the 4 corner samples around the back-traced coord.
// Invariant: uTexelSize must equal the field's native grid (target == uField
// grid in current pipeline). uVelTexelSize is the velocity grid for the trace.

precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D uField;
uniform sampler2D uHat;
uniform sampler2D uBar;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
uniform vec2 uVelTexelSize;
uniform float uDt;
uniform float uDissipation;
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;

void main () {
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  if (length(cupOff) > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 hat = texture2D(uHat, vUv);
  vec4 bar = texture2D(uBar, vUv);
  vec4 phi0 = texture2D(uField, vUv);
  vec4 corrected = hat + 0.5 * (phi0 - bar);
  vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uVelTexelSize;
  vec4 s00 = texture2D(uField, coord + vec2(-uTexelSize.x, -uTexelSize.y));
  vec4 s10 = texture2D(uField, coord + vec2( uTexelSize.x, -uTexelSize.y));
  vec4 s01 = texture2D(uField, coord + vec2(-uTexelSize.x,  uTexelSize.y));
  vec4 s11 = texture2D(uField, coord + vec2( uTexelSize.x,  uTexelSize.y));
  vec4 minV = min(min(s00, s10), min(s01, s11));
  vec4 maxV = max(max(s00, s10), max(s01, s11));
  corrected = clamp(corrected, minV, maxV);
  float decay = 1.0 + uDissipation * uDt;
  gl_FragColor = corrected / decay;
}
