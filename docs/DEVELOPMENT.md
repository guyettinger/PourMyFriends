# Development

## Prerequisites

- [Node](https://nodejs.org/en/download) and [Yarn](https://yarnpkg.com/)
- Device tooling for whichever platform you're building:
  - [Android setup](https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=simulated&mode=development-build&buildEnv=local)
  - [iOS setup](https://docs.expo.dev/get-started/set-up-your-environment/?platform=ios&device=simulated&mode=development-build&buildEnv=local)
- EAS CLI, for environment variables and builds:
  [install](https://docs.expo.dev/eas-update/getting-started/#install-the-latest-eas-cli) and
  [log in](https://docs.expo.dev/eas-update/getting-started/#log-in-to-your-expo-account)

## Running the app

```sh
yarn                  # install dependencies
yarn env:development  # pull development environment variables from EAS
yarn prebuild         # regenerate native projects (ios/, android/) — mobile only
yarn ios              # build and run on the iOS simulator
yarn android          # build and run on the Android emulator
yarn web              # web dev server at http://localhost:8081
yarn start            # Expo dev server, pick a platform interactively
```

`yarn prebuild` runs `expo prebuild --clean`, so it wipes and regenerates `ios/` and
`android/`. Those directories are gitignored — never hand-edit them; change `app.config.ts` or
an Expo config plugin instead.

The web target is the fastest loop for anything that isn't native-specific, including the fluid
simulator (`expo-gl` runs on a real WebGL2 canvas there).

## Checks

```sh
yarn test             # Jest (jest-expo preset)
yarn jest path/to/test.ts   # single test file
yarn check:lint       # ESLint
yarn check:prettier   # Prettier, check only
yarn check:expo       # expo-doctor health check
```

Prettier config: single quotes, no semicolons, 120-column width, with the Tailwind class-sorting
plugin. Run `npx prettier --write ./` to fix formatting.

## Environment variables

Local values live in `.env` / `.env.local`, which are gitignored. EAS
[manages](https://docs.expo.dev/eas/environment-variables/) the shared values and can sync them
down:

```sh
yarn env:development  # development environment (e.g. localhost API)
yarn env:preview      # preview environment (e.g. preview API)
```

Add or edit shared variables on the
[Pour My Friends environment variables](https://expo.dev/accounts/guyettinger/projects/pourmyfriends/environment-variables)
page in Expo. Only `EXPO_PUBLIC_`-prefixed variables reach the client bundle.

## Builds

`eas.json` defines three profiles — `production`, `preview`, and `development` (the latter two
extend production and are internal-distribution builds; `preview` builds an Android APK and an
iOS simulator build).

```sh
yarn build:android           # production Android, built locally
yarn build:android:preview   # preview Android APK
yarn build:apple             # production iOS (copies apple.ios.credentials.json first)
yarn build:apple:preview     # preview iOS simulator build
yarn build:web               # pulls preview env, then `expo export -p web` into dist/
```

Note: `build:apple` and `build:apple:preview` pass `--profile apple` / `--profile apple_preview`,
which aren't defined in `eas.json` — add those profiles (or point the scripts at the existing
ones) before relying on them.

Web deploys to Vercel using `vercel.json`: it runs `yarn build:web`, serves `dist/`, and rewrites
every path to `/` for client-side routing. `EXPO_TOKEN` must be set in the Vercel project so the
build can pull EAS environment variables.

## Screenshots

`scripts/screenshots.mjs` regenerates the images in `docs/screenshots/` that the README embeds.
It boots the Expo web dev server, drives a phone-sized Chromium through every route, pours a
rosetta on the simulator canvas, and writes `splash.png`, `home.png`, `rosetta.png`,
`settings.png`, and `about.png`.

```sh
yarn screenshots                              # boots its own dev server on port 8082
yarn screenshots --url http://localhost:8081  # reuse an already-running `yarn web`
yarn screenshots --headed                     # use the real GPU instead of SwiftShader
yarn screenshots --out some/dir               # write elsewhere
```

First run needs the browser binary: `npx playwright install chromium`.

Headless Chromium renders WebGL through SwiftShader, which is enough for the fluid simulator but
is software-rasterized and slow. If `rosetta.png` comes out as an empty cup, rerun with
`--headed`. Always eyeball the PNGs before committing them — the captures are timing-based
(there are no `testID`s to wait on), so an unusually slow bundle can catch a screen mid-animation.
