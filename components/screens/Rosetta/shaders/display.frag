precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uTexture;
uniform vec3 uEspresso;
uniform vec3 uMilk;
uniform vec3 uCremaTint;
uniform vec3 uMilkRim;
uniform vec3 uSpecularTint;
uniform float uMilkOpacity;
uniform vec2 texelSize;
// Native texel size of the dye texture (NOT the display target).
// The baseVertex varyings vL/vR/vT/vB use texelSize = display target's size,
// which is much finer than the dye grid; sampling at those offsets produces
// sub-dye-texel differences that alias to the 512-grid as directional streaks.
// We override with this uniform so Laplacian / tent / gradient see real
// dye neighbors.
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

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Bilinear-interpolated value noise — smooth over space, no pixelated hash grid.
float valueNoise(vec2 p) {
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
  // Outside-cup branch — render the cup background and skip all fluid logic.
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  float r = length(cupOff);
  if (r > 1.0) {
    gl_FragColor = vec4(uCupBackground, 1.0);
    return;
  }

  // Rim band — beveled ceramic, lit with the same light direction as milk.
  float innerR = 1.0 - uRimThicknessFrac;
  if (r > innerR) {
    float rim_t = (r - innerR) / uRimThicknessFrac;                  // 0 at inner edge, 1 at outer
    vec2 dScreen = (vUv - uCupCenter) * vec2(uAspect, 1.0);          // screen-aspect outward offset
    vec2 wallDir = dScreen / max(length(dScreen), 0.0001);           // outward direction in screen space
    vec3 rimNormal = normalize(vec3(wallDir * rim_t, 1.0 - rim_t));  // tilts outward as rim_t increases
    vec3 lightDir = normalize(vec3(0.2, 0.3, 1.0));                  // matches existing milk lighting
    float diff = clamp(dot(rimNormal, lightDir), 0.0, 1.0);
    vec3 rimColor = mix(uRimShadowColor, uRimColor, diff);
    gl_FragColor = vec4(rimColor, 1.0);
    return;
  }

  // All neighbor sampling uses dye's native texel size so we resolve actual
  // dye-cell differences instead of the derivative of bilinear interpolation.
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

  // Diagonal samples for 3x3 tent kernel
  float mtl = texture2D(uTexture, vUv + vec2(-d.x,  d.y)).r;
  float mtr = texture2D(uTexture, vUv + vec2( d.x,  d.y)).r;
  float mbl = texture2D(uTexture, vUv + vec2(-d.x, -d.y)).r;
  float mbr = texture2D(uTexture, vUv + vec2( d.x, -d.y)).r;

  // 3x3 tent blur (proper — now spans real dye texels)
  float edges = ml + mr + mt + mb;
  float corners = mtl + mtr + mbl + mbr;
  float mBlur = (4.0*m + 2.0*edges + corners) / 16.0;

  // Valley detection: Laplacian at dye-texel scale (stable, not display-res).
  float laplacian = ml + mr + mt + mb - 4.0 * m;
  float valley = clamp(laplacian * uValleyStrength * 3.0, 0.0, 1.0);

  // Beer-Lambert opacity: thin foam is translucent, thick foam is opaque
  float physAlpha = 1.0 - exp(-uFoamAbsorption * mBlur);

  // Sharpen the milk-espresso boundary
  float lo = mix(0.0, 0.3, uMaskHarden);
  float hi = mix(1.0, 0.65, uMaskHarden);
  float mEdge = smoothstep(lo, hi, physAlpha);
  float maskAlpha = clamp((mEdge - valley * 0.5) * uMilkOpacity, 0.0, 1.0);

  // Directional lighting from dye-texel-scale gradient (no bilinear aliasing).
  float dx = mr - ml;
  float dy = mt - mb;
  vec3 n = normalize(vec3(dx, dy, 0.15));
  vec3 lightDir = normalize(vec3(0.2, 0.3, 1.0));
  float diff = clamp(dot(n, lightDir), 0.0, 1.0);

  // Smooth grain — value noise at a frequency chosen so the cell is many
  // display pixels across (no per-pixel stipple).
  float grain = 1.0 - uCremaStrength * valueNoise(vUv * 120.0);
  vec3 espresso = uEspresso * grain;

  // Crema layer — tan-brown froth that sits on the espresso.
  // Density (dye.g) starts at 1.0 everywhere; pours erode it.
  float cremaDensity = texture2D(uTexture, vUv).g;
  vec3 cremaTint = uCremaTint * grain;
  vec3 cupSurface = mix(espresso, cremaTint, cremaDensity);

  // Specular highlight gated by maskAlpha with warm tint
  float spec = pow(max(n.z, 0.0), uSpecularPower) * uMilkSpecular * maskAlpha;
  spec = min(spec, uSpecularClamp);
  vec3 warmSpec = spec * uSpecularTint;
  vec3 milkCol = uMilk * (0.8 + 0.2 * diff) + warmSpec;
  vec3 base = mix(cupSurface, uMilkRim, smoothstep(0.0, 0.3, maskAlpha));
  vec3 c = mix(base, clamp(milkCol, 0.0, 1.0), smoothstep(0.2, 0.85, maskAlpha));

  // Inner-edge shadow: rim casts a soft shadow onto the latte. Shadow band is
  // 0.05 cup-radius wide, ending at the inner rim. Dim up to 45% at the wall.
  float innerEdge = 1.0 - uRimThicknessFrac;
  float shadowBand = smoothstep(innerEdge, innerEdge - 0.05, r);
  vec3 finalColor = c * mix(0.55, 1.0, shadowBand);

  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
