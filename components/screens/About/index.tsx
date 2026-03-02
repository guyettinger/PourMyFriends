import { TouchableOpacity } from 'react-native'
import Constants from 'expo-constants'
import { useNavigation } from '~/hooks/useNavigation'
import { View } from '~/components/primitives/View'
import { Text } from '~/components/primitives/Text'
import { Image } from '~/components/primitives/Image'

export function AboutScreen() {
  const { navigateBack } = useNavigation()

  return (
    <View style={{ flex: 1, backgroundColor: 'rgb(14, 10, 7)' }}>
      <TouchableOpacity
        onPress={navigateBack}
        style={{ position: 'absolute', top: 60, left: 24, zIndex: 10, padding: 8 }}
      >
        <Text style={{ color: 'white', fontSize: 28 }}>‹</Text>
      </TouchableOpacity>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Image
          source={require('../../../assets/images/splash/darkSplash.png')}
          style={{ width: 80, height: 80 }}
          contentFit="contain"
        />
        <Text
          style={{
            color: 'white',
            fontSize: 24,
            fontFamily: 'SF-Pro-Display-Bold',
            marginTop: 24,
          }}
        >
          Pour My Friends
        </Text>
        <Text
          style={{
            color: '#A0896B',
            fontSize: 14,
            fontFamily: 'SF-Pro-Display-Regular',
            marginTop: 8,
          }}
        >
          Version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
        <Text
          style={{
            color: '#C0A882',
            fontSize: 16,
            fontFamily: 'SF-Pro-Display-Regular',
            marginTop: 24,
            textAlign: 'center',
            lineHeight: 24,
          }}
        >
          A GPU-accelerated latte art fluid simulator. Pour frothed milk over espresso and create
          beautiful rosetta patterns.
        </Text>
        <Text
          style={{
            color: '#6B5B45',
            fontSize: 14,
            fontFamily: 'SF-Pro-Display-Regular',
            marginTop: 32,
          }}
        >
          Made with care for coffee lovers
        </Text>
      </View>
    </View>
  )
}
