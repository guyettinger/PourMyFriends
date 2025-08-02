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
    'expo-video',
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
      projectId: '6db17f31-042e-4c47-bdd4-18a8e4b9a736',
    },
  },
  owner: 'guyettinger',
  runtimeVersion: {
    policy: 'fingerprint',
  }
})
