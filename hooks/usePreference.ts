import { useAsyncStorage } from '~/hooks/useAsyncStorage'
import { preferences } from '~/lib/core/enums/preferences'
import { PreferenceProperties } from '~/lib/core/models/preferences/preferences'

export interface usePreferenceProps<T extends keyof typeof preferences, V extends number> {
  /** key to store the preference under */
  key: T
  /** schema version of the preference properties */
  schemaVersion: V
  /** initial preference properties to store */
  initialValue: PreferenceProperties<T, V>
}

/**
 * a hook that provides access to application preferences by key.
 * @returns a tuple containing the stored preference and a function to set the preference
 */
export const usePreference = <T extends keyof typeof preferences, V extends number>(
  props: usePreferenceProps<T, V>,
) => {
  const { key, initialValue } = props
  return useAsyncStorage<PreferenceProperties<T, V>>(key, initialValue)
}
