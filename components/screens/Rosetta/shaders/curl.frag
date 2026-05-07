// curl.frag — Compute scalar 2D vorticity ω from the velocity field.
// Reads:  uVelocity (RG), neighbor UVs (vL/vR/vT/vB), uCupCenter, uCupRadiusUV.
// Writes: ω in R channel.
// Math:   ω = ∂v/∂x − ∂u/∂y, central-differenced: 0.5 * ((vR.y − vL.y) − (vT.x − vB.x)).

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
