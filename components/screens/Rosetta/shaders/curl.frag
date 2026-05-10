// curl.frag — Measure how much the fluid is rotating at every cell.
// At each pixel we look at the velocity in our four neighbors and ask:
// is this a clockwise swirl, a counter-clockwise swirl, or a straight flow?
// The answer (a single signed number called "vorticity") feeds vorticity.frag,
// which uses it to keep swirls from melting away over time.
//
// Reads:  uVelocity (RG), neighbor UVs from base.vert, cup uniforms.
// Writes: signed vorticity in R.
// Math:   ω = ∂v/∂x − ∂u/∂y, via central differences.

precision highp float;
precision highp sampler2D;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;

void main () {
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  if (length(cupOff) > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
