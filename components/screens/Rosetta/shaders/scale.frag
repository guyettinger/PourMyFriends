// scale.frag — Multiply every pixel of a texture by a constant.
// In this pipeline we use it once per step to fade the previous frame's
// pressure field by `config.PRESSURE` before the new pressure solve begins
// — a "warm start" that gives the iterative solver a head start without
// fully resetting it.
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
