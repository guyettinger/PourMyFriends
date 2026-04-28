# Pour My Friends ☕️

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## 💾 Getting Started

- Install [Node](https://nodejs.org/en/download)
- Install [Yarn](https://yarnpkg.com/)
- Set up device support
  - [Android](https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=simulated&mode=development-build&buildEnv=local)
  - [iOS](https://docs.expo.dev/get-started/set-up-your-environment/?platform=ios&device=simulated&mode=development-build&buildEnv=local)
- Setup EAS CLI
  - [Install](https://docs.expo.dev/eas-update/getting-started/#install-the-latest-eas-cli)
  - [Log in to your Expo Account](https://docs.expo.dev/eas-update/getting-started/#log-in-to-your-expo-account)

## 🚀 Development

- Mobile

```sh
yarn                  # install node modules
yarn env:development  # use the development environment variables
yarn prebuild         # prebuild libraries
yarn ios              # build and run Apple iOS
yarn android          # build for run Android
```

- Web

```sh
yarn                  # install node modules
yarn env:development  # use the development environment variables
yarn prebuild         # prebuild libraries
yarn web              # build and run web - http://localhost:8081
```

## Environment Variables

This project uses `.env` and `.env.local` for environment variables.

Expo EAS [provides](https://docs.expo.dev/eas/environment-variables/) an additional layer of `.env` management that can sync `env.local` with Expo environments.

To update the `.env.local` use one of the following scripts:

```sh
yarn run env:preview      # uses the eas preview environment variables (i.e. preview api)
yarn run env:development  # uses the eas development environment variables (i.e. localhost api)
```

To add additional environment variables, visit the [Pour My Friends Environment Variables](https://expo.dev/accounts/guyettinger/projects/pourmyfriends/environment-variables) page in Expo.

## Routing

This project uses [file-based routing](https://docs.expo.dev/router/introduction). Files inside the **app** directory represent the logical application and it's different routes.

## Building

This project uses [EAS Build](https://docs.expo.dev/build/introduction/) to create deployment builds for app stores. Each app store has a `build:*` script for creating the application.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/learn): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.
- [Nativewind Platform Differences](https://www.nativewind.dev/core-concepts/differences): NativeWind aligns CSS and React Native into a common language. However, the two style engines do have their differences.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
