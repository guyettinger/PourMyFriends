# AGENTS.md

This file provides guidance to all AI coding agents when working with code in this repository.

## Project Overview

**Pour My Friends** is a React Native / Expo app that simulates latte art creation via an interactive fluid dynamics simulator running on WebGL shaders.

## Commands

```bash
yarn install          # Install dependencies
yarn start            # Start Expo dev server
yarn ios              # Run on iOS simulator
yarn android          # Run on Android emulator
yarn web              # Run web version (localhost:8081)

yarn test             # Run Jest tests
yarn check:lint       # Run ESLint
yarn check:prettier   # Check Prettier formatting
yarn check:expo       # Run expo-doctor health check

yarn prebuild         # Clean and regenerate native directories
yarn build:android    # Production Android build via EAS
yarn build:apple      # Production iOS build via EAS
yarn build:web        # Web build via EAS

yarn env:development  # Pull development .env from EAS
yarn env:preview      # Pull preview .env from EAS
```

To run a single test file:
```bash
yarn jest path/to/test.ts
```

## Architecture

### Routing & Screens

Expo Router provides file-based routing from `app/`. The app has a single main screen: `app/index.tsx` renders the Rosetta simulator. The root layout (`app/_layout.tsx`) sets up theming, fonts, and the analytics provider.

### Core Feature: Rosetta Fluid Simulator

`components/screens/Rosetta/index.tsx` (~925 lines) is the heart of the app. It implements a GPU-accelerated 2D fluid dynamics simulation:

- **WebGL pipeline**: Uses `expo-gl` to run a multi-pass shader pipeline each frame
- **Shader passes**: Splat (user input) → Curl → Vorticity → Divergence → Pressure (iterative solve) → Gradient subtraction → Advection → Display
- **Display shader**: Composites milk (dye) over espresso with lighting and valley detection for the latte art look
- **Input**: React Native `PanResponder` feeds touch velocity into the velocity field as "splats"
- **Tuning params**: `SPLAT_RADIUS`, `VELOCITY_DISSIPATION`, `DENSITY_DISSIPATION`, `PRESSURE_ITERATIONS`, etc. control simulation feel

### Component & Hook Structure

- `components/primitives/` — styled wrappers around RN core components (Text, View, Button, etc.) using NativeWind
- `components/providers/` — `AnalyticsProviders` wraps `CaptureProvider`; consumed via `useCapture()` hook
- `hooks/` — custom hooks for storage (`useAsyncStorage`), preferences (`usePreference`), theming (`useColorScheme`), breakpoints (`useBreakpoints`)
- `lib/core/` — enums and models for analytics events and user preferences
- `lib/utilities/capture.ts` — analytics event dispatch function
- `lib/colors.ts` — light/dark color palette used by Tailwind config

### Styling

NativeWind (Tailwind for React Native) with a custom theme in `tailwind.config.js`. Colors are CSS variables defined in `lib/colors.ts`. Dark mode uses class-based strategy. Custom fonts: Inter Display and SF Pro Display.

### TypeScript Path Aliases

`~/*` and `@/*` both resolve to the project root (configured in `tsconfig.json`).

### Environment & Builds

- `lib/config.ts` reads `EXPO_PUBLIC_APP_VARIANT` to distinguish `development`, `preview`, `production`, and `test` builds
- `eas.json` defines three EAS build profiles; `app.config.ts` configures bundle IDs and plugins
- Web deployment targets Vercel (`vercel.json`)
- New Architecture is enabled (`newArchEnabled: true` in `app.config.ts`)

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update 'tasks/lessons.md' with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -> then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management
1. **Plan First**: Write plan to 'tasks/todo.md' with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review to 'tasks/todo.md'
6. **Capture Lessons**: Update 'tasks/lessons.md' after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

### Rules

Rules are located in @/.cursor/rules