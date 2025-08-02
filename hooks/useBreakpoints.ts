import { useWindowDimensions } from 'react-native'
import resolveConfig from 'tailwindcss/resolveConfig'
import tailwindConfig from '../tailwind.config.js'

/** using tailwind screens to infer breakpoint sizes */
const fullConfig = resolveConfig(tailwindConfig)
const { theme } = fullConfig
const { screens } = theme
/** breakpoints */
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
type ScreenRecord = Record<Breakpoint, string>
/** get screen size for breakpoint */
export const getScreenSize = (breakpoint: Breakpoint): number => {
  const screenSize = (screens as ScreenRecord)[breakpoint]
  if (!screenSize) return 0
  return parseInt(screenSize.replace('px', ''), 10)
}
/** get breakpoint for a given width */
export const getBreakpoint = (width: number): Breakpoint => {
  return Object.keys(screens).reduce<Breakpoint>((current, breakpoint) => {
    const breakpointValue = getScreenSize(breakpoint as Breakpoint)
    return width >= breakpointValue && breakpointValue > getScreenSize(current) ? (breakpoint as Breakpoint) : current
  }, 'xs')
}
/** use the window dimensions to determine the current breakpoint */
export const useBreakpoint = (): Breakpoint => {
  const { width } = useWindowDimensions()
  return getBreakpoint(width)
}
/** determines if the current width is greater than a given breakpoint */
export const useIsAboveBreakpoint = (breakpoint: Breakpoint): boolean => {
  const { width } = useWindowDimensions()
  return width >= getScreenSize(breakpoint)
}
/** determines if the current width is greater than the sm breakpoint */
export const useIsAboveSm = (): boolean => {
  return useIsAboveBreakpoint('sm')
}
/** determines if the current width is greater than the md breakpoint */
export const useIsAboveMd = (): boolean => {
  return useIsAboveBreakpoint('md')
}
/** determines if the current width is greater than the lg breakpoint */
export const useIsAboveLg = (): boolean => {
  return useIsAboveBreakpoint('lg')
}
/** determines if the current width is greater than the xl breakpoint */
export const useIsAboveXl = (): boolean => {
  return useIsAboveBreakpoint('xl')
}
