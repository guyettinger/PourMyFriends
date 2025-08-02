import { Text as ReactNativeText } from 'react-native'
import { cssInterop } from 'nativewind'

/** Text component - styled with nativewind */
export const Text = cssInterop(ReactNativeText, {
  className: {
    target: 'style',
  },
})
