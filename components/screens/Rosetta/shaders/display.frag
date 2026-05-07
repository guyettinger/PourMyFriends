// display.frag — Final composite: cup background + ceramic rim + espresso/crema
// surface + advected milk dye with Beer-Lambert opacity, valley shading,
// directional lighting, and warm specular highlight.
// Reads:  uTexture (dye RG = milk visibility, crema density), color uniforms,
//         shaping params (uMaskHarden, uFoamAbsorption, uMilkOpacity, etc.),
//         uDyeTexelSize (NOT the display target's texel size — see below),
//         cup geometry, uAspect.
// Writes: composited RGB.
// Note:   We resample neighbors locally with uDyeTexelSize because the
//         shared base.vert varyings vL/vR/vT/vB are bound to the display
//         target's texel size (much finer than the dye grid), which would
//         resolve as bilinear-interpolated streaks instead of true dye-cell
//         differences for the Laplacian / tent kernel / gradient.

precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec3 uEspresso;
uniform vec3 uMilk;
uniform vec3 uCremaTint;
uniform vec3 uMilkRim;
uniform vec3 uSpecularTint;
uniform float uMilkOpacity;
uniform vec2 uTexelSize;
uniform vec2 uDyeTexelSize;
uniform float uValleyStrength;
uniform float uCremaStrength;
uniform float uMilkSpecular;
uniform float uSpecularPower;
uniform float uMaskHarden;
uniform float uFoamAbsorption;
uniform float uSpecularClamp;
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;
uniform vec3 uCupBackground;
uniform float uRimThicknessFrac;
uniform vec3 uRimColor;
uniform vec3 uRimShadowColor;
uniform float uAspect;

// Look-and-feel constants. Promoted out of inline magic numbers so a future
// tuner can locate them without grepping the body.
const vec3 LIGHT_DIR = vec3(0.2, 0.3, 1.0);     // unnormalized; normalized at use
const float NORMAL_Z_BIAS = 0.15;               // raises the surface so flats stay lit
const float NOISE_FREQ = 120.0;                 // crema grain spatial frequency
const float RIM_SHADOW_BAND = 0.05;             // soft shadow band width (cup-radius units)
const float RIM_SHADOW_FLOOR = 0.55;            // shadow minimum brightness multiplier
const float VALLEY_GAIN = 3.0;                  // valley Laplacian boost

float hash21 (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise (vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main () {
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  float r = length(cupOff);
  if (r > 1.0) {
    gl_FragColor = vec4(uCupBackground, 1.0);
    return;
  }

  // Beveled ceramic rim band lit by the same light direction as the milk.
  float innerR = 1.0 - uRimThicknessFrac;
  if (r > innerR) {
    float rim_t = (r - innerR) / uRimThicknessFrac;
    vec2 dScreen = (vUv - uCupCenter) * vec2(uAspect, 1.0);
    vec2 wallDir = dScreen / max(length(dScreen), 0.0001);
    vec3 rimNormal = normalize(vec3(wallDir * rim_t, 1.0 - rim_t));
    vec3 lightDir = normalize(LIGHT_DIR);
    float diff = clamp(dot(rimNormal, lightDir), 0.0, 1.0);
    vec3 rimColor = mix(uRimShadowColor, uRimColor, diff);
    gl_FragColor = vec4(rimColor, 1.0);
    return;
  }

  vec2 d = uDyeTexelSize;
  vec2 uvL = vUv - vec2(d.x, 0.0);
  vec2 uvR = vUv + vec2(d.x, 0.0);
  vec2 uvT = vUv + vec2(0.0, d.y);
  vec2 uvB = vUv - vec2(0.0, d.y);

  float m  = texture2D(uTexture, vUv).r;
  float ml = texture2D(uTexture, uvL).r;
  float mr = texture2D(uTexture, uvR).r;
  float mt = texture2D(uTexture, uvT).r;
  float mb = texture2D(uTexture, uvB).r;
  float mtl = texture2D(uTexture, vUv + vec2(-d.x,  d.y)).r;
  float mtr = texture2D(uTexture, vUv + vec2( d.x,  d.y)).r;
  float mbl = texture2D(uTexture, vUv + vec2(-d.x, -d.y)).r;
  float mbr = texture2D(uTexture, vUv + vec2( d.x, -d.y)).r;

  // 3×3 tent kernel.
  float edges = ml + mr + mt + mb;
  float corners = mtl + mtr + mbl + mbr;
  float mBlur = (4.0 * m + 2.0 * edges + corners) / 16.0;

  float laplacian = ml + mr + mt + mb - 4.0 * m;
  float valley = clamp(laplacian * uValleyStrength * VALLEY_GAIN, 0.0, 1.0);

  float physAlpha = 1.0 - exp(-uFoamAbsorption * mBlur);

  float lo = mix(0.0, 0.3, uMaskHarden);
  float hi = mix(1.0, 0.65, uMaskHarden);
  float mEdge = smoothstep(lo, hi, physAlpha);
  float maskAlpha = clamp((mEdge - valley * 0.5) * uMilkOpacity, 0.0, 1.0);

  float dx = mr - ml;
  float dy = mt - mb;
  vec3 n = normalize(vec3(dx, dy, NORMAL_Z_BIAS));
  vec3 lightDir = normalize(LIGHT_DIR);
  float diff = clamp(dot(n, lightDir), 0.0, 1.0);

  float grain = 1.0 - uCremaStrength * valueNoise(vUv * NOISE_FREQ);
  vec3 espresso = uEspresso * grain;

  float cremaDensity = texture2D(uTexture, vUv).g;
  vec3 cremaTint = uCremaTint * grain;
  vec3 cupSurface = mix(espresso, cremaTint, cremaDensity);

  float spec = pow(max(n.z, 0.0), uSpecularPower) * uMilkSpecular * maskAlpha;
  spec = min(spec, uSpecularClamp);
  vec3 warmSpec = spec * uSpecularTint;
  vec3 milkCol = uMilk * (0.8 + 0.2 * diff) + warmSpec;
  vec3 base = mix(cupSurface, uMilkRim, smoothstep(0.0, 0.3, maskAlpha));
  vec3 c = mix(base, clamp(milkCol, 0.0, 1.0), smoothstep(0.2, 0.85, maskAlpha));

  // Inner-rim shadow band — rim casts onto the latte surface.
  float innerEdge = 1.0 - uRimThicknessFrac;
  float shadowBand = smoothstep(innerEdge, innerEdge - RIM_SHADOW_BAND, r);
  vec3 finalColor = c * mix(RIM_SHADOW_FLOOR, 1.0, shadowBand);

  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
