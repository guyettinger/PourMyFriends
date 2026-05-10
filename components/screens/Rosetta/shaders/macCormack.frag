// macCormack.frag — Correction step that sits on top of basic advection.
// Plain semi-Lagrangian advection (advection.frag) tends to smear detail
// over time. The MacCormack scheme corrects for that smearing by using
// three samples — the original field, a forward-traced version, and a
// round-trip — to recover the lost sharpness. A clamp to neighboring
// values keeps the correction from inventing brand-new oscillations.
//
// Reads:  uField (φ, original), uHat (φ̂, forward-traced), uBar (φ̄,
//         round-trip), uVelocity, uVelTexelSize (velocity grid),
//         uTexelSize (the field's own grid — used for the local clamp
//         neighborhood), uDt, uDissipation, cup uniforms.
// Writes: corrected and (optionally) faded field.
// Math:   φ_new = clamp( φ̂ + 0.5 * (φ − φ̄),  min/max of 4 nearby cells ).

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
