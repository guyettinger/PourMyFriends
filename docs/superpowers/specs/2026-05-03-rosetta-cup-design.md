# Rosetta in a Realistic Cup — Design Spec

**Date:** 2026-05-03
**Status:** Approved
**Scope:** `components/screens/Rosetta/index.tsx`

## Goal

Place the existing Rosetta latte-art fluid simulator inside a realistic top-down view of a coffee cup. The fluid surface becomes a circle (instead of the full screen rectangle), bounded by a beveled ceramic rim. The fluid simulation respects the circular wall as a hard reflective boundary, and pour input is constrained to inside the cup.

## Design Decisions

| Decision | Choice |
|---|---|
| Viewing angle | Top-down (true circle, no perspective warp) |
| Cup framing | Rim only — no saucer, no handle |
| Boundary physics | Hard reflective (no-flux), enforced in divergence/pressure/gradient shaders |
| Touch outside cup | Ignored entirely (no splat injected) |
| Cup size | Inset — diameter = 85% of `min(screen_w, screen_h)` |
| Rim style | Beveled ceramic, lit with the existing display-shader light direction |
| Implementation strategy | Analytic distance check inline in shaders (no SDF texture, no stencil) |

## Architecture Overview

The cup is an analytic shape (a circle) communicated to all relevant shaders via uniforms. There is **no new texture, no new pass, no new framebuffer**. The change is:

1. A shared geometry helper (`computeCupParams`) used by both JS and GL.
2. New uniforms on the existing sim-writing shaders that gate fragment output by an "inside cup" test.
3. A modified display shader that renders the cup rim and masks the fluid composite.
4. A boundary check in the JS PanResponder that rejects touches outside the cup.

## 1. Geometry & Coordinate System

### 1.1 Cup parameters

Cup is centered in UV space at `(0.5, 0.5)`. Its radius differs in UV-x vs UV-y so it appears as a true circle on screen regardless of aspect.

```
function computeCupParams(width, height) {
  const s = Math.min(width, height)
  const radiusPx = 0.5 * 0.85 * s            // 42.5% of min dim, in pixels
  return {
    center: [0.5, 0.5],
    radiusUV: [radiusPx / width, radiusPx / height],
    rimThicknessFrac: 0.04,                  // 4% of cup radius
  }
}
```

### 1.2 Normalized distance metric

In every shader that needs the cup boundary:

```glsl
uniform vec2 uCupCenter;       // (0.5, 0.5)
uniform vec2 uCupRadiusUV;     // (Rx, Ry) producing a true on-screen circle
uniform float uRimThicknessFrac; // 0.04

vec2 d = (vUv - uCupCenter) / uCupRadiusUV;
float r = length(d);
```

`r` is unitless: `r ≤ 1.0` is inside the cup wall, `r > 1.0` is outside. The rim band is `(1.0 - uRimThicknessFrac) ≤ r ≤ 1.0`. The pour area is `r ≤ (1.0 - uRimThicknessFrac)`.

### 1.3 Shared source of truth

Both the JS touch handler and the GL shader uniforms derive their cup geometry from `computeCupParams`. The JS handler calls it with `Dimensions.get('screen')`; the GL initialization calls it with `gl.drawingBufferWidth/Height`. This guarantees the inside-cup test agrees between JS and GL on every device.

## 2. Hard Reflective Circular Boundary

### 2.1 Outside-cell guard

Every sim-writing fragment shader (advection, MacCormack, splat, divergence, pressure, gradientSubtract) starts with a boundary guard:

```glsl
vec2 d = (vUv - uCupCenter) / uCupRadiusUV;
float r = length(d);
if (r > 1.0) {
  gl_FragColor = vec4(0.0);
  return;
}
```

This makes outside cells permanently inert — no stale velocity, dye, pressure, or divergence accumulates anywhere outside the cup. No separate clear pass is needed.

### 2.2 Boundary reflection in divergence

