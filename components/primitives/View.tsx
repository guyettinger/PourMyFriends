import { View as ReactNativeView } from 'react-native'
import { cssInterop } from 'nativewind'

/** View component - styled with nativewind */
export const View = cssInterop(ReactNativeView, {
  className: {
    target: 'style',
  },
})
