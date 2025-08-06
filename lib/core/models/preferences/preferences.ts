import { preferences } from '~/lib/core/enums/preferences'
import { PlaybackPreferencesSchema } from '~/lib/core/models/preferences/playback'

/** define a mapped type for the preference schemas */
export interface PreferenceSchemas {
  [preferences.playback.value]: PlaybackPreferencesSchema
}

/** type of properties for a given preference */
export type PreferenceProperties<T extends keyof typeof preferences = any, V extends number = number> =
  // @ts-ignore
  PreferenceSchemas[(typeof preferences)[T]['value']][V]

/** base interface for all preferences */
export interface Preference<T extends keyof typeof preferences = any, V extends number = number> {
  /** name of the preference */
  name: (typeof preferences)[T]['value']
  /** schema version of the preference */
  schemaVersion: V
  /** properties specific to the preference and version */
  properties: PreferenceProperties<T, V>
}

/** creates a preference typed by a key and schema version */
export function createPreference<T extends keyof typeof preferences, V extends number>(
  key: T,
  schemaVersion: V,
  properties: PreferenceProperties<T, V>,
): Preference<T, V> {
  return {
    name: preferences[key].value,
    schemaVersion,
    properties,
  }
}
