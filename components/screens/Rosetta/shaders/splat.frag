precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
uniform float uMaskMode;
uniform float uRadialMode;
uniform float uHeightFactor;
uniform vec2 uPourDir;
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;

void main () {
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  if (length(cupOff) > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 p_raw = vUv - point.xy;
  vec2 p = vec2(p_raw.x * aspectRatio, p_raw.y);
  float dist2 = dot(p, p);

  // Isotropic Gaussian for directional and dye passes
  float s_iso = exp(-dist2 / (radius));

  // Anisotropic Gaussian elongated along pour direction for radial pass
  vec2 pourDirAC = normalize(vec2(uPourDir.x * aspectRatio, uPourDir.y));
  float pPar = dot(p, pourDirAC);
  vec2 pPerpVec = p - pPar * pourDirAC;
  float pPerp2 = dot(pPerpVec, pPerpVec);
  float s_aniso = exp(-(pPar * pPar / (radius * 0.25) + pPerp2 / radius));

  float s = mix(s_iso, s_aniso, uRadialMode);

  vec4 base = texture2D(uTarget, vUv);

  if (uMaskMode > 0.5) {
    // Dye deposit: milk visibility in r, crema erosion in g
    float drawVis = 1.0 - uHeightFactor;
    float milkStrength = s * color.r * drawVis;
    float newR = max(base.r, milkStrength);
    // Crema is disrupted more at low pitcher (splashing through it)
    // and less at high pitcher (gentle displacement from below)
    float cremaDisrupt = s * mix(0.12, 0.85, drawVis);
    float newG = max(0.0, base.g - cremaDisrupt);
    gl_FragColor = vec4(newR, newG, base.b, 1.0);
  } else {
    // Velocity injection (directional or radial)
    vec2 outward = p / (sqrt(dist2) + 0.0001);
    vec2 radialVel = vec2(outward.x / aspectRatio, outward.y) * color.r;
    vec2 vel = mix(color.xy, radialVel, uRadialMode);
    vec3 splat = vec3(vel, 0.0) * s;
    gl_FragColor = vec4(base.xyz + splat, 1.0);
  }
}
