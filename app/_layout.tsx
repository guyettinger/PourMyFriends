import { useCallback, useEffect } from 'react'
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated'
import { DarkTheme, DefaultTheme, Theme, ThemeProvider } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { SplashScreen, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { COLORS } from '~/lib/colors'
import { useColorScheme } from '~/hooks/useColorScheme'
import { AnalyticsProviders } from '~/components/providers/AnalyticsProviders'
import { View } from '~/components/primitives/View'

/** css global */
import '../global.css'
/** animation */
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
})
/** light theme */
const LIGHT_THEME: Theme = {
  ...DefaultTheme,
  colors: COLORS.light,
}
/** dark theme */
const DARK_THEME: Theme = {
  ...DarkTheme,
  colors: COLORS.dark,
}
/** default theme */
const defaultTheme = 'dark'
/** splash screen - prevent auto hide */
SplashScreen.preventAutoHideAsync().catch(console.warn)

/** root layout - base layout of all pages */
export default function RootLayout() {
  // color scheme
  const { colorScheme, setColorScheme } = useColorScheme()
  // theme
  useEffect(() => {
    // only set the default theme once
    setColorScheme(defaultTheme)
  }, [])
  // fonts
  const [fontsLoaded, fontError] = useFonts({
    'InterDisplay-Regular': require('../assets/fonts/InterDisplay-Regular.otf'),
    'InterDisplay-Bold': require('../assets/fonts/InterDisplay-Bold.otf'),
    'SF-Pro-Display-Regular': require('../assets/fonts/SF-Pro-Display-Regular.otf'),
    'SF-Pro-Display-Thin': require('../assets/fonts/SF-Pro-Display-Thin.otf'),
    'SF-Pro-Display-Semibold': require('../assets/fonts/SF-Pro-Display-Semibold.otf'),
    'SF-Pro-Display-Bold': require('../assets/fonts/SF-Pro-Display-Bold.otf'),
  })
  // hide the splash screen once resources are loaded
  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])
  // don't render anything until fonts are loaded
  if (!fontsLoaded && !fontError) {
    return null
  }

  return (
    <AnalyticsProviders>
      <ThemeProvider value={colorScheme === 'dark' ? DARK_THEME : LIGHT_THEME}>
        <StatusBar hidden={true} />
        <View onLayout={onLayoutRootView} className="flex-1 bg-background">
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="home" />
            <Stack.Screen name="about" />
            <Stack.Screen name="rosetta" />
          </Stack>
        </View>
      </ThemeProvider>
    </AnalyticsProviders>
  )
}
