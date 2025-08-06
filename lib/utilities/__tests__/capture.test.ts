import { AnalyticsEvent, AnalyticsEventProperties } from '~/lib/core/models/analyticEvents/analyticsEvent'
import { capture } from '~/lib/utilities/capture'

describe('capture', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should capture event', () => {
    const titleSelectedEvent: AnalyticsEvent<'title_selected', 1> = {
      name: 'title_selected',
      schemaVersion: 1,
      properties: {
        title_id: 'title-id',
        title_format: 'movie',
        title_name: 'title-name',
        source_shelf: 'source-shelf',
      },
    }
    const consoleSpy = jest.spyOn(console, 'log')
    capture(titleSelectedEvent)
    // should have called console.log with the expected arguments
    expect(consoleSpy).toHaveBeenCalledWith('event', 'title_selected', 1, {
      title_id: 'title-id',
      title_format: 'movie',
      title_name: 'title-name',
      source_shelf: 'source-shelf',
    })
  })

  it('should capture event with default properties', () => {
    const pageViewedEvent: AnalyticsEvent<'title_selected', 1> = {
      name: 'title_selected',
      schemaVersion: 1,
      properties: {
        title_id: 'title-id',
        title_format: 'movie',
        title_name: 'title-name',
        source_shelf: 'source-shelf',
      },
    }
    const defaultProperties: AnalyticsEventProperties = {
      test_default_property: 'test_default_value',
    }
    const consoleSpy = jest.spyOn(console, 'log')
    capture(pageViewedEvent, defaultProperties)
    // should have called console.log with the expected arguments
    expect(consoleSpy).toHaveBeenCalledWith('event', 'title_selected', 1, {
      title_id: 'title-id',
      title_format: 'movie',
      title_name: 'title-name',
      source_shelf: 'source-shelf',
      test_default_property: 'test_default_value',
    })
  })

  it('should capture page_viewed event', () => {
    const pageViewedEvent: AnalyticsEvent<'page_viewed', 1> = {
      name: 'page_viewed',
      schemaVersion: 1,
      properties: {
        page_path: 'test',
        page_params: {},
      },
    }
    const consoleSpy = jest.spyOn(console, 'log')
    capture(pageViewedEvent)
    // should have called console.log with the expected arguments
    expect(consoleSpy).toHaveBeenCalledWith('event', 'page_viewed', 1, {
      page_path: 'test',
      page_params: {},
    })
  })
})
