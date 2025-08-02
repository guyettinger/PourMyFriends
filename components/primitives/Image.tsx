import { Image as ExpoImage } from 'expo-image'
import { cssInterop } from 'nativewind'

/** Image - image component */
export const Image = cssInterop(ExpoImage, {
  className: {
    target: 'style',
  },
})
