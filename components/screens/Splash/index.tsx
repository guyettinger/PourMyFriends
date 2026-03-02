import { useEffect } from 'react'
import { TouchableOpacity } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { router } from 'expo-router'
import { Image } from '~/components/primitives/Image'
import { Text } from '~/components/primitives/Text'

export function SplashIntroScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/home')
    }, 2500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <TouchableOpacity
      style={{ flex: 1, backgroundColor: '#0E0A07' }}
      activeOpacity={1}
      onPress={() => router.replace('/home')}
    >
      <Animated.View
        entering={FadeIn.duration(800)}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <Image
          source={require('../../../assets/images/splash/darkSplash.png')}
          style={{ width: 120, height: 120 }}
          contentFit="contain"
        />
        <Text
          style={{
            color: 'white',
            fontSize: 28,
            fontFamily: 'SF-Pro-Display-Bold',
            marginTop: 24,
          }}
        >
          Pour My Friends
        </Text>
        <Text
          style={{
            color: '#A0896B',
            fontSize: 16,
            fontFamily: 'SF-Pro-Display-Regular',
            marginTop: 8,
          }}
        >
          latte art, anywhere
        </Text>
      </Animated.View>
    </TouchableOpacity>
  )
}
