import { View } from '~/components/primitives/View'
import { Text } from '~/components/primitives/Text'

export function HomeScreen() {
  return (
    <View className="p-safe flex h-full w-full flex-1 flex-col">
      <Text className="text-primary">Hello World</Text>
    </View>
  )
}
