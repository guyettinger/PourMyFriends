/** App Variant
 * the current application variant (EXPO_PUBLIC_APP_VARIANT)
 * an app variant is a build of the app for a specific purpose (like development)
 * @see https://docs.expo.dev/tutorial/eas/multiple-app-variants/
 * @see https://docs.expo.dev/build/eas-json/#common-use-cases
 * @example development
 * */
export const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT as
  | 'development'
  | 'preview'
  | 'production'
  | 'test'
  | undefined
