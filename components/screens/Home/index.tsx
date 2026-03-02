import { router } from 'expo-router'
import { View } from '~/components/primitives/View'
import { Text } from '~/components/primitives/Text'
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
          marginBottom: 48,
        }}
      >
        latte art, anywhere
      </Text>
      <Button onPress={() => router.push('/rosetta')} style={{ marginBottom: 16 }}>
        <ButtonText>Start Pouring</ButtonText>
      </Button>
      <Button onPress={() => router.push('/about')}>
        <ButtonText>About</ButtonText>
      </Button>
    </View>
  )
}
