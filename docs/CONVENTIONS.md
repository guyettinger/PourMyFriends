# Conventions

House style for this repo. Prettier and ESLint enforce the mechanical parts
(`yarn check:prettier`, `yarn check:lint`); this file covers the rest.

## TypeScript

- `strict` is on. Don't use `any` — use `unknown` and narrow, or define the interface.
- Prefer `interface` for object shapes; use `type` for unions, mappings, and aliases.
- Use `import type { … }` for type-only imports.
- Functions taking more than two arguments take a single options object with a named interface
  instead. The simulator does this throughout (`SplatParams`, `AdvectParams`, `FormatProbeParams`).
- Import through the `~/` alias for anything outside the current feature folder
  (`~/components/primitives/Text`, `~/lib/utilities/cn`). Relative imports are fine for siblings
  and for assets. `@/` resolves identically but `~/` is what the codebase uses.

## TSDoc

Document with TSDoc (`/** … */`), not JSDoc tags for types. Interfaces get an inline comment per
property; functions document parameters and return values when they aren't obvious:

```typescript
/** Parameters for a single fluid splat injection. */
interface SplatParams {
  /** UV x (0 = left, 1 = right). */
  x: number
  /** Splat radius as % of screen size. Defaults to config.SPLAT_RADIUS. */
  radius?: number
}

/**
 * Compute the cup geometry for a given viewport.
 * @param width - Drawing buffer width in pixels.
 * @param height - Drawing buffer height in pixels.
 * @returns Cup center, per-axis UV radius, and rim thickness.
 */
export const computeCupParams = (width: number, height: number): CupParams => { … }
```

Comments should explain _why_, or explain domain behavior that the code can't
("MacCormack traces forward, traces back, and corrects — keeps the swirls crisp"). Don't restate
the code.

## React & components

- Components and hooks are pure functions. Import hooks directly from `react`; never write
  `React.useState`.
- Named exports only — no default exports, except Expo Router route files in `app/`, which must
  default-export their screen.
- No `React.FC`; declare a function with typed props.
- Screens live in `components/screens/<Name>/index.tsx` and are re-exported by a one-line route
  file in `app/`.
- Shared low-level components live in `components/primitives/` and are `cssInterop`-wrapped so
  NativeWind `className` works. Use them instead of importing from `react-native` directly when
  a wrapped equivalent exists.
- `useCallback` for functions passed as props or into hook dependency lists, and for functions
  returned from custom hooks. `useMemo` only for genuinely expensive work — don't memoize object
  literals by reflex.
- Refs are an escape hatch. The simulator uses them heavily (`splatStackRef`, `cancelSimRef`)
  because GL state must not trigger renders; elsewhere prefer state.
- Never mutate React state directly. The simulator's module-level `config` object is a
  deliberate exception: it lives outside React so the settings modal can retune the running
  simulation without a re-render.

## Styling

- NativeWind utility classes via `className` are the default; the custom theme is in
  `tailwind.config.js` and its colors come from `lib/colors.ts`.
- Merge classes with `cn()` from `~/lib/utilities/cn`.
- Write complete static class names — never build them by string concatenation, or Tailwind
  can't see them.
- Inline `style` is for genuinely dynamic values (animated dimensions, computed colors) and for
  places NativeWind can't reach. Hoist static style objects to module scope so they aren't
  reallocated each render.

## Naming

- Components: `PascalCase`, file named after the component (`MilkText.tsx`).
- Hooks: `use` prefix, `camelCase` file (`useAsyncStorage.ts`).
- Constants: `SCREAMING_SNAKE_CASE`.
- Tests: `__tests__/<subject>.test.ts(x)` next to the code under test.
- Shaders: `<pass>.frag` / `.vert` in `components/screens/Rosetta/shaders/`, re-exported from
  that folder's `index.ts`.

## Import order

1. React
2. Third-party (`react-native`, `expo-*`, everything from npm)
3. Local — `~/lib`, then `~/hooks`, then `~/components`
4. Type-only imports

## Testing

Jest with the `jest-expo` preset and `@testing-library/react-native`. Test pure logic and
component behavior; don't try to test the GL pipeline itself — extract the testable piece
instead, the way `computeCupParams` was extracted so both the touch handler and the shader
uniforms can be verified against one implementation.

## Documentation

- Project documentation lives in `docs/`, named `SCREAMING_SNAKE_CASE.md`.
- `README.md` (human onboarding) and `AGENTS.md` (agent context) stay at the repo root.
- Write a doc for non-obvious behavior, workflows that span files, and architecture decisions.
  Don't document what the code already says, or details that churn every week — those belong in
  TSDoc next to the code.
- Keep code examples in docs minimal, complete, and updated when the code moves.
