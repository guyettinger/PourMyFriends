import { analyticsEvents } from '~/lib/core/enums/analyticEvents'
import { PageViewedEventSchema } from '~/lib/core/models/analyticEvents/pageEvents'

/** define a mapped type for the analytics event schemas */
export interface AnalyticsEventSchemas {
  [analyticsEvents.page_viewed.value]: PageViewedEventSchema
}

/** type of properties for a given analytics event */
export type AnalyticsEventProperties<T extends keyof typeof analyticsEvents = any, V extends number = number> =
  // @ts-ignore
  AnalyticsEventSchemas[(typeof analyticsEvents)[T]['value']][V]

/** base interface for all analytics events */
export interface AnalyticsEvent<T extends keyof typeof analyticsEvents = any, V extends number = number> {
  /** name of the event */
  name: (typeof analyticsEvents)[T]['value']
  /** schema version of the event */
  schemaVersion: V
  /** properties specific to the event and version */
  properties: AnalyticsEventProperties<T, V>
}

/** creates a typed analytics event */
export function createAnalyticsEvent<T extends keyof typeof analyticsEvents, V extends number>(
  eventName: T,
  schemaVersion: V,
  properties: AnalyticsEventProperties<T, V>,
): AnalyticsEvent<T, V> {
  return {
    name: analyticsEvents[eventName].value,
    schemaVersion,
    properties,
  }
}
