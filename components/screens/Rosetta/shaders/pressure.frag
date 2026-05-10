// pressure.frag — One step of the iterative pressure solve.
// Pressure is what tells the fluid "you can't pile up here, push outward."
// We don't solve for it in one shot; instead the JS layer runs this shader
// many times in a row (config.PRESSURE_ITERATIONS), and each pass nudges
// the pressure field a little closer to the right answer.
//
// Reads:  uPressure (last guess), uDivergence (from divergence.frag),
//         neighbor UVs, cup uniforms.
// Writes: refined pressure in R.
// Math:   p_new = (p_L + p_R + p_T + p_B − div) / 4   (Jacobi iteration).
// Cup walls: pressure has no gradient at the rim — the ghost cell just
// copies the center, so the fluid neither sucks nor pushes through the wall.

precision highp float;
precision highp sampler2D;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
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
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
