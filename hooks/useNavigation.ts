import { useRouter } from 'expo-router'

/** Hook for navigation functions
 *  @see https://docs.expo.dev/router/basics/navigation/
 * */
export function useNavigation() {
  const router = useRouter()

  /** Navigate back to the previous screen  */
  const navigateBack = () => {
    router.back()
  }

  return {
    navigateBack,
  }
}
