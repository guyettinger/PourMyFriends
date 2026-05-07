// base.vert — Shared fullscreen-quad vertex shader for every fragment pass.
// Reads:  aPosition (clip-space quad corners), uTexelSize (1 / target dims).
// Writes: vUv (UV in [0,1]), vL/vR/vT/vB (neighbor UV offsets for stencils).
// Math:   vUv = aPosition*0.5 + 0.5; neighbor UVs = vUv ± uTexelSize basis.

precision highp float;

attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 uTexelSize;

void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(uTexelSize.x, 0.0);
  vR = vUv + vec2(uTexelSize.x, 0.0);
  vT = vUv + vec2(0.0, uTexelSize.y);
  vB = vUv - vec2(0.0, uTexelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
