import { router } from 'expo-router'
import { View } from '~/components/primitives/View'
import { MilkText } from '~/components/primitives/MilkText'
import { Image } from '~/components/primitives/Image'
import { Button, ButtonText } from '~/components/primitives/Button'

export function HomeScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgb(14, 10, 7)',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Image
        source={require('../../../assets/images/splash/darkSplash.png')}
        style={{ width: 100, height: 100 }}
        contentFit="contain"
      />
      <MilkText
        fontSize={28}
        fontFamily="SF-Pro-Display-Bold"
        milkColor="#F5F0E8"
        ghostColor="rgba(255,255,255,0.2)"
        fillDuration={1800}
        style={{ marginTop: 24 }}
      >
        Pour My Friends
      </MilkText>
      <MilkText
        fontSize={16}
        fontFamily="SF-Pro-Display-Regular"
        milkColor="#A0896B"
        ghostColor="rgba(160,137,107,0.3)"
        fillDuration={1600}
        delay={200}
        style={{ marginTop: 8, marginBottom: 48 }}
      >
        latte art, anywhere
      </MilkText>
      <Button onPress={() => router.push('/rosetta')} style={{ marginBottom: 16 }}>
        <ButtonText>Start Pouring</ButtonText>
      </Button>
      <Button onPress={() => router.push('/about')}>
        <ButtonText>About</ButtonText>
      </Button>
    </View>
  )
}