The existing divergence shader already mirrors velocity at the rectangular UV edges (`if (vL.x < 0.0) L = -C.x; ...`). Extend this to the circular wall: when a neighbor sample (vL/vR/vT/vB) falls outside the cup, replace its velocity with `-C` (the center cell's velocity). This is the same axis-aligned "stair-step" mirror the rectangular boundary uses.

```glsl
// existing: rectangular boundary
if (vL.x < 0.0) { L = -C.x; }
// new: circular boundary
vec2 dL = (vL - uCupCenter) / uCupRadiusUV;
if (length(dL) > 1.0) { L = -C.x; }
// (same pattern for R, T, B)
```

Note: this is a stair-step reflection, not a wall-normal reflection. It's the same approximation the existing rectangular code uses and is visually adequate at SIM_RESOLUTION=512. If aliasing artifacts appear at the rim, switch to a normal-aligned reflection: `v_corrected = v - max(0, dot(v, n)) * n` where `n = normalize((vUv - uCupCenter) / uCupRadiusUV)`.

### 2.3 Boundary reflection in pressure

When a neighbor falls outside the cup, treat it as having pressure equal to the center cell (Neumann boundary, ∂p/∂n = 0).

```glsl
vec2 dL = (vL - uCupCenter) / uCupRadiusUV;
if (length(dL) > 1.0) { L = C; }   // C is pressure at vUv
// (same pattern for R, T, B)
```

### 2.4 Boundary in gradient subtract

Same Neumann treatment as pressure: outside neighbors take the center cell's pressure value.

### 2.5 Advection backtrace clamp

Numerical error at exact wall cells can put `coord = vUv - dt * v * texelSize` slightly outside the cup. Without correction, the inside cell pulls a zero value (per §2.1) and a thin "dead band" appears at the rim.

Project the backtrace radially back onto the wall when it escapes:

```glsl
vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
vec2 dC = (coord - uCupCenter) / uCupRadiusUV;
float rC = length(dC);
if (rC > 1.0) {
  coord = uCupCenter + (dC / rC) * uCupRadiusUV;
}
```

Apply this in the advection shader for both velocity and dye advection.

## 3. Display Shader (Rim Rendering)

The display shader gets three branches based on `r`:

### 3.1 Outside the cup: `r > 1.0`

Output the existing `CUP_BACKGROUND_COLOR` directly. Skip all dye sampling and fluid logic.

### 3.2 Rim band: `(1.0 - uRimThicknessFrac) < r ≤ 1.0`

Render a beveled ceramic rim. The wall direction must be computed in screen-aspect space (not normalized cup space) so the lighting direction `(0.2, 0.3, 1.0)` lines up with the existing milk lighting on non-square screens.

```glsl
float rim_t = (r - (1.0 - uRimThicknessFrac)) / uRimThicknessFrac;  // 0..1 across the band
vec2 dScreen = (vUv - uCupCenter) * vec2(uAspect, 1.0);             // screen-aspect offset
vec2 wallDir = dScreen / max(length(dScreen), 0.0001);              // outward radial dir, in screen space
vec3 rimNormal = normalize(vec3(wallDir * rim_t, 1.0 - rim_t));     // tilts outward as rim_t increases

vec3 lightDir = normalize(vec3(0.2, 0.3, 1.0));                     // matches existing milk lighting
float diff = clamp(dot(rimNormal, lightDir), 0.0, 1.0);
vec3 rimColor = mix(uRimShadowColor, uRimColor, diff);
```

`uAspect` is the existing `aspectRatio` uniform (`gl.drawingBufferWidth / gl.drawingBufferHeight`).

### 3.2.1 Inner-edge shadow on the milk

Just inside the rim, the milk composite is darkened so the rim casts a soft inner shadow onto the latte surface. Define a shadow band of width `0.05` (5% of cup radius) ending at the inner rim:

```glsl
// inside the pour area (§3.3 branch)
float shadowBand = smoothstep(1.0 - uRimThicknessFrac, 1.0 - uRimThicknessFrac - 0.05, r);
// shadowBand = 1.0 well inside the cup, 0.0 right at the inner rim
vec3 finalColor = c * mix(0.55, 1.0, shadowBand);
```

`c` is the milk-over-espresso composite from the existing display logic. The inner ~5% of the cup is dimmed up to 45% at the wall, fading to no shadow further in. Constants `0.05` and `0.55` are tunable; could be exposed in `SETTING_DEFS` later.

### 3.3 Pour area: `r ≤ (1.0 - uRimThicknessFrac)`

Existing display logic — espresso + crema + milk + specular — applied unchanged.

### 3.4 New uniforms / config

Add to the `config` object:

| Key | Default | Notes |
|---|---|---|
| `RIM_COLOR` | `{ r: 0.92, g: 0.88, b: 0.82 }` | Warm ceramic off-white |
| `RIM_SHADOW_COLOR` | `{ r: 0.35, g: 0.28, b: 0.22 }` | Inner shadow tint |
| `CUP_INSET` | `0.85` | Fraction of `min(w, h)` used as cup diameter |
| `RIM_THICKNESS_FRAC` | `0.04` | Rim band as fraction of cup radius |

These are not exposed in `SETTING_DEFS` (they're aesthetic, not pour-tuning). Easy to expose later.

## 4. Touch Input

In `PanResponder.onPanResponderGrant` and `onPanResponderMove`, after computing UV `(x, y)` from `evt.nativeEvent.locationX/Y`:

```ts
const dx = (x - cup.center[0]) / cup.radiusUV[0]
const dy = (y - cup.center[1]) / cup.radiusUV[1]
const r = Math.sqrt(dx * dx + dy * dy)
const innerR = 1.0 - cup.rimThicknessFrac
if (r > innerR) {
  // For grant: do not set touchingRef.current = true; do not start pour.
  // For move:  do not push splat; do not update lastTouchRef.
  return
}
```

Where `cup` is the shared geometry from §1.3.

The continuous-pour interval (`startContinuousPouring`) reads from `lastTouchRef`, which only updates on valid in-cup touches, so it inherits the constraint with no extra code.

The release handler is unchanged.

## 5. Initialization Order

In `onContextCreate`:

1. After getting `gl.drawingBufferWidth/Height`, call `computeCupParams(...)` and stash on a local `cupParams` object.
2. Compile shaders as today; new uniforms (`uCupCenter`, `uCupRadiusUV`, `uRimThicknessFrac`, `uRimColor`, `uRimShadowColor`) are picked up by the existing `getUniforms` reflection.
3. In each shader's per-frame call, push the cup uniforms (cheap; values don't change). For the display shader add the two color uniforms; for sim shaders only the geometry uniforms.
4. No special initial clear is needed — outside cells are cleaned by the per-frame guard within one frame of sim startup.
5. Initial dye state is left as today (`g = 1.0` everywhere). Outside-cell `g` is overwritten to 0 by the advection guard on the first frame, and is never sampled by the display shader anyway, so the 1-frame inconsistency is invisible.

In the React component:

- `computeCupParams(SCREEN_WIDTH, SCREEN_HEIGHT)` is called once at module scope (or in a `useMemo`) and shared with the PanResponder.

## 6. Files Touched

- `components/screens/Rosetta/index.tsx` — only file modified.
  - Module scope: add `computeCupParams`, add cup-related config keys.
  - JS: PanResponder grant/move add inside-cup guard.
  - GLSL: update displayShader, splatShader, advectionShader, macCormackShader, divergenceShader, pressureShader, gradientShader to read cup uniforms and apply the boundary guard / boundary reflection / display branches as specified.
  - `onContextCreate`: compute cup params, push uniforms each frame.

No new files. No new dependencies.

## 7. Testing Checklist

Manual verification (this is a visual feature; type-check + lint pass aren't sufficient):

- [ ] Cup appears as a true circle on portrait phone (iPhone-class), landscape phone, portrait tablet, landscape tablet.
- [ ] Rim has visible directional lighting consistent with milk highlights.
- [ ] Pours inside the cup behave identically to today (no regression in latte-art rendering).
- [ ] Pours toward the rim pool against the wall (no momentum disappearing through the boundary).
- [ ] Touches outside the cup do nothing (no pour, no continuous drip starts).
- [ ] Dragging from inside the cup outward and back in does not cause crashes or visual glitches.
- [ ] Settings modal still works; reset still works; back/reset HUD buttons still work.
- [ ] No "dead band" or pixelated artifacts at the rim under fast pours.

## 8. Known Approximations / Future Work

- **Stair-step boundary reflection.** Velocity is mirrored along cell axes, not along the true wall normal. Visually fine at 512 sim resolution; revisit if rim-edge aliasing appears.
- **22% wasted GPU work.** The fluid sim runs on the full rectangular grid; cells outside the cup execute the boundary guard and exit. Could be optimized later with a tighter sim viewport, but adds complexity for marginal gain.
- **No saucer / no handle.** Out of scope for v1 (decision A on framing). The architecture supports adding them later as additional radial/elliptical SDF branches in the display shader.
- **Cup geometry is fixed at sim init.** Orientation changes during a session would not re-compute cup params. Acceptable because the existing sim already requires reset on resolution changes (the `simKey` mechanism handles this).
