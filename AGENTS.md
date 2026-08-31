# AGENTS.md

Context for AI coding agents working in this repository. `CLAUDE.md` points here, so this is the
single source of agent context.

## What this is

Pour My Friends is an Expo / React Native app (iOS, Android, web) whose one real feature is an
interactive latte art simulator: a 2D fluid simulation running on WebGL shaders, driven by
touch. Everything else is a thin shell around that screen.

## Commands

```sh
yarn                  # install dependencies
yarn start            # Expo dev server
yarn web              # web dev server at http://localhost:8081
yarn ios              # iOS simulator
yarn android          # Android emulator
yarn prebuild         # expo prebuild --clean — regenerates ios/ and android/

yarn test             # Jest
yarn jest path/to/test.ts   # single test file
yarn check:lint       # ESLint
yarn check:prettier   # Prettier (check only)
yarn check:expo       # expo-doctor

yarn screenshots      # regenerate docs/screenshots/*.png used by the README
```

Builds and environment variables: see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Map

| Path                                   | What lives there                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`                                 | Expo Router routes: `/` splash, `/home`, `/rosetta`, `/about`. Each is a one-line re-export of a screen; `_layout.tsx` holds fonts, theme, providers. |
| `components/screens/Rosetta/index.tsx` | The simulator — ~1300 lines: React screen + HUD, then `onContextCreate` with the whole WebGL pipeline.                                                |
| `components/screens/Rosetta/shaders/`  | GLSL, imported as strings via `babel-plugin-inline-import`.                                                                                           |
| `components/primitives/`               | `cssInterop`-wrapped RN components so NativeWind `className` works, plus `MilkText`.                                                                  |
| `components/providers/`                | `AnalyticsProviders` → `CaptureProvider`, consumed via `useCapture()`.                                                                                |
| `hooks/`, `lib/`                       | Hooks; colors, `cn()`, analytics models.                                                                                                              |
| `scripts/screenshots.mjs`              | Playwright capture of every route for the README.                                                                                                     |
| `docs/`                                | Architecture, development, conventions.                                                                                                               |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing the simulator — it explains the
per-frame pass order, the MacCormack advection, and the ping-pong framebuffers.

## Conventions

[docs/CONVENTIONS.md](docs/CONVENTIONS.md) is the full house style: strict TypeScript with TSDoc,
named exports, NativeWind-first styling, `~/` import alias, options-object parameters for
anything past two arguments. Match the surrounding file — the simulator's comment style
(explaining fluid behavior in plain language) is deliberate; keep it.

## Things that will surprise you

- **`config` is a module-level object** in the simulator, mutated directly by the settings modal.
  That's intentional: retuning must not re-render or rebuild the GL context. Don't "fix" it into
  React state.
- **`simKey`** on the `GLView` is the deliberate way to rebuild the WebGL context (fresh cup).
  Settings survive it because they live in `config`, not state.
- **Typed routes** are generated into `.expo/types/router.d.ts` when the dev server runs. Adding a
  route without starting Expo leaves the types stale.
- **`ios/` and `android/` are generated** by `yarn prebuild` and gitignored. Change `app.config.ts`
  or a config plugin instead of editing them.
- **`computeCupParams`** is shared by the touch handler and the GL uniforms and is unit-tested —
  if you change cup geometry, both sides must stay in agreement.
- **Size primitives with plain style props, not NativeWind CSS variables.** `vars({ h: 44 })` plus
  `h-[--h]` silently does nothing on web — the variable is unitless, so the CSS is invalid — which
  is why `Button` passes `height`/`width`/padding as a normal style object.

## Before saying it's done

Run `yarn test`, `yarn check:lint`, and `yarn check:prettier`. Lint is clean (4 warnings, 0
errors); Prettier still reports pre-existing failures in files this repo hasn't formatted yet, so
compare against `main` rather than assuming you caused them.
For simulator changes, actually run it (`yarn web` and pour, or `yarn screenshots` and look at
`docs/screenshots/rosetta.png`) — shader regressions don't show up in tests. Report what you
ran and what it said.
