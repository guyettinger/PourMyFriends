import { Platform } from 'react-native'

/** current device is Android platform. */
export const isAndroid = Platform.OS === 'android'
/** current device is iOS platform. */
export const isIos = Platform.OS === 'ios'
/** current device is web platform. */
export const isWeb = Platform.OS === 'web'
