# Rosetta Cup Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place the Rosetta latte-art fluid simulator inside a realistic top-down coffee cup with a circular fluid surface bounded by a beveled ceramic rim and a hard reflective wall.

**Architecture:** A shared analytic-circle geometry helper (`computeCupParams`) drives both JS touch gating and a set of new GLSL uniforms. Sim-writing shaders gate output via an "inside cup" test and reflect velocity/pressure at the wall. The display shader gets three branches (outside / rim / pour). No new files, no new framebuffers, no new passes.

**Tech Stack:** React Native, Expo, expo-gl, WebGL fragment shaders (GLSL ES), TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-05-03-rosetta-cup-design.md`

---

## Staging Strategy

The implementation is sequenced so each commit produces a working, testable state:

1. **Foundation** — pure-JS `computeCupParams` helper + cup config keys. Compiles, no visual change.
2. **Display branches** — display shader gets outside/rim/pour branches. The cup becomes visible. Fluid still simulates over the full rectangle but is clipped by display.
3. **Touch gate** — PanResponder rejects out-of-cup touches. Pour input now confined to the circle.
4. **Sim boundary guard** — every sim-writing shader gets the per-frame `r > 1.0 → vec4(0)` guard. Fluid no longer accumulates outside the cup.
5. **Sim boundary reflection** — divergence reflects, pressure/gradient Neumann, advection backtrace clamp. Fluid pools against the wall.
6. **Visual verification** — manual checklist from spec §7.

Each stage is independently shippable and visually distinguishable from the prior, which makes regressions obvious.

---

## File Structure

**Modified:**
- `components/screens/Rosetta/index.tsx` — only production file touched.
  - Top-of-file: add `computeCupParams` helper, add cup-related config keys.
  - Shaders (module scope): edit `displayShader`, `splatShader`, `divergenceShader`, `pressureShader`, `gradientShader`, `advectionShader`, `macCormackShader` to read cup uniforms and apply guards/reflection/branches.
  - `RosettaScreen` component: hold `cupParams` (shared with PanResponder), gate touches outside the cup.
  - `onContextCreate`: stash `cupParams` in closure, push cup uniforms each frame from `splat`, `drawDisplay`, and `step`.

**Created (test):**
- `components/screens/Rosetta/__tests__/computeCupParams.test.ts` — unit tests for the geometry helper (the only piece that's amenable to unit testing; everything else is GPU/visual).

No new dependencies. No new framebuffers. No file restructuring.

---

## Task 1: `computeCupParams` Helper + Tests

Add a pure helper that produces the cup's UV-space geometry from drawing-buffer dimensions. JS and GL will both call it so they agree on every device.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — add helper near the top (just below `SCREEN_WIDTH`/`SCREEN_HEIGHT` constants around line 31) and an exported type.
- Create: `components/screens/Rosetta/__tests__/computeCupParams.test.ts`

- [ ] **Step 1: Write the failing test**

Create `components/screens/Rosetta/__tests__/computeCupParams.test.ts`:

```ts
import { computeCupParams } from '../index'

