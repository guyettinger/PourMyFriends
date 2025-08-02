import { useContext } from 'react'
import { CaptureContext, type CaptureFunction } from '~/components/providers/CaptureProvider'

/**
 * a hook to access the analytic event capture function.
 * @returns a capture function that can be used to capture analytic events from anywhere within the CaptureProvider
 */
export const useCapture = (): CaptureFunction => {
  const context = useContext(CaptureContext)
  if (!context) {
    throw new Error('useCapture must be used within a CaptureProvider')
  }
  return context
}
