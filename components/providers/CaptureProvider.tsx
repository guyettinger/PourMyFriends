import React, { createContext, ReactNode } from 'react'
import { capture } from '~/lib/utilities/capture'
import { AnalyticsEvent, AnalyticsEventProperties } from '~/lib/core/models/analyticEvents/analyticsEvent'
/** capture function type */
export type CaptureFunction = (analyticsEvent: AnalyticsEvent) => void
/** default capture context */
export const CaptureContext = createContext<CaptureFunction | undefined>(undefined)
/** capture provider properties */
export interface CaptureProviderProps {
  children: ReactNode
  /** properties to be passed to all captured events */
  defaultProperties?: AnalyticsEventProperties
}
/** capture provider - provides analytic event capture context to children */
export const CaptureProvider = ({ children, defaultProperties }: CaptureProviderProps) => {
  return (
    <CaptureContext.Provider value={(analyticsEvent) => capture(analyticsEvent, defaultProperties)}>
      {children}
    </CaptureContext.Provider>
  )
}