describe('computeCupParams', () => {
  it('returns center at (0.5, 0.5)', () => {
    const p = computeCupParams(800, 1200)
    expect(p.center).toEqual([0.5, 0.5])
  })

  it('produces a true on-screen circle: radiusUV.x * width === radiusUV.y * height', () => {
    const p = computeCupParams(800, 1200)
    const onScreenRadiusX = p.radiusUV[0] * 800
    const onScreenRadiusY = p.radiusUV[1] * 1200
    expect(onScreenRadiusX).toBeCloseTo(onScreenRadiusY, 6)
  })

  it('uses 42.5% of the smaller dimension as the cup radius', () => {
    const p = computeCupParams(800, 1200)
    const expectedRadiusPx = 0.5 * 0.85 * 800
    expect(p.radiusUV[0] * 800).toBeCloseTo(expectedRadiusPx, 6)
    expect(p.radiusUV[1] * 1200).toBeCloseTo(expectedRadiusPx, 6)
  })

  it('handles landscape orientation (width > height)', () => {
    const p = computeCupParams(1200, 800)
    const expectedRadiusPx = 0.5 * 0.85 * 800
    expect(p.radiusUV[0] * 1200).toBeCloseTo(expectedRadiusPx, 6)
    expect(p.radiusUV[1] * 800).toBeCloseTo(expectedRadiusPx, 6)
  })

  it('handles square viewport', () => {
    const p = computeCupParams(1000, 1000)
    expect(p.radiusUV[0]).toBeCloseTo(p.radiusUV[1], 6)
    expect(p.radiusUV[0]).toBeCloseTo(0.425, 6)
  })

  it('returns rim thickness fraction of 0.04', () => {
    const p = computeCupParams(800, 1200)
    expect(p.rimThicknessFrac).toBeCloseTo(0.04, 6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn jest components/screens/Rosetta/__tests__/computeCupParams.test.ts`
Expected: FAIL with "computeCupParams is not exported" or similar import error.

- [ ] **Step 3: Add the helper and type to `components/screens/Rosetta/index.tsx`**

Insert immediately after the `SCREEN_HEIGHT` declaration (around line 31). The helper must be exported so the test file can import it.

```ts
const SCREEN_WIDTH = Dimensions.get('screen').width
const SCREEN_HEIGHT = Dimensions.get('screen').height

/**
 * Cup geometry in UV space. The cup is a circle on screen but stored as an ellipse
 * in UV coordinates so it stays a true circle regardless of aspect ratio.
 *
 * `radiusUV` is `[Rx, Ry]` such that `Rx * width === Ry * height`.
 */
export interface CupParams {
  center: [number, number]
  radiusUV: [number, number]
  rimThicknessFrac: number
}

/**
 * Compute the cup geometry for a given viewport. Used by both the JS PanResponder
 * (to gate touches) and the GL uniforms (for shader branching) so they agree.
 *
 * Cup is centered at (0.5, 0.5) UV with diameter equal to 85% of `min(width, height)`.
 * Rim band is 4% of the cup radius.
 */
export const computeCupParams = (width: number, height: number): CupParams => {
  const s = Math.min(width, height)
  const radiusPx = 0.5 * 0.85 * s
  return {
    center: [0.5, 0.5],
    radiusUV: [radiusPx / width, radiusPx / height],
    rimThicknessFrac: 0.04,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn jest components/screens/Rosetta/__tests__/computeCupParams.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Verify type-check still passes**

Run: `yarn check:lint` (project's TS-aware lint) and verify no new errors are introduced. (ESLint may show a pre-existing `stylish` formatter error per the project memory — that's the known broken-lint state, ignore it. New errors specifically about the file you just edited are not OK.)

- [ ] **Step 6: Commit**

```bash
git add components/screens/Rosetta/index.tsx components/screens/Rosetta/__tests__/computeCupParams.test.ts
git commit -m "$(cat <<'EOF'
feat(rosetta): add computeCupParams geometry helper

Single source of truth for cup geometry shared between JS touch
handler and GL shader uniforms. Returns a centered circle in UV
space with aspect-corrected radius so it renders as a true circle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Cup Config Keys

Add the four new aesthetic config keys to the `config` object. They're not exposed in `SETTING_DEFS` (they're aesthetic, not pour-tuning), but they need to live in `config` so shaders can read them.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `config` object (around line 135-181)

- [ ] **Step 1: Add new config keys**

In the `config` object, add the four cup-related keys. Place them grouped together with a section comment, above the existing color section. The exact placement: after `PAUSED: false,` (around line 162) and before the `// Colors` comment.

```ts
// Cup geometry & rim look
CUP_INSET: 0.85,
RIM_THICKNESS_FRAC: 0.04,
RIM_COLOR: { r: 0.92, g: 0.88, b: 0.82 } as RGBColor,
RIM_SHADOW_COLOR: { r: 0.35, g: 0.28, b: 0.22 } as RGBColor,
```

(`CUP_INSET` and `RIM_THICKNESS_FRAC` are duplicated as defaults in `computeCupParams` so the helper stays a pure function. If they ever need to vary at runtime, plumb them through `computeCupParams` arguments.)

- [ ] **Step 2: Verify type-check**

Run: `yarn check:lint`
Expected: No new errors from the file.

- [ ] **Step 3: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): add cup config keys for rim color and inset

Aesthetic-only knobs (RIM_COLOR, RIM_SHADOW_COLOR, CUP_INSET,
RIM_THICKNESS_FRAC) added to the config object. Not exposed in
SETTING_DEFS yet — easy to expose later if needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Display Shader — Outside-Cup Branch

Stage 1 of the display shader edit: render the area outside the cup as `CUP_BACKGROUND_COLOR`. After this task the rest of the screen (around the cup) becomes the dark espresso background and the fluid simulation is visibly clipped to a rectangle inscribed in the cup region. The rim band is drawn the same as the pour area for now — we add the rim render in Task 4.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `displayShader` GLSL string (around line 240) and `drawDisplay` function (around line 1385).

- [ ] **Step 1: Edit `displayShader` — add cup uniforms and the outside branch**

In the `displayShader` source, add the three new uniforms in the uniform block at the top (just after `uniform float uSpecularClamp;` around line 268) and add the early-out branch at the very top of `main()` (right before any sampling).

Add these uniforms:

```glsl
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;
uniform vec3 uCupBackground;
```

At the top of `main()` (immediately after `void main () {`, before any `vec2 d = uDyeTexelSize;` line), insert:

```glsl
  // Outside-cup branch — render the cup background and skip all fluid logic.
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  float r = length(cupOff);
  if (r > 1.0) {
    gl_FragColor = vec4(uCupBackground, 1.0);
    return;
  }
```

(The variable name `d` already exists later in `main()` for `uDyeTexelSize`. That's why the cup-distance vector is named `cupOff` instead of `d`.)

- [ ] **Step 2: Wire the new uniforms in `drawDisplay`**

In `drawDisplay` (around line 1385), after the existing `gl.uniform2f(...uDyeTexelSize...)` call (around line 1421) and before `blit(target)`, push the cup uniforms. Pull `cupParams` from a closure variable that you'll define in `onContextCreate` (Step 3 below).

```ts
gl.uniform2f(displayProgram.uniforms.uCupCenter, cupParams.center[0], cupParams.center[1])
gl.uniform2f(displayProgram.uniforms.uCupRadiusUV, cupParams.radiusUV[0], cupParams.radiusUV[1])
gl.uniform3f(
  displayProgram.uniforms.uCupBackground,
  config.CUP_BACKGROUND_COLOR.r,
  config.CUP_BACKGROUND_COLOR.g,
  config.CUP_BACKGROUND_COLOR.b,
)
```

- [ ] **Step 3: Compute `cupParams` in `onContextCreate`**

In `onContextCreate` (around line 934), after `const { ext } = getWebGLContext(gl)` (line 1023) and before the shader compilation block, add:

```ts
const cupParams = computeCupParams(gl.drawingBufferWidth, gl.drawingBufferHeight)
```

This makes `cupParams` available to all the inner functions that follow (`splat`, `drawDisplay`, `step`).

- [ ] **Step 4: Visual verification**

Run: `yarn ios` (or `yarn android`, or `yarn web`) and observe:
- The screen outside a centered circle is the dark espresso background color (`CUP_BACKGROUND_COLOR`).
- The fluid simulation is visible only inside the circle.
- No errors in the JS console.

(There is no automated test for this — the spec calls out manual visual verification.)

- [ ] **Step 5: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): clip display shader to circular cup

Display shader now branches: outside the cup → CUP_BACKGROUND_COLOR;
inside → existing latte-art logic. Cup geometry comes from
computeCupParams via uCupCenter and uCupRadiusUV uniforms.

Fluid sim still runs over the full rectangle; only the display
output is masked. Boundary handling comes in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Display Shader — Beveled Rim Band

Stage 2 of the display shader edit: draw the beveled ceramic rim band, lit by the same light direction as the existing milk highlights. After this task the cup has a visible rim with directional lighting.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `displayShader` GLSL (around line 240), `drawDisplay` (around line 1385).

- [ ] **Step 1: Add rim-related uniforms to `displayShader`**

Just below the cup uniforms added in Task 3, add:

```glsl
uniform float uRimThicknessFrac;
uniform vec3 uRimColor;
uniform vec3 uRimShadowColor;
uniform float uAspect;
```

- [ ] **Step 2: Add the rim branch in `main()`**

Replace the outside-branch block from Task 3 to handle three cases. The `r > 1.0` early-out stays. Then add the rim band immediately after it (still before the existing fluid logic).

```glsl
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
```

(`uAspect` is the screen aspect ratio: `width / height`. The existing milk lighting uses `vec3(0.2, 0.3, 1.0)` — see line 330 of the existing display shader — so the rim shares it.)

- [ ] **Step 3: Wire rim uniforms in `drawDisplay`**

Below the cup uniforms added in Task 3, add:

```ts
gl.uniform1f(displayProgram.uniforms.uRimThicknessFrac, cupParams.rimThicknessFrac)
gl.uniform3f(displayProgram.uniforms.uRimColor, config.RIM_COLOR.r, config.RIM_COLOR.g, config.RIM_COLOR.b)
gl.uniform3f(
  displayProgram.uniforms.uRimShadowColor,
  config.RIM_SHADOW_COLOR.r,
  config.RIM_SHADOW_COLOR.g,
  config.RIM_SHADOW_COLOR.b,
)
gl.uniform1f(displayProgram.uniforms.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight)
```

- [ ] **Step 4: Visual verification**

Run: `yarn ios` (or whichever platform).
- A visible warm off-white rim band appears around the cup, ~4% of the cup radius wide.
- The rim has clear directional shading: brighter on the upper-left side, darker on the lower-right.
- The rim is a true circle on portrait phone, landscape phone, and tablet form factors.

- [ ] **Step 5: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): render beveled ceramic rim band

Rim band drawn between r = 1 - uRimThicknessFrac and r = 1.
Beveled normal tilts outward as r increases; lit with the existing
milk light direction (0.2, 0.3, 1.0) so highlights line up.
Wall direction is computed in screen-aspect space so lighting is
consistent on non-square viewports.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Display Shader — Inner-Edge Shadow

Final stage of the display shader edit: dim the milk composite near the inner rim so the rim casts a soft shadow onto the latte. This is the last visual touch on the display side.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `displayShader` GLSL (around line 240).

- [ ] **Step 1: Add the inner-edge shadow to `main()`**

In the existing display shader, the final composite computes `vec3 c = mix(base, clamp(milkCol, 0.0, 1.0), smoothstep(0.2, 0.85, maskAlpha));` near the bottom (around line 350). Multiply that final color by an inner-shadow factor before writing to `gl_FragColor`.

Replace:

```glsl
  vec3 c = mix(base, clamp(milkCol, 0.0, 1.0), smoothstep(0.2, 0.85, maskAlpha));
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
```

With:

```glsl
  vec3 c = mix(base, clamp(milkCol, 0.0, 1.0), smoothstep(0.2, 0.85, maskAlpha));

  // Inner-edge shadow: rim casts a soft shadow onto the latte. Shadow band is
  // 0.05 cup-radius wide, ending at the inner rim. Dim up to 45% at the wall.
  float innerEdge = 1.0 - uRimThicknessFrac;
  float shadowBand = smoothstep(innerEdge, innerEdge - 0.05, r);
  vec3 finalColor = c * mix(0.55, 1.0, shadowBand);

  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
```

(`r` and `uRimThicknessFrac` are already in scope from the rim/outside branches added in Tasks 3 and 4.)

- [ ] **Step 2: Visual verification**

Run on a target platform.
- The inner ~5% of the cup is visibly darker than the center.
- The transition from dim-edge to bright-center is smooth (no banding).
- The shadow gives the visual impression that the rim sits above the milk surface.

- [ ] **Step 3: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): soft inner-edge shadow under the rim

Multiplies the milk-over-espresso composite by a smoothstep mask
that dims the inner 5% of the cup down to 55% near the wall.
Sells the rim as raised geometry above the latte surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: PanResponder Cup Gate

Reject touches whose UV is outside the inner-rim circle. The continuous-pour interval reads from `lastTouchRef`, so this gate also implicitly stops it.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `RosettaScreen` component (around line 629), `panResponderRef` (around line 698).

- [ ] **Step 1: Add a memoized cup-params value to the component**

In `RosettaScreen` (after `const insets = useSafeAreaInsets()`, around line 643), add:

```ts
const cupParams = React.useMemo(
  () => computeCupParams(SCREEN_WIDTH, SCREEN_HEIGHT),
  [],
)
```

(Keep the import top-of-file: `useMemo` is exported from `'react'`. The file already imports `React`, so `React.useMemo` works without changing imports. If you prefer a named import, add `useMemo` to the existing `import { useEffect, useRef, useState } from 'react'` line.)

- [ ] **Step 2: Add the inside-cup test helper inline**

Add a small inside-cup helper just above the `panResponderRef` initialization (around line 698):

```ts
const isInsideCup = (x: number, y: number) => {
  const dx = (x - cupParams.center[0]) / cupParams.radiusUV[0]
  const dy = (y - cupParams.center[1]) / cupParams.radiusUV[1]
  const r = Math.sqrt(dx * dx + dy * dy)
  return r <= 1.0 - cupParams.rimThicknessFrac
}
```

- [ ] **Step 3: Gate `onPanResponderGrant`**

Replace the existing `onPanResponderGrant` body (around line 704-713) with:

```ts
onPanResponderGrant: (evt) => {
  const x = evt.nativeEvent.locationX / SCREEN_WIDTH
  const y = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
  if (!isInsideCup(x, y)) return
  touchingRef.current = true
  lastTouchRef.current = { x, y }
  const pressure = (evt.nativeEvent as unknown as { force?: number }).force || 1.0
  touchPressureRef.current = Math.max(0.1, Math.min(1.0, pressure))
  pourStartTimeRef.current = Date.now()
  startContinuousPouring()
},
```

(Note: the inside-cup check now happens before `touchingRef.current = true` so out-of-cup taps don't start a pour at all.)

- [ ] **Step 4: Gate `onPanResponderMove`**

In `onPanResponderMove` (around line 714), add a guard immediately after the new x/y are computed and before any `splatStackRef` push:

Replace this section:
```ts
const newX = evt.nativeEvent.locationX / SCREEN_WIDTH
const newY = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
const pressure = (evt.nativeEvent as unknown as { force?: number }).force || 1.0
```

With:
```ts
const newX = evt.nativeEvent.locationX / SCREEN_WIDTH
const newY = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
if (!isInsideCup(newX, newY)) {
  // Drag has crossed the rim. Hold the last in-cup position, but don't push splats.
  return
}
const pressure = (evt.nativeEvent as unknown as { force?: number }).force || 1.0
```

(Returning before `lastMoveTimeRef.current = Date.now()` would also work but is not strictly required — by leaving `lastMoveTimeRef` untouched we let `startContinuousPouring` resume drips at the last in-cup position only after the user re-enters. Both behaviors are acceptable; per the spec, the simpler "return without splatting" is preferred.)

Wait — re-read the existing flow: `lastMoveTimeRef.current = Date.now()` is currently set at line 716, *before* the `newX/newY` derivation. So the existing line is:

```ts
onPanResponderMove: (evt) => {
  if (!touchingRef.current) return
  lastMoveTimeRef.current = Date.now()
  const newX = ...
```

The spec asks us to skip the splat push but allows the move-time-stamp to update either way. To keep the existing `lastMoveTimeRef.current = Date.now()` placement and just gate the splat work, restructure as:

```ts
onPanResponderMove: (evt) => {
  if (!touchingRef.current) return
  lastMoveTimeRef.current = Date.now()

  const newX = evt.nativeEvent.locationX / SCREEN_WIDTH
  const newY = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
  if (!isInsideCup(newX, newY)) {
    // Drag is outside the cup — suppress splat injection, but keep the touch alive
    // so re-entering the cup resumes pouring without requiring lift+touch.
    return
  }
  const pressure = (evt.nativeEvent as unknown as { force?: number }).force || 1.0
  // ... rest of the function unchanged
```

Apply this replacement: the diff is essentially "insert the `if (!isInsideCup) return;` block after `newY` is computed, before `pressure` is derived." Everything else in `onPanResponderMove` stays as-is.

- [ ] **Step 5: Visual verification**

Run on a target platform.
- Tapping outside the cup does nothing — no pour, no continuous drip starts.
- Starting a pour inside the cup and dragging across the rim suppresses splatting outside but resumes when the finger re-enters.
- Releasing outside the cup correctly stops the pour (release handler is unchanged — it always fires).

- [ ] **Step 6: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): gate pour input to inside the cup

PanResponder grant is rejected if the initial touch is outside
the cup. Move events outside the cup don't push splats but the
touch stays alive — dragging back inside resumes pouring without
lift+touch. Geometry comes from computeCupParams, shared with GL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Sim Boundary Guard — Splat Shader

Stage 1 of the simulation boundary work: outside-cell guard in the splat shader. This stops splats from depositing dye/velocity past the rim via Gaussian falloff.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `splatShader` (around line 366), `splat` function (around line 1309).

- [ ] **Step 1: Add cup uniforms to `splatShader`**

In the `splatShader` source, add the cup uniforms in the uniform block at the top (around line 372, just before `void main () {`):

```glsl
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;
```

- [ ] **Step 2: Add the outside-cell guard at the top of `main()`**

Right after `void main () {` (before any `vec2 p_raw = vUv - point.xy;`), insert:

```glsl
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  if (length(cupOff) > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
```

(This makes outside-cup cells permanently inert. The dye init at `g=1.0` is overwritten to zero outside on the first frame and stays zero. This is invisible because the display shader branches outside cells before sampling dye.)

- [ ] **Step 3: Wire cup uniforms in `splat()`**

In the `splat` function (around line 1309), after the existing splatProgram bind block (after the line `gl.uniform1f(splatProgram.uniforms.uHeightFactor, h)` around line 1319), add:

```ts
gl.uniform2f(splatProgram.uniforms.uCupCenter, cupParams.center[0], cupParams.center[1])
gl.uniform2f(splatProgram.uniforms.uCupRadiusUV, cupParams.radiusUV[0], cupParams.radiusUV[1])
```

These are bound once per splat call and survive across the three blits inside `splat()` (radial, directional, dye). No need to rebind between passes.

- [ ] **Step 4: Visual verification**

Run on a target platform.
- Pour near the rim: the splat's Gaussian halo gets sharply clipped at `r = 1`. No visible bleed past the wall.
- Existing pours inside the cup behave the same as before.

- [ ] **Step 5: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): clip splats at the cup wall

Splat shader gains an outside-cell guard. Splats near the rim no
longer bleed past the wall via Gaussian falloff. Outside cells
become permanently inert in the dye/velocity buffers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Sim Boundary Guard — Advection + MacCormack

Add the outside-cell guard to both advection passes (the linear advection shader and the MacCormack correction). After this task fluid no longer "leaks" outside the cup via advection.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `advectionShader` (around line 591), `macCormackShader` (around line 561), `step` function (around line 1426).

- [ ] **Step 1: Add cup uniforms to `advectionShader`**

In the `advectionShader` source, add these uniforms after `uniform float dissipation;` (around line 600):

```glsl
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;
```

- [ ] **Step 2: Add boundary guard at the top of `main()` in `advectionShader`**

Replace the start of `main()`:

```glsl
void main () {
#ifdef MANUAL_FILTERING
```

with:

```glsl
void main () {
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  if (length(cupOff) > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
#ifdef MANUAL_FILTERING
```

- [ ] **Step 3: Add cup uniforms to `macCormackShader`**

In the `macCormackShader` source, add these uniforms after `uniform float dissipation;` (around line 571):

```glsl
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;
```

- [ ] **Step 4: Add boundary guard at the top of `main()` in `macCormackShader`**

Replace:

```glsl
void main () {
  vec4 hat = texture2D(uHat, vUv);
```

with:

```glsl
void main () {
  vec2 cupOff = (vUv - uCupCenter) / uCupRadiusUV;
  if (length(cupOff) > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 hat = texture2D(uHat, vUv);
```

- [ ] **Step 5: Wire cup uniforms in `step()` for advection and MacCormack**

`step()` calls advection 4× per frame (forward velocity, backward velocity, forward dye, backward dye) and macCormack 2× per frame (velocity, dye). To minimize churn, bind the uniforms once per program activation. There are two `advectionProgram.bind()` calls (around lines 1473 and 1503) and two `macCormackProgram.bind()` calls (around lines 1491 and 1519).

After **each** `advectionProgram.bind()` call, add:

```ts
gl.uniform2f(advectionProgram.uniforms.uCupCenter, cupParams.center[0], cupParams.center[1])
gl.uniform2f(advectionProgram.uniforms.uCupRadiusUV, cupParams.radiusUV[0], cupParams.radiusUV[1])
```

After **each** `macCormackProgram.bind()` call, add:

```ts
gl.uniform2f(macCormackProgram.uniforms.uCupCenter, cupParams.center[0], cupParams.center[1])
gl.uniform2f(macCormackProgram.uniforms.uCupRadiusUV, cupParams.radiusUV[0], cupParams.radiusUV[1])
```

(The uniforms persist across multiple `blit()` calls under the same bound program, so we only need to push them once per `bind()`.)

- [ ] **Step 6: Visual verification**

Run on a target platform.
- Pour near the rim. Velocity and dye stay inside the cup; nothing accumulates outside.
- After the splat fades, outside cells stay black (no residual ghosting).

- [ ] **Step 7: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): clip advection and MacCormack to cup interior

Both advection passes (forward/backward) and the MacCormack
correction now zero outside-cup cells. Combined with the splat
guard, this makes the entire dye/velocity field inert outside
the cup with no separate clear pass needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Advection Backtrace Clamp

Per spec §2.5: numerical error at exact wall cells can put the advection backtrace coord slightly outside the cup. Without correction, the inside cell pulls a zero value and a thin "dead band" appears at the rim. Project the backtrace radially back onto the wall when it escapes.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `advectionShader` (around line 591).

- [ ] **Step 1: Apply the radial clamp to both branches of the advection shader**

The existing advection shader's `main()` body (post-guard) is:

```glsl
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
#endif
```

After each `coord` is computed (in **both** branches), insert the clamp before sampling `uSource`. Final body:

```glsl
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec2 dC = (coord - uCupCenter) / uCupRadiusUV;
  float rC = length(dC);
  if (rC > 1.0) {
    coord = uCupCenter + (dC / rC) * uCupRadiusUV;
  }
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec2 dC = (coord - uCupCenter) / uCupRadiusUV;
  float rC = length(dC);
  if (rC > 1.0) {
    coord = uCupCenter + (dC / rC) * uCupRadiusUV;
  }
  vec4 result = texture2D(uSource, coord);
#endif
```

(`uCupCenter` and `uCupRadiusUV` are already declared in the advection shader from Task 8.)

- [ ] **Step 2: Visual verification**

Run on a target platform.
- Pour fast against the rim. There is no thin dark band at the wall (the "dead band" the spec warns about).
- The milk pools cleanly against the rim with no pixel-thin gap.

- [ ] **Step 3: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
fix(rosetta): clamp advection backtrace to the cup wall

When the semi-Lagrangian backtrace escapes the cup (numerical
error at exact wall cells), project it radially back onto the
wall before sampling. Without this, fast pours show a thin
"dead band" at the rim.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Divergence Boundary — Guard + Reflection

Add the outside-cell guard to the divergence shader, then extend the existing rectangular wall-reflection to mirror velocity at the circular wall as well.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `divergenceShader` (around line 471), `step` function (around line 1426).

- [ ] **Step 1: Add cup uniforms and guard to `divergenceShader`**

In the `divergenceShader` source (around line 471), add the cup uniforms (just before `void main () {`):

```glsl
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;
```

- [ ] **Step 2: Add boundary guard and circular-wall reflection in `main()`**

Replace the existing `main()` body:

```glsl
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
```

with:

```glsl
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
```

- [ ] **Step 3: Wire cup uniforms in `step()` for divergence**

In `step()` (around line 1445), after `divergenceProgram.bind()` and before `blit(divergence)`, add:

```ts
gl.uniform2f(divergenceProgram.uniforms.uCupCenter, cupParams.center[0], cupParams.center[1])
gl.uniform2f(divergenceProgram.uniforms.uCupRadiusUV, cupParams.radiusUV[0], cupParams.radiusUV[1])
```

- [ ] **Step 4: Visual verification**

Run on a target platform.
- Pour straight at the rim. The fluid bounces off the wall and pools, instead of "leaving" through the boundary.
- No new artifacts anywhere inside the cup.

- [ ] **Step 5: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): reflect velocity at the cup wall in divergence

Divergence shader gains the outside-cell guard plus a stair-step
mirror at the circular wall: outside neighbors take -C in their
relevant component. Same axis-aligned approximation the existing
rectangular boundary uses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Pressure Boundary — Guard + Neumann

Add the outside-cell guard and Neumann boundary (∂p/∂n = 0 → outside neighbor takes center pressure) to the Jacobi pressure solver.

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `pressureShader` (around line 508), `step` function (around line 1426).

- [ ] **Step 1: Add cup uniforms and guard to `pressureShader`**

In `pressureShader` (around line 508), add cup uniforms:

```glsl
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;
```

- [ ] **Step 2: Add boundary guard and Neumann to `main()`**

Replace the existing `main()`:

```glsl
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
```

with:

```glsl
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
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
```

- [ ] **Step 3: Wire cup uniforms in `step()` for pressure**

In `step()` (around line 1456), after `pressureProgram.bind()` and before the existing uniform pushes, add:

```ts
gl.uniform2f(pressureProgram.uniforms.uCupCenter, cupParams.center[0], cupParams.center[1])
gl.uniform2f(pressureProgram.uniforms.uCupRadiusUV, cupParams.radiusUV[0], cupParams.radiusUV[1])
```

(The pressure program is bound once and blitted in a loop for `PRESSURE_ITERATIONS`. Push the cup uniforms once before the loop — they don't change between iterations.)

- [ ] **Step 4: Visual verification**

Run on a target platform.
- Pour near the rim. The fluid pressure-balances against the wall, producing a clean pool with no oscillation or pressure leak.

- [ ] **Step 5: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): Neumann pressure boundary at the cup wall

Pressure shader gains outside-cell guard and Neumann boundary
condition: ∂p/∂n = 0, i.e. outside neighbors take the center
cell's pressure. Combined with the divergence reflection, this
makes the wall behave as a hard no-flux boundary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Gradient Subtract Boundary — Guard + Neumann

Same Neumann treatment as pressure, applied to the gradient subtraction step (which makes velocity divergence-free using the pressure field).

**Files:**
- Modify: `components/screens/Rosetta/index.tsx` — `gradientShader` (around line 530), `step` function (around line 1426).

- [ ] **Step 1: Add cup uniforms and guard to `gradientShader`**

In `gradientShader`, add cup uniforms:

```glsl
uniform vec2 uCupCenter;
uniform vec2 uCupRadiusUV;
```

- [ ] **Step 2: Add boundary guard and Neumann to `main()`**

Replace the existing `main()`:

```glsl
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
```

with:

```glsl
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
```

- [ ] **Step 3: Wire cup uniforms in `step()` for gradient subtract**

In `step()` (around line 1465), after `gradientSubtractProgram.bind()` and before the existing uniform pushes, add:

```ts
gl.uniform2f(gradientSubtractProgram.uniforms.uCupCenter, cupParams.center[0], cupParams.center[1])
gl.uniform2f(gradientSubtractProgram.uniforms.uCupRadiusUV, cupParams.radiusUV[0], cupParams.radiusUV[1])
```

- [ ] **Step 4: Visual verification**

Run on a target platform.
- Pour against the rim. Velocity field stays divergence-free even right at the wall — no pressure-residual streaking along the boundary.
- All earlier checks (rim render, inside-pour latte art, outside-cup tap rejection) still work.

- [ ] **Step 5: Commit**

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
feat(rosetta): Neumann boundary in gradient subtract

Same outside-cell guard and Neumann pressure boundary applied
to the gradient subtraction pass. Together with the divergence
mirror and pressure Neumann, the cup wall is now a complete
hard no-flux boundary for the velocity field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Verification Pass

Run the full visual checklist from spec §7 across multiple form factors. This task is non-coding — it gates the final state and surfaces any regressions before declaring the feature done.

**Files:** None (verification only).

- [ ] **Step 1: Run unit tests**

Run: `yarn jest components/screens/Rosetta/__tests__/computeCupParams.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 2: Run all unit tests**

Run: `yarn test`
Expected: All tests PASS, no new failures.

- [ ] **Step 3: Run prettier check**

Run: `yarn check:prettier`
Expected: No formatting violations.

- [ ] **Step 4: Manual visual checklist (spec §7)**

Run the app (`yarn ios`, `yarn android`, or `yarn web`) and verify each item. The list is reproduced here so the checklist lives in the plan doc:

- [ ] Cup appears as a true circle on portrait phone (iPhone-class).
- [ ] Cup appears as a true circle on landscape phone.
- [ ] Cup appears as a true circle on portrait tablet.
- [ ] Cup appears as a true circle on landscape tablet.
- [ ] Rim has visible directional lighting consistent with milk highlights (lit from upper-left).
- [ ] Pours inside the cup behave identically to today (no regression in latte-art rendering — same edge sharpness, same valley detection, same specular).
- [ ] Pours toward the rim pool against the wall (no momentum disappearing through the boundary).
- [ ] Touches outside the cup do nothing (no pour, no continuous drip starts).
- [ ] Dragging from inside the cup outward and back in does not cause crashes or visual glitches; pour resumes on re-entry.
- [ ] Settings modal still works (sliders adjust live).
- [ ] Reset button still works.
- [ ] Back button (HUD) still works.
- [ ] Reset HUD button still works.
- [ ] No "dead band" or pixelated artifacts at the rim under fast pours.

If any item fails, do NOT complete this task. Diagnose, file fixes against the appropriate prior task, then re-verify.

- [ ] **Step 5: Final commit (only if any small touch-up was made during verification)**

If verification surfaced any small fix:

```bash
git add components/screens/Rosetta/index.tsx
git commit -m "$(cat <<'EOF'
fix(rosetta): address visual verification finding

<describe what was found and fixed>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no fixes were needed, no commit is created here — the feature is done and the prior 12 commits are the final state.

---

## Self-Review Notes

After authoring this plan I cross-checked it against the spec one more time. Findings and fixes applied inline:

1. **Spec §1.3 says "JS uses `Dimensions.get('screen')`, GL uses `gl.drawingBufferWidth/Height`."** Task 6 uses `SCREEN_WIDTH`/`SCREEN_HEIGHT` (which were derived via `Dimensions.get('screen')` at module load — see line 30-31 of the existing file). Task 3 uses `gl.drawingBufferWidth/Height`. Both match the spec.

2. **Spec §5 says `cupParams` is "stashed on a local `cupParams` object" in `onContextCreate`.** Task 3 places `const cupParams = computeCupParams(...)` in `onContextCreate` so it's in closure scope for `splat`, `drawDisplay`, and `step`. ✓

3. **Spec §3.2 lighting must use the same `lightDir` as the existing milk lighting.** The existing milk shader (line 330) uses `vec3(0.2, 0.3, 1.0)`. The rim branch in Task 4 uses the same. ✓

4. **Spec §3.2.1 inner-edge shadow constants (`0.05`, `0.55`).** Task 5 uses these literal values inline. The spec notes they're tunable but we don't expose them yet (matching spec §3.4 "not exposed in `SETTING_DEFS`"). ✓

5. **Spec §6 explicitly enumerates which shaders need cup uniforms: displayShader, splatShader, advectionShader, macCormackShader, divergenceShader, pressureShader, gradientShader.** Tasks 3–5 cover display; 7 covers splat; 8 covers advection + macCormack; 10 covers divergence; 11 covers pressure; 12 covers gradient. Plus Task 9 adds the advection backtrace clamp from spec §2.5. All 7 shaders are covered. ✓

6. **No placeholders in tasks.** Each step has either runnable code, an exact GLSL snippet, or a runnable shell command. No "TBD", no "fill in details". ✓

7. **Type/name consistency.** Uniform names are spelled `uCupCenter`, `uCupRadiusUV`, `uRimThicknessFrac`, `uRimColor`, `uRimShadowColor`, `uCupBackground`, `uAspect` consistently across all tasks. The closure variable is `cupParams` everywhere (not `cupGeo` or `cup`). The helper is `computeCupParams` everywhere (not `computeCup` or `cupParams`). ✓

8. **Crema init transient.** Spec §5 calls out that `g=1.0` outside the cup is overwritten to 0 by the advection guard on the first frame and never sampled by display. Tasks 7 (splat guard) and 8 (advection guard) implement this. No special init clear is needed. ✓

9. **`React.useMemo` import.** Task 6 step 1 notes `useMemo` is accessible via `React.useMemo` because `React` is already a default-style import at line 1 (`import React, { useEffect, useRef, useState } from 'react'`). The instruction to optionally widen the named import is included for cleanliness. ✓

No gaps or contradictions found. Ready for execution.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-04-rosetta-cup-design.md`.
