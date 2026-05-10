// divergence.frag — How much fluid each cell is gaining or losing.
// In real life that number should be zero everywhere (you can't compress
// milk). When it's not, the next few passes (pressure + gradient subtract)
// nudge the velocity field until it is. This shader just measures the
// imbalance — it doesn't fix it yet.
//
// Reads:  uVelocity, neighbor UVs, cup uniforms.
// Writes: divergence in R.
// Math:   ∇·u = 0.5 * ((u_R − u_L) + (v_T − v_B)). The 0.5 here pairs with
//         a missing 0.5 in gradient.frag — the constant cancels out, so
//         the projection still produces a divergence-free field.
// Cup walls: the velocity component pointing into the wall is reflected,
// so the flow can't escape the cup.

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
