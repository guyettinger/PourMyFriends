// splat.frag — Stamp a soft blob into either the velocity or dye buffer.
// One pass through this shader is one "drop" of the pour: the JS layer calls
// it three times per touch sample — once for radial fan-out, once for the
// directional stream, once to lay down the milk on the dye buffer.
//
// Reads:  uTarget (current field), uPoint (UV center), uColor (carries the
//         payload — dx/dy for velocity, milk strength for dye), uRadius,
//         uAspectRatio, uMaskMode (0 = velocity write / 1 = dye write),
//         uRadialMode (0 = circular kernel / 1 = anisotropic fan), uHeightFactor
//         (pitcher height 0..1), uPourDir, cup uniforms.
// Writes: velocity (RG) or dye (R = milk visibility, G = crema density).
// Note:   In radial mode the kernel stretches sideways across the pour axis,
//         giving a lateral fan rather than a perfect circle. The dye blend
//         is `max()` for milk and a soft subtract for crema (true
//         absorption-style blending happens later, in display.frag).

precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D uTarget;
uniform float uAspectRatio;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
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
  vec2 p_raw = vUv - uPoint.xy;
  vec2 p = vec2(p_raw.x * uAspectRatio, p_raw.y);
  float dist2 = dot(p, p);

  float s_iso = exp(-dist2 / uRadius);

  // Anisotropic Gaussian for radial pass: tighter along the pour axis,
  // wider perpendicular to it — a sideways fan that spreads radially.
  vec2 pourDirAC = normalize(vec2(uPourDir.x * uAspectRatio, uPourDir.y));
  float pPar = dot(p, pourDirAC);
  vec2 pPerpVec = p - pPar * pourDirAC;
  float pPerp2 = dot(pPerpVec, pPerpVec);
  float s_aniso = exp(-(pPar * pPar / (uRadius * 0.25) + pPerp2 / uRadius));

  float s = mix(s_iso, s_aniso, uRadialMode);
  vec4 base = texture2D(uTarget, vUv);

  if (uMaskMode > 0.5) {
    // Dye deposit. Pitcher height attenuates milk visibility (high = "fill"
    // pour, low = "draw" pour) and modulates how aggressively crema is disrupted.
    float drawVis = 1.0 - uHeightFactor;
    float milkStrength = s * uColor.r * drawVis;
    float newR = max(base.r, milkStrength);
    float cremaDisrupt = s * mix(0.12, 0.85, drawVis);
    float newG = max(0.0, base.g - cremaDisrupt);
    gl_FragColor = vec4(newR, newG, base.b, 1.0);
  } else {
    vec2 outward = p / (sqrt(dist2) + 0.0001);
    vec2 radialVel = vec2(outward.x / uAspectRatio, outward.y) * uColor.r;
    vec2 vel = mix(uColor.xy, radialVel, uRadialMode);
    vec3 splat = vec3(vel, 0.0) * s;
    gl_FragColor = vec4(base.xyz + splat, 1.0);
  }
}
