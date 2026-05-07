// divergence.frag — Compute ∇·u of the velocity field for the pressure solve.
// Reads:  uVelocity, neighbor UVs, uCupCenter, uCupRadiusUV.
// Writes: divergence in R channel.
// Math:   ∇·u = 0.5 * ((u_R − u_L) + (v_T − v_B)). The 0.5 is the canonical
//         central-difference scaling; gradient.frag intentionally omits its
//         matching 0.5 — the projection still produces a divergence-free
//         field because pressure absorbs the constant factor.
//         At cup walls (rect or circular) ghost cells reflect the normal
//         velocity component (no-slip Neumann) so flow doesn't escape.

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
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  if (length((vL - uCupCenter) / uCupRadiusUV) > 1.0) { L = -C.x; }
  if (length((vR - uCupCenter) / uCupRadiusUV) > 1.0) { R = -C.x; }
  if (length((vT - uCupCenter) / uCupRadiusUV) > 1.0) { T = -C.y; }
  if (length((vB - uCupCenter) / uCupRadiusUV) > 1.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
