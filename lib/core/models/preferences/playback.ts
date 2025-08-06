import { preferences } from '~/lib/core/enums/preferences'

import { createPreference } from '~/lib/core/models/preferences/preferences'

/** playback preference schema */
export interface PlaybackPreferencesSchema {
  1: {
    /** user preferred subtitle language */
    subtitleLanguage?: string
  }
}
/** create playback preference */
export const playback = <V extends keyof PlaybackPreferencesSchema>(
  properties: PlaybackPreferencesSchema[V],
  /** default schema version */
  schemaVersion: V = 1 as V,
) => createPreference(preferences.playback.value, schemaVersion, properties)
