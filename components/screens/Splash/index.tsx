import { useEffect } from 'react'
import { TouchableOpacity } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { router } from 'expo-router'
import { Image } from '~/components/primitives/Image'
import { MilkText } from '~/components/primitives/MilkText'

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
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
      >
        <Image
          source={require('../../../assets/images/splash/darkSplash.png')}
          style={{ width: 64, height: 64 }}
          contentFit="contain"
        />
        <MilkText
          fontSize={100}
          fontFamily="InterDisplay-Bold"
          milkColor="#F5F0E8"
          ghostColor="rgba(255,255,255,0.15)"
          fillDuration={1400}
          delay={0}
          style={{ marginTop: 16 }}
        >
          Pour
        </MilkText>
        <MilkText
          fontSize={100}
          fontFamily="InterDisplay-Bold"
          milkColor="#F5F0E8"
          ghostColor="rgba(255,255,255,0.15)"
          fillDuration={1400}
          delay={150}
          style={{ marginTop: -28 }}
        >
          My
        </MilkText>
        <MilkText
          fontSize={100}
          fontFamily="InterDisplay-Bold"
          milkColor="#F5F0E8"
          ghostColor="rgba(255,255,255,0.15)"
          fillDuration={1400}
          delay={300}
          style={{ marginTop: -28 }}
        >
          Friends
        </MilkText>
        <MilkText
          fontSize={16}
          fontFamily="SF-Pro-Display-Regular"
          milkColor="#A0896B"
          ghostColor="rgba(160,137,107,0.3)"
          fillDuration={1200}
          delay={500}
          style={{ marginTop: 8 }}
        >
          made with a latte love
        </MilkText>
      </Animated.View>
    </TouchableOpacity>
  )
}
