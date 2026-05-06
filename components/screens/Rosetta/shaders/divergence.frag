precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
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
  // Existing rectangular boundary
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  // New: circular boundary — neighbor outside cup mirrors center velocity component
  if (length((vL - uCupCenter) / uCupRadiusUV) > 1.0) { L = -C.x; }
  if (length((vR - uCupCenter) / uCupRadiusUV) > 1.0) { R = -C.x; }
  if (length((vT - uCupCenter) / uCupRadiusUV) > 1.0) { T = -C.y; }
  if (length((vB - uCupCenter) / uCupRadiusUV) > 1.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
