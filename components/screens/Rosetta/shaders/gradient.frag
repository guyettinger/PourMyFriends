precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
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
  // Neumann boundary: outside neighbor takes the center cell's pressure
  if (length((vL - uCupCenter) / uCupRadiusUV) > 1.0) { L = C; }
  if (length((vR - uCupCenter) / uCupRadiusUV) > 1.0) { R = C; }
  if (length((vT - uCupCenter) / uCupRadiusUV) > 1.0) { T = C; }
  if (length((vB - uCupCenter) / uCupRadiusUV) > 1.0) { B = C; }
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
