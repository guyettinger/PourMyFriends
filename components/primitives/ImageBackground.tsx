import { ImageBackground as ReactNativeImageBackground } from 'react-native'
import { cssInterop } from 'nativewind'

/** ImageBackground - image background component */
export const ImageBackground = cssInterop(ReactNativeImageBackground, {
  className: {
    target: 'style',
  },
})
