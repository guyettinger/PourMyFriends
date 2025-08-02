import { AnalyticsEvent, AnalyticsEventProperties } from '~/lib/core/models/analyticEvents/analyticsEvent'

/** use the log to capture an analytics event */
const logCapture = (analyticsEvent: AnalyticsEvent, defaultProperties?: AnalyticsEventProperties) => {
  const { name, schemaVersion, properties } = analyticsEvent
  const eventProperties = defaultProperties ? { ...defaultProperties, ...properties } : properties
  console.log('event', name, schemaVersion, eventProperties)
}

/** capture an analytics event */
export const capture = (analyticsEvent: AnalyticsEvent, defaultProperties?: AnalyticsEventProperties) => {
  logCapture(analyticsEvent, defaultProperties)
}
