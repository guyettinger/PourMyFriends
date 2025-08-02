import { cssInterop } from 'nativewind'
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient'

/** LinearGradient - linear gradient component */
export const LinearGradient = cssInterop(ExpoLinearGradient, {
  className: {
    target: 'style',
  },
})
