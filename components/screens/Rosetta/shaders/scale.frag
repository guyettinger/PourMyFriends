// scale.frag — Scalar multiply pass; used as the per-step velocity dissipation
// reset on the pressure field. (Was historically misnamed "clear.frag".)
// Reads:  uSource (texture to scale), uValue (scalar multiplier).
// Writes: uValue * uSource sampled at vUv.

precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D uSource;
uniform float uValue;

void main () {
  gl_FragColor = uValue * texture2D(uSource, vUv);
}
