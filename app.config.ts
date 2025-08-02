import { ExpoConfig, ConfigContext } from 'expo/config'

export default ({}: ConfigContext): ExpoConfig => ({
  scheme: 'pourmyfriends',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#000000',
  plugins: [
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: true,
        },
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash/darkSplash.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#000000',
        dark: {
          image: './assets/images/splash/darkSplash.png',
          backgroundColor: '#000000',
        },
      },
    ],
    'expo-router',
    'expo-font',
    'expo-localization',
  ],
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/icons/androidAdaptiveIcon.png',
      monochromeImage: './assets/images/icons/androidAdaptiveIcon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.pourmyfriends.app',
    edgeToEdgeEnabled: true,
  },
  ios: {
    icon: {
      dark: './assets/images/icons/iosDarkIcon.png',
      light: './assets/images/icons/iosLightIcon.png',
      tinted: './assets/images/icons/iosTintedIcon.png',
    },
    bundleIdentifier: 'com.pourmyfriends.app',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    supportsTablet: true,
  },
  web: {
    bundler: 'metro',
    favicon: './assets/images/icons/webIcon.png',
  },
  experiments: {
    typedRoutes: true,
  },
  newArchEnabled: true,
  name: 'pourmyfriends',
  slug: 'pourmyfriends',
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: 'f6c13187-ed8e-4ba9-bce9-8784fdf8d88b',
    },
  },
  owner: 'guy-ettinger',
  runtimeVersion: {
    policy: 'fingerprint',
  }
})
