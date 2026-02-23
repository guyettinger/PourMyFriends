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

### Rules

Rules are located in @.cursor/rules