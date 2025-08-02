import { useCallback, useEffect } from 'react'
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated'
import { DarkTheme, DefaultTheme, Theme, ThemeProvider } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { SplashScreen, Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ColorScheme } from '~/lib/color'
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
  colors: ColorScheme.light,
}
/** dark theme */
const DARK_THEME: Theme = {
  ...DarkTheme,
  colors: ColorScheme.dark,
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
          <Slot />
        </View>
      </ThemeProvider>
    </AnalyticsProviders>
  )
}
