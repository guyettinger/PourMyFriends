// gradient.frag — Final step of the pressure projection.
// Take the pressure field that the solver just computed and use it to
// "un-pile" the velocity: where pressure is high, fluid gets pushed
// downhill until everything's incompressible. After this pass, the
// velocity field is divergence-free and ready to be advected.
//
// Reads:  uPressure, uVelocity, neighbor UVs, cup uniforms.
// Writes: corrected velocity (RG).
// Math:   u_new = u − ∇p. The 2× factor (vs. the textbook central
//         difference) cancels with the 0.5 in divergence.frag.
// Cup walls: same Neumann boundary as pressure.frag.

precision highp float;
precision highp sampler2D;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;

void main () {
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  if (length(cupOff) > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float C = texture2D(uPressure, vUv).x;
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  if (length((vL - uCupCenter) / uCupRadiusUV) > 1.0) { L = C; }
  if (length((vR - uCupCenter) / uCupRadiusUV) > 1.0) { R = C; }
  if (length((vT - uCupCenter) / uCupRadiusUV) > 1.0) { T = C; }
  if (length((vB - uCupCenter) / uCupRadiusUV) > 1.0) { B = C; }
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
