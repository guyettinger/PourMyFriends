// vorticity.frag — "Vorticity confinement": find existing swirls and give
// them a nudge in the direction they're already turning. Coarse-grid fluid
// sims tend to lose detail to numerical smoothing; this pass puts the
// swirly motion back, giving the milk that lively, latte-art look.
//
// Reads:  uVelocity, uCurl (output of curl.frag), uCurlStrength (ε), uDt,
//         cup uniforms.
// Writes: velocity (RG), pushed along the curl-cross-z direction by ε * ω.

precision highp float;
precision highp sampler2D;

varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;

void main () {
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  if (length(cupOff) > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * uDt;
  velocity = clamp(velocity, -1000.0, 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
