import React from 'react'
import { View, Text } from 'react-native'
import { render } from '@testing-library/react-native'
import * as captureLib from '~/lib/utilities/capture'
import { useCapture } from '~/hooks/useCapture'
import { CaptureProvider } from '~/components/providers/CaptureProvider'
import { AnalyticsEvent } from '~/lib/core/models/analyticEvents/analyticsEvent'

/** view that captures an event */
const ViewWithCaptureEvent = ({ event }: { event: AnalyticsEvent }) => {
  const capture = useCapture()
  capture(event)
  return (
    <View>
      <Text>Test</Text>
    </View>
  )
}

describe('CaptureProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders children correctly', () => {
    const testId = 'test-child'
    const { getByTestId } = render(
      <CaptureProvider>
        <View testID={testId}>
          <Text>Test Child</Text>
        </View>
      </CaptureProvider>,
    )
    expect(getByTestId(testId)).toBeTruthy()
  })

  it('provides capture function', () => {
    const mockCapture = jest.spyOn(captureLib, 'capture')
    const analyticsEvent = {
      name: 'test_event',
      schemaVersion: 1,
      properties: { test: 'value' },
    }
    render(
      <CaptureProvider>
        <ViewWithCaptureEvent event={analyticsEvent} />
      </CaptureProvider>,
    )
    expect(mockCapture).toHaveBeenCalledWith(analyticsEvent, undefined)
  })

  it('passes default properties to capture function', () => {
    const mockCapture = jest.spyOn(captureLib, 'capture')
    const defaultProperties = { app: 'pourmyfriends', platform: 'test' }
    const analyticsEvent = {
      name: 'test_event',
      schemaVersion: 1,
      properties: { test: 'value' },
    }
    render(
      <CaptureProvider defaultProperties={defaultProperties}>
        <ViewWithCaptureEvent event={analyticsEvent} />
      </CaptureProvider>,
    )
    expect(mockCapture).toHaveBeenCalledWith(analyticsEvent, defaultProperties)
  })
})
