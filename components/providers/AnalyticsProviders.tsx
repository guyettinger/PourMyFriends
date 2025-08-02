import React, { ReactNode, useEffect } from 'react'
import { useGlobalSearchParams, usePathname } from 'expo-router'
import { AnalyticsEventProperties } from '~/lib/core/models/analyticEvents/analyticsEvent'
import { pageViewedEvent } from '~/lib/core/models/analyticEvents/pageEvents'
import { useCapture } from '~/hooks/useCapture'
import { CaptureProvider } from '~/components/providers/CaptureProvider'

/** page view - page view analytics capture */
const PageView = () => {
  const capture = useCapture()
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  // screen tracking for analytics
  // @see https://docs.expo.dev/router/reference/screen-tracking/
  useEffect(() => {
    // capture page viewed event
    capture(
      pageViewedEvent({
        page_path: pathname,
        page_params: params,
      }),
    )
  }, [pathname, params])
  return null
}
/** analytics providers - props */
export interface AnalyticsProvidersProps {
  children: ReactNode
  /** properties to be passed to all captured events */
  defaultProperties?: AnalyticsEventProperties
}
/** analytics providers - analytics integration and capture provider */
export const AnalyticsProviders = ({ children, defaultProperties }: AnalyticsProvidersProps) => {
  return (
      <CaptureProvider defaultProperties={defaultProperties}>
        <PageView />
        {children}
      </CaptureProvider>
  )
}
