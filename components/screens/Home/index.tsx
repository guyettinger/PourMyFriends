import { View } from '~/components/primitives/View'
import { Text } from '~/components/primitives/Text'
import { Link } from 'expo-router'

export function HomeScreen() {
  return (
    <View className="flex h-full w-full flex-1 flex-col">
      <Text className="text-primary">Hello World</Text>
      <Link className="text-primary" href="/latte-art">Latte</Link>
    </View>
  )
}
