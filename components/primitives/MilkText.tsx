import { useEffect, useState } from 'react'
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { ClipPath, Defs, Path, Text as SvgText } from 'react-native-svg'

let _uid = 0

const AnimatedPath = Animated.createAnimatedComponent(Path)

interface MilkTextProps {
  children: string
  fontSize?: number
  fontFamily?: string
  milkColor?: string
  ghostColor?: string
  fillDuration?: number
  delay?: number
  style?: StyleProp<ViewStyle>
}

export function MilkText({
  children,
  fontSize = 28,
  fontFamily = 'SF-Pro-Display-Bold',
  milkColor = '#F5F0E8',
  ghostColor = 'rgba(255,255,255,0.2)',
  fillDuration = 1800,
  delay = 0,
  style,
}: MilkTextProps) {
  const [clipId] = useState(() => `mc${++_uid}`)
  // svgWidth drives the SVG width prop (JS-side); containerWidth drives the worklet (UI-side)
  const [svgWidth, setSvgWidth] = useState(0)
  const containerWidth = useSharedValue(0)

  const svgHeight = fontSize * 1.5
  const baseline = fontSize * 1.15

  const fillLevel = useSharedValue(0)
  const wavePhase = useSharedValue(0)

  useEffect(() => {
    fillLevel.value = withDelay(
      delay,
      withTiming(1, { duration: fillDuration, easing: Easing.out(Easing.cubic) })
    )
    wavePhase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 1500, easing: Easing.linear }),
      -1,
      false
    )
    return () => {
      cancelAnimation(fillLevel)
      cancelAnimation(wavePhase)
    }
  }, [])

  const animatedProps = useAnimatedProps(() => {
    'worklet'
    const w = containerWidth.value
    const h = svgHeight

    // Guard: don't produce NaN paths before layout is measured
    if (w <= 0) {
      return { d: '' }
    }

    const N = 30
    const fillY = h * (1 - fillLevel.value)
    const amplitude = 2.0
    const cycles = 3

    let d = ''
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * w
      const y = fillY + amplitude * Math.sin((x / w) * cycles * Math.PI * 2 + wavePhase.value)
      if (i === 0) {
        d += `M ${x} ${y}`
      } else {
        d += ` L ${x} ${y}`
      }
    }
    d += ` L ${w} ${h} L 0 ${h} Z`

    return { d }
  })

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    setSvgWidth(w)
    containerWidth.value = w
  }

  return (
    // width: '100%' ensures the View fills its parent so onLayout reports the real width
    <View onLayout={handleLayout} style={[{ width: '100%' }, style]}>
      {svgWidth > 0 && (
        <Svg width={svgWidth} height={svgHeight}>
          <Defs>
            <ClipPath id={clipId}>
              <SvgText
                x={svgWidth / 2}
                y={baseline}
                textAnchor="middle"
                fontSize={fontSize}
                fontFamily={fontFamily}
              >
                {children}
              </SvgText>
            </ClipPath>
          </Defs>
          {/* Ghost outline — shows unfilled portion */}
          <SvgText
            x={svgWidth / 2}
            y={baseline}
            textAnchor="middle"
            fontSize={fontSize}
            fontFamily={fontFamily}
            fill={ghostColor}
          >
            {children}
          </SvgText>
          {/* Milk fill clipped to text shape */}
          <AnimatedPath
            fill={milkColor}
            clipPath={`url(#${clipId})`}
            animatedProps={animatedProps}
          />
        </Svg>
      )}
    </View>
  )
}
