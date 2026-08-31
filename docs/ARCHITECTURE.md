# Architecture

## Overview

Pour My Friends is an Expo / React Native app (iOS, Android, web) whose one real feature is a
GPU fluid simulation: you drag a finger across a coffee cup and milk pours into espresso,
producing latte art. Everything else — splash, home, about — is a thin shell around that screen.

## Routes

Expo Router file-based routing, all routes in `app/`. `experiments.typedRoutes` is on, so route
types are generated into `.expo/types/router.d.ts` when the dev server runs.

| Route      | File              | Screen                                                                                   |
| ---------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `/`        | `app/index.tsx`   | `SplashIntroScreen` — animated wordmark, auto-replaces to `/home` after 2.5s (tap skips) |
| `/home`    | `app/home.tsx`    | `HomeScreen` — logo, "Start Pouring", "About"                                            |
| `/rosetta` | `app/rosetta.tsx` | `RosettaScreen` — the simulator plus its HUD and settings modal                          |
| `/about`   | `app/about.tsx`   | `AboutScreen` — app info and version, back button                                        |

`app/_layout.tsx` is the root: it loads the Inter Display / SF Pro Display fonts, holds the
splash screen until they resolve, forces the dark theme (`COLORS` from `lib/colors.ts`), wraps
everything in `AnalyticsProviders`, and renders a headerless `Stack`. `app/+html.tsx` is
web-only and sets the document shell.

## The simulator

`components/screens/Rosetta/index.tsx` (~1300 lines) is the whole feature. It has three parts:

1. **React screen** — `GLView` from `expo-gl` filling the screen, a HUD bar, and a settings
   modal. A `PanResponder` created once turns touches into splats: each move is interpolated
   into evenly spaced stamps (`step = 0.012` UV) so a fast drag still lays a continuous ribbon
   of milk, and a stationary finger drips on an interval.
2. **Shader pipeline** — GLSL sources live in `components/screens/Rosetta/shaders/`, imported
   as strings through `babel-plugin-inline-import` (see `types/shaders.d.ts`).
3. **`onContextCreate`** — everything WebGL: capability detection, framebuffer allocation,
   program compilation, and the `requestAnimationFrame` loop.

### Per-frame pipeline

`update()` runs each frame: apply queued splats → `step(dt)` → composite → `endFrameEXP()`.

`step(dt)` in order:

| Pass              | Shader                               | What it does                                                          |
| ----------------- | ------------------------------------ | --------------------------------------------------------------------- |
| Curl              | `curl.frag`                          | Measures swirl in the velocity field (skipped when `CURL === 0`)      |
| Vorticity         | `vorticity.frag`                     | Amplifies that swirl back into velocity                               |
| Divergence        | `divergence.frag`                    | Measures where flow piles up                                          |
| Scale             | `scale.frag`                         | Damps the previous pressure field before solving                      |
| Pressure          | `pressure.frag`                      | Jacobi solve, `PRESSURE_ITERATIONS` passes                            |
| Gradient subtract | `gradient.frag`                      | Removes the pressure gradient, leaving incompressible flow            |
| Advection ×2      | `advection.frag` + `macCormack.frag` | Carries velocity along itself, then the milk/crema dye along velocity |

`display.frag` then composites the cup: espresso base, milk over it, valley detection for the
petal ridges, crema texture, specular highlight, ceramic rim.

Advection is MacCormack: advect forward, advect back, and correct with the round trip — that's
what keeps petal edges crisp instead of smearing. `advectMacCormack()` needs two scratch FBOs
per field (`velHat`/`velBar`, `dyeHat`/`dyeBar`).

Velocity, dye, and pressure are double-buffered (`read`/`write` + `swap()`), the standard
ping-pong pattern for feedback on the GPU.

### Precision and fallbacks

`getWebGLContext()` probes for half-float render targets: WebGL2 uses `RGBA16F`/`RG16F`/`R16F`
with `EXT_color_buffer_float`, WebGL1 falls back to `OES_texture_half_float`.
`getSupportedFormat()` widens `R16F → RG16F → RGBA16F` if a format isn't render-complete, and
`supportRenderTextureFormat()` probes with a 4×4 texture that it always deletes. When linear
filtering isn't available the shaders take a manual-bilinear path.

### Cup geometry

`computeCupParams(width, height)` is exported and used in two places that must agree: the
`PanResponder` (to ignore touches outside the cup) and the GL uniforms (`uCupCenter`,
`uCupRadiusUV`, for shader branching). The cup is centered at UV `(0.5, 0.5)` with a diameter
of 85% of `min(width, height)`; the radius is stored per-axis so it stays a circle on screen at
any aspect ratio. It's the one piece of the simulator with a unit test
(`components/screens/Rosetta/__tests__/computeCupParams.test.ts`).

### Tuning

`config` is a module-level object near the top of the file (line ~249). The settings modal
mutates it directly through `SETTING_DEFS`, so a change takes effect on the next frame — no
state, no re-render, no context rebuild. `INITIAL_SETTINGS` snapshots the values at module load
for "Reset to Defaults", and settings survive a sim reset because they don't live in React
state. `simKey` on the `GLView` is the escape hatch that _does_ rebuild: bumping it recreates
the WebGL context for a clean cup.

Adjustable via the modal: pitcher height, pour width, pour force, flow decay, swirl, edge
definition, milk boundary, radial push, foam absorption, crema texture, milk opacity, milk
shine, shine focus. Resolutions (`SIM_RESOLUTION` 256, `DYE_RESOLUTION` 512) and
`PRESSURE_ITERATIONS` are code-level knobs; raising them costs frame time directly.

`calcDeltaTime()` clamps `dt` to `0.033` (30fps floor) — the sim slows rather than exploding
when frames get long.

## Supporting structure

- `components/primitives/` — thin `cssInterop`-wrapped RN components (`Text`, `View`, `Image`,
  `Button`, `StyledPressable`) so NativeWind `className` works, plus `MilkText`, the animated
  milk-fill wordmark used on the splash and home screens.
- `components/providers/` — `AnalyticsProviders` wraps `CaptureProvider`; consume it with
  `useCapture()`. Events dispatch through `lib/utilities/capture.ts` and are typed by
  `lib/core/enums/analyticEvents.ts` and `lib/core/models/analyticEvents/`.
- `hooks/` — `useAsyncStorage`, `useColorScheme`, `useNavigation`, `useCapture`, `useScale`.
- `lib/colors.ts` — the light/dark palettes consumed by both `@react-navigation` themes and
  `tailwind.config.js` (dark mode uses the class strategy).
- `lib/utilities/cn.ts` — `clsx` + `tailwind-merge` class merging.

## Platform notes

- `expo-gl` renders through `GLView`; on web that's a real WebGL2 canvas, which is why the
  screenshot script can capture the simulator headlessly (see
  [DEVELOPMENT.md](./DEVELOPMENT.md)).
- The settings modal uses `pageSheet` presentation on iOS and `fullScreen` elsewhere — the only
  `Platform` branch in the simulator.
- New Architecture is enabled; native directories are generated by `yarn prebuild` and are not
  checked in.
