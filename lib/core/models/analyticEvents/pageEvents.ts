import { analyticsEvents } from '~/lib/core/enums/analyticEvents'

import { createAnalyticsEvent } from '~/lib/core/models/analyticEvents/analyticsEvent'

/** page viewed event schema */
export interface PageViewedEventSchema {
  1: {
    page_path: string
    page_params: Record<string, string | string[]>
  }
}
/** create a page viewed event */
export const pageViewedEvent = <V extends keyof PageViewedEventSchema>(
  properties: PageViewedEventSchema[V],
  /** default schema version */
  schemaVersion: V = 1 as V,
) => createAnalyticsEvent(analyticsEvents.page_viewed.value, schemaVersion, properties)
