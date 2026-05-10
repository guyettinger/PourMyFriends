// base.vert — The vertex shader every fragment pass uses.
// All it does is paint a fullscreen rectangle and pre-compute the UV
// coordinates of the four neighbor cells (left/right/top/bottom). Fragment
// shaders that do central-difference math on a grid (curl, divergence,
// pressure, etc.) read those neighbor UVs straight out of the varyings
// instead of recomputing them per pixel.
//
// Reads:  aPosition (the rectangle's corners), uTexelSize (1 / target size).
// Writes: vUv (the cell's UV), vL/vR/vT/vB (its neighbors' UVs).

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
