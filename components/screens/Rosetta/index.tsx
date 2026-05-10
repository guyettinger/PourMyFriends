import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Dimensions,
  PanResponder,
  Modal,
  TouchableOpacity,
  Text as RNText,
  ScrollView,
  Platform,
} from 'react-native'
import type { GestureResponderEvent, ViewStyle } from 'react-native'
import { GLView } from 'expo-gl'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  baseVertexShader,
  displayShader,
  splatShader,
  curlShader,
  vorticityShader,
  divergenceShader,
  scaleShader,
  pressureShader,
  gradientShader,
  macCormackShader,
  advectionShader,
} from './shaders'

/**
 * Latte Art Rosetta Simulator (Expo + WebGL)
 *
 * Simulates a 2D fluid field (velocity/pressure) and a dye buffer representing frothed milk.
 * The user pours by touching/dragging; velocity and a milk mask are injected via Gaussian splats.
 * A display shader composites milk over espresso, revealing espresso in "valleys" (thin milk)
 * with subtle lighting and crema noise.
 *
 * Pipeline:
 * 1. Velocity update: curl -> vorticity confinement -> divergence -> pressure solve -> gradient subtract -> advection.
 * 2. Dye (milk) advection by the velocity field; dye has zero dissipation (milk persists).
 * 3. Display: tent-filter the milk mask, estimate valleys via Laplacian, thin milk in valleys, add specular and crema.
 */

const SCREEN_WIDTH = Dimensions.get('screen').width
const SCREEN_HEIGHT = Dimensions.get('screen').height

/**
 * Cup geometry in UV space. The cup is a circle on screen but stored as an ellipse
 * in UV coordinates so it stays a true circle regardless of aspect ratio.
 *
 * `radiusUV` is `[Rx, Ry]` such that `Rx * width === Ry * height`.
 */
export interface CupParams {
  center: [number, number]
  radiusUV: [number, number]
  rimThicknessFrac: number
}

/**
 * Compute the cup geometry for a given viewport. Used by both the JS PanResponder
 * (to gate touches) and the GL uniforms (for shader branching) so they agree.
 *
 * Cup is centered at (0.5, 0.5) UV with diameter equal to 85% of `min(width, height)`.
 * Rim band is 4% of the cup radius.
 */
export const computeCupParams = (width: number, height: number): CupParams => {
  const s = Math.min(width, height)
  const radiusPx = 0.5 * 0.85 * s
  return {
    center: [0.5, 0.5],
    radiusUV: [radiusPx / width, radiusPx / height],
    rimThicknessFrac: 0.04,
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** RGB color with components in the 0–1 range. */
interface RGBColor {
  r: number
  g: number
  b: number
}

/** Pending splat input queued from touch events. */
interface SplatInput {
  /** UV x (0 = left, 1 = right). */
  x: number
  /** UV y (0 = bottom, 1 = top). */
  y: number
  dx: number
  dy: number
  pressure: number
  elapsedTime: number
  moveDist: number
  /** Fraction of the move's total flow this stamp carries (1/N for path stamps, 1 for drip). */
  weight: number
}

/** WebGL texture format pair for FBO creation. */
type TextureFormat = { internalFormat: number; format: number }

/** WebGL extension capabilities detected at init. */
interface GLExtensions {
  formatRGBA: TextureFormat | null
  formatRG: TextureFormat | null
  formatR: TextureFormat | null
  halfFloatTexType: number
  supportLinearFiltering: unknown
}

/** Single framebuffer object with an attached texture. */
interface FBO {
  texture: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
  /** 1 / width. */
  texelSizeX: number
  /** 1 / height. */
  texelSizeY: number
  /** Bind this texture to the given unit and return the unit index. */
  attach: (id: number) => number
}

/** Double-buffered FBO for ping-pong rendering. */
interface DoubleFBO {
  width: number
  height: number
  texelSizeX: number
  texelSizeY: number
  read: FBO
  write: FBO
  swap: () => void
}

/** Parameters for a single fluid splat injection. */
interface SplatParams {
  x: number
  y: number
  dx: number
  dy: number
  color: RGBColor
  /** Splat radius as % of screen size. Defaults to config.SPLAT_RADIUS. */
  radiusPct?: number
  radialForce?: number
  /** Pitcher height 0..1; 0 = low (visible draw), 1 = high (invisible fill). */
  heightFactor?: number
}

/** Parameters for creating a single FBO. */
interface CreateFBOParams {
  w: number
  h: number
  internalFormat: number
  format: number
  type: number
  filtering: number
}

/** Compiled GL program wrapper. */
interface GLProgram {
  uniforms: Record<string, WebGLUniformLocation | null>
  program: WebGLProgram
  bind: () => void
}

/** Parameters for compiling a single shader. */
interface CompileShaderParams {
  /** WebGL shader type (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER). */
  type: number
  /** GLSL source code. */
  source: string
  /** Optional preprocessor `#define` keywords prepended to the source. */
  keywords: string[] | null
}

/** Parameters for probing whether a texture/internal-format combination is renderable. */
interface FormatProbeParams {
  /** WebGL or WebGL2 rendering context. */
  gl: WebGLRenderingContext
  /** Texture internal format (e.g. gl.RGBA, gl2.RGBA16F). */
  internalFormat: number
  /** Texture pixel format (e.g. gl.RGBA, gl2.RG). */
  format: number
  /** Pixel data type (e.g. gl.UNSIGNED_BYTE, halfFloat). */
  type: number
}

/** Parameters for clearing a single FBO to a solid RGBA color. */
interface ClearFBOParams {
  /** Target framebuffer. */
  target: FBO
  /** Red channel 0..1. */
  r: number
  /** Green channel 0..1. */
  g: number
  /** Blue channel 0..1. */
  b: number
  /** Alpha channel 0..1. */
  a: number
}

/** Parameters for adjusting one sim setting via the settings UI. */
interface AdjustSettingParams {
  /** Setting key on SimSettings. */
  key: keyof SimSettings
  /** Signed change to apply to the current value. */
  delta: number
  /** Minimum allowed value (inclusive). */
  min: number
  /** Maximum allowed value (inclusive). */
  max: number
}

/** Parameters for one MacCormack advection of a single field (forward → backward → combine). */
interface AdvectMacCormackParams {
  /** Field at time n (sampled by the corrector). */
  source: FBO
  /** Where the corrected field is written. */
  dst: FBO
  /** Scratch for forward-advected phi_hat. */
  hat: FBO
  /** Scratch for round-trip phi_bar. */
  bar: FBO
  /** Per-axis (1/w, 1/h) of the destination grid; used as the manual-filter fallback texel. */
  dstTexelSize: [number, number]
  /** Dissipation factor passed to the combine pass. */
  dissipation: number
  /** Simulation dt. */
  dt: number
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Global simulation configuration.
 * Mutate directly for immediate effect; settings UI writes here.
 */
const config = {
  SIM_RESOLUTION: 256,
  DYE_RESOLUTION: 512,

  // Fluid tuning
  DENSITY_DISSIPATION: 0,
  VELOCITY_DISSIPATION: 0.98,
  PRESSURE: 1,
  PRESSURE_ITERATIONS: 20,
  CURL: 0,

  // Pour tuning
  SPLAT_RADIUS: 4.0,
  // Halved (was 200) when advection.frag's trace switched from the dye-grid
  // texelSize to the velocity-grid uVelTexelSize — same touch motion now produces
  // ~2× the dye displacement, so the velocity injection is scaled down to match.
  SPLAT_FORCE: 100,
  RADIAL_PUSH: 0.25,
  FOAM_ABSORPTION: 1.0,
  /** Pitcher height: 0 = low (visible "draw"), 1 = high (invisible "fill"). */
  PITCHER_HEIGHT: 0.05,

  // Latte-art display
  MASK_HARDEN: 0.3,
  MILK_SPECULAR: 0.28,
  SPECULAR_POWER: 48.0,
  SPECULAR_CLAMP: 0.48,
  MILK_OPACITY: 1.0,
  CREMA_STRENGTH: 0.0,
  VALLEY_STRENGTH: 0.9,
  PAUSED: false,

  // Cup geometry & rim look
  CUP_INSET: 0.85,
  RIM_THICKNESS_FRAC: 0.04,
  RIM_COLOR: { r: 0.92, g: 0.88, b: 0.82 } as RGBColor,
  RIM_SHADOW_COLOR: { r: 0.35, g: 0.28, b: 0.22 } as RGBColor,

  // Colors (all as RGBColor — 0..1 per channel).
  ESPRESSO_COLOR: { r: 0.22, g: 0.12, b: 0.05 } as RGBColor,
  MILK_COLOR: { r: 1.0, g: 0.98, b: 0.96 } as RGBColor,
  /** Crema layer tint — tan-brown froth modulated by crema density. */
  CREMA_TINT_COLOR: { r: 0.25, g: 0.15, b: 0.1 } as RGBColor,
  /** Warm rim tint at the milk↔crema boundary. */
  MILK_RIM_COLOR: { r: 0.45, g: 0.28, b: 0.12 } as RGBColor,
  /** Warm tint applied to specular highlights on the milk. */
  SPECULAR_TINT_COLOR: { r: 1.0, g: 0.97, b: 0.92 } as RGBColor,
  /** Backdrop showing behind/around the GLView. */
  CUP_BACKGROUND_COLOR: { r: 25 / 255, g: 15 / 255, b: 8 / 255 } as RGBColor,
  /** Settings modal backdrop. */
  MODAL_BACKGROUND_COLOR: { r: 18 / 255, g: 12 / 255, b: 8 / 255 } as RGBColor,
  /** Accent color for secondary HUD text (Done button, reset link). */
  HUD_ACCENT_COLOR: { r: 0xa0 / 255, g: 0x89 / 255, b: 0x6b / 255 } as RGBColor,
  /** Label color for settings rows. */
  HUD_LABEL_COLOR: { r: 0xd0 / 255, g: 0xc0 / 255, b: 0xa8 / 255 } as RGBColor,
}

/** Convert an RGBColor (0..1 per channel) to a CSS rgb() string for React Native styles. */
const rgbToCss = (c: RGBColor) => `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`

/** Settings modal definitions — single source of truth for adjustable sim params. */
const SETTING_DEFS = [
  { label: 'Pitcher Height', key: 'PITCHER_HEIGHT', min: 0, max: 1, step: 0.05 },
  { label: 'Pour Width', key: 'SPLAT_RADIUS', min: 0.5, max: 10.0, step: 0.1 },
  { label: 'Pour Force', key: 'SPLAT_FORCE', min: 50, max: 500, step: 10 },
  { label: 'Flow Decay', key: 'VELOCITY_DISSIPATION', min: 0, max: 2, step: 0.1 },
  { label: 'Swirl', key: 'CURL', min: 0, max: 10, step: 0.5 },
  { label: 'Edge Definition', key: 'VALLEY_STRENGTH', min: 0, max: 1, step: 0.05 },
  { label: 'Milk Boundary', key: 'MASK_HARDEN', min: 0, max: 1, step: 0.05 },
  { label: 'Radial Push', key: 'RADIAL_PUSH', min: 0, max: 8, step: 0.25 },
  { label: 'Foam Absorption', key: 'FOAM_ABSORPTION', min: 0, max: 2, step: 0.1 },
  { label: 'Crema Texture', key: 'CREMA_STRENGTH', min: 0, max: 0.3, step: 0.02 },
  { label: 'Milk Opacity', key: 'MILK_OPACITY', min: 0.5, max: 1.0, step: 0.05 },
  { label: 'Milk Shine', key: 'MILK_SPECULAR', min: 0, max: 0.6, step: 0.02 },
  { label: 'Shine Focus', key: 'SPECULAR_POWER', min: 8, max: 128, step: 4 },
] as const

/** User-adjustable simulation settings derived from SETTING_DEFS. */
type SimSettings = { [K in (typeof SETTING_DEFS)[number]['key']]: number }

/** Snapshot of config values at module load, used for "Reset to Defaults". */
const DEFAULT_SETTINGS: SimSettings = Object.fromEntries(
  SETTING_DEFS.map(({ key }) => [key, config[key as keyof typeof config] as number]),
) as SimSettings

/** Style for the +/- stepper buttons in the settings modal. Hoisted to avoid per-render re-allocation. */
const STEPPER_BUTTON_STYLE: ViewStyle = {
  width: 36,
  height: 36,
  borderRadius: 8,
  backgroundColor: 'rgba(255,255,255,0.1)',
  alignItems: 'center',
  justifyContent: 'center',
}

/**
 * Read normalized 3D-touch pressure from a `GestureResponderEvent`, clamped to `[0.1, 1.0]`.
 * Falls back to `1.0` when `force` is missing or zero (devices without 3D Touch report no force).
 */
const getTouchPressure = (evt: GestureResponderEvent): number => {
  const force = (evt.nativeEvent as unknown as { force?: number }).force || 1.0
  return Math.max(0.1, Math.min(1.0, force))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Interactive latte art simulator screen with WebGL fluid dynamics and a settings HUD. */
export const RosettaScreen = () => {
  const touchingRef = useRef(false)
  const lastTouchRef = useRef({ x: 0, y: 0 })
  const splatStackRef = useRef<SplatInput[]>([])
  const touchPressureRef = useRef(0)
  const pourIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pourStartTimeRef = useRef(0)
  const lastMoveTimeRef = useRef(0)
  const cancelSimRef = useRef<(() => void) | null>(null)

  const [simKey, setSimKey] = useState(0)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [settings, setSettings] = useState<SimSettings>({ ...DEFAULT_SETTINGS })

  const insets = useSafeAreaInsets()

  const cupParams = React.useMemo(() => computeCupParams(SCREEN_WIDTH, SCREEN_HEIGHT), [])

  /** Adjust a single setting by `delta`, clamped to `[min, max]`. Mutates `config` immediately. */
  const adjustSetting = (params: AdjustSettingParams) => {
    const { key, delta, min, max } = params
    setSettings((prev) => {
      const next = Math.round((prev[key] + delta) * 1000) / 1000
      const clamped = Math.max(min, Math.min(max, next))
      ;(config as Record<string, unknown>)[key] = clamped
      return { ...prev, [key]: clamped }
    })
  }

  /** Reset all settings to their initial defaults. */
  const resetSettings = () => {
    setSettings({ ...DEFAULT_SETTINGS })
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SimSettings)[]) {
      ;(config as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key]
    }
  }

  /**
   * Start the stationary-drip interval. Fires every 16 ms while the finger is held still.
   * Suppressed when onPanResponderMove fires within the last 32 ms.
   */
  const startContinuousPouring = () => {
    if (pourIntervalRef.current) return
    pourStartTimeRef.current = Date.now()
    pourIntervalRef.current = setInterval(() => {
      if (!touchingRef.current) return
      if (Date.now() - lastMoveTimeRef.current < 32) return
      const baseVel = config.SPLAT_FORCE / 25
      const pressure = touchPressureRef.current || 1.0
      const elapsedTime = (Date.now() - pourStartTimeRef.current) / 1000
      splatStackRef.current.push({
        x: lastTouchRef.current.x,
        y: lastTouchRef.current.y,
        dx: 0,
        dy: -baseVel * pressure,
        pressure,
        elapsedTime,
        moveDist: 0,
        weight: 1,
      })
    }, 16)
  }

  /** Stop the stationary-drip interval. */
  const stopContinuousPouring = () => {
    if (pourIntervalRef.current) {
      clearInterval(pourIntervalRef.current)
      pourIntervalRef.current = null
    }
  }

  const isInsideCup = (x: number, y: number) => {
    const dx = (x - cupParams.center[0]) / cupParams.radiusUV[0]
    const dy = (y - cupParams.center[1]) / cupParams.radiusUV[1]
    const r = Math.sqrt(dx * dx + dy * dy)
    return r <= 1.0 - cupParams.rimThicknessFrac
  }

  /** Memoized PanResponder; reads config inline so it tracks live setting changes. */
  const panResponderRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX / SCREEN_WIDTH
        const y = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
        if (!isInsideCup(x, y)) return
        touchingRef.current = true
        lastTouchRef.current = { x, y }
        touchPressureRef.current = getTouchPressure(evt)
        pourStartTimeRef.current = Date.now()
        startContinuousPouring()
      },
      onPanResponderMove: (evt) => {
        if (!touchingRef.current) return
        lastMoveTimeRef.current = Date.now()

        const newX = evt.nativeEvent.locationX / SCREEN_WIDTH
        const newY = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
        if (!isInsideCup(newX, newY)) {
          // Drag is outside the cup — suppress splat injection, but keep the touch alive
          // so re-entering the cup resumes pouring without requiring lift+touch.
          return
        }
        const p = getTouchPressure(evt)
        touchPressureRef.current = p

        const prev = { ...lastTouchRef.current }
        const ddx = newX - prev.x
        const ddy = newY - prev.y
        const dist = Math.sqrt(ddx * ddx + ddy * ddy)

        // Constant pour velocity — faithful to pitcher tilt (not drag speed).
        // Lateral motion spreads the same flow over more area via sub-splat interpolation below.
        const baseVel = config.SPLAT_FORCE / 25
        const vx = dist > 0 ? (ddx / dist) * baseVel * p : 0
        const vy = dist > 0 ? (ddy / dist) * baseVel * p : -baseVel * p

        // Interpolate along the drag path. Uncap step count — fast swipes must still fill the stream.
        const step = 0.012
        const steps = Math.max(1, Math.ceil(dist / step))
        const elapsedTime = (Date.now() - pourStartTimeRef.current) / 1000
        // Per-stamp share of the move's total flow — keeps total injected momentum
        // per frame constant regardless of sweep speed.
        const weight = 1 / steps

        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          splatStackRef.current.push({
            x: prev.x + ddx * t,
            y: prev.y + ddy * t,
            dx: vx,
            dy: vy,
            pressure: p,
            elapsedTime,
            moveDist: dist,
            weight,
          })
        }

        // Cap the queue so a stalled frame can't cause a lag spike when it resumes.
        if (splatStackRef.current.length > 32) {
          splatStackRef.current.splice(0, splatStackRef.current.length - 32)
        }

        lastTouchRef.current.x = newX
        lastTouchRef.current.y = newY
      },
      onPanResponderRelease: () => {
        touchingRef.current = false
        touchPressureRef.current = 0
        stopContinuousPouring()
      },
    }),
  )

  // Stop interval and cancel RAF loop on unmount
  useEffect(() => {
    return () => {
      stopContinuousPouring()
      if (cancelSimRef.current) {
        cancelSimRef.current()
        cancelSimRef.current = null
      }
    }
  }, [])

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: rgbToCss(config.CUP_BACKGROUND_COLOR),
      }}
    >
      <GLView
        key={simKey}
        style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
        onContextCreate={(gl) => {
          if (cancelSimRef.current) {
            cancelSimRef.current()
            cancelSimRef.current = null
          }
          splatStackRef.current = []
          onContextCreate(gl, splatStackRef, cancelSimRef)
        }}
        {...panResponderRef.current.panHandlers}
      />

      {/* HUD overlay — box-none passes touches through to GLView */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 8,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, minWidth: 44 }}>
          <RNText style={{ color: 'white', fontSize: 28, lineHeight: 32 }}>‹</RNText>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <RNText style={{ color: 'white', fontSize: 17, fontFamily: 'SF-Pro-Display-Bold' }}>Rosetta</RNText>
        </View>
        <TouchableOpacity onPress={() => setSimKey((k) => k + 1)} style={{ padding: 8 }}>
          <RNText style={{ color: 'white', fontSize: 22 }}>↺</RNText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSettingsVisible(true)}
          style={{ padding: 8, minWidth: 44, alignItems: 'flex-end' }}
        >
          <RNText style={{ color: 'white', fontSize: 22 }}>⚙</RNText>
        </TouchableOpacity>
      </View>

      {/* Settings modal */}
      <Modal
        visible={settingsVisible}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: rgbToCss(config.MODAL_BACKGROUND_COLOR) }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingTop: 20,
              paddingHorizontal: 20,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <RNText style={{ flex: 1, color: 'white', fontSize: 18, fontFamily: 'SF-Pro-Display-Bold' }}>
              Simulation Settings
            </RNText>
            <TouchableOpacity onPress={() => setSettingsVisible(false)} style={{ padding: 4 }}>
              <RNText style={{ color: rgbToCss(config.HUD_ACCENT_COLOR), fontSize: 16 }}>Done</RNText>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {SETTING_DEFS.map(({ label, key, min, max, step }) => {
              const decimals = step < 1 ? 2 : 0
              return (
                <View
                  key={key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.06)',
                  }}
                >
                  <RNText style={{ flex: 1, color: rgbToCss(config.HUD_LABEL_COLOR), fontSize: 15 }}>{label}</RNText>
                  <TouchableOpacity
                    onPress={() => adjustSetting({ key, delta: -step, min, max })}
                    style={STEPPER_BUTTON_STYLE}
                  >
                    <RNText style={{ color: 'white', fontSize: 20, lineHeight: 24 }}>−</RNText>
                  </TouchableOpacity>
                  <RNText style={{ color: 'white', fontSize: 15, width: 56, textAlign: 'center' }}>
                    {settings[key].toFixed(decimals)}
                  </RNText>
                  <TouchableOpacity
                    onPress={() => adjustSetting({ key, delta: step, min, max })}
                    style={STEPPER_BUTTON_STYLE}
                  >
                    <RNText style={{ color: 'white', fontSize: 20, lineHeight: 24 }}>+</RNText>
                  </TouchableOpacity>
                </View>
              )
            })}
            <TouchableOpacity
              onPress={resetSettings}
              style={{
                marginTop: 24,
                marginHorizontal: 20,
                marginBottom: 40,
                paddingVertical: 14,
                borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.08)',
                alignItems: 'center',
              }}
            >
              <RNText style={{ color: rgbToCss(config.HUD_ACCENT_COLOR), fontSize: 15 }}>Reset to Defaults</RNText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

// ---------------------------------------------------------------------------
// WebGL Simulation Engine
// ---------------------------------------------------------------------------

/**
 * Initializes the WebGL fluid simulation pipeline and starts the render loop.
 * @param gl - The WebGL rendering context from expo-gl.
 * @param splatStackRef - Shared ref holding pending splat inputs from touch events.
 * @param cancelSimRef - Ref whose value, when called, stops the RAF loop.
 */
function onContextCreate(
  gl: WebGLRenderingContext,
  splatStackRef: React.RefObject<SplatInput[]>,
  cancelSimRef: React.RefObject<(() => void) | null>,
) {
  // --- WebGL capability detection ---

  /** Detect WebGL/WebGL2 capabilities and return supported texture formats. */
  function getWebGLContext(glCtx: WebGLRenderingContext): { gl: WebGLRenderingContext; ext: GLExtensions } {
    const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && glCtx instanceof WebGL2RenderingContext
    let halfFloat: { HALF_FLOAT_OES: number } | null
    let supportLinearFiltering: unknown
    if (isWebGL2) {
      glCtx.getExtension('EXT_color_buffer_float')
      supportLinearFiltering = glCtx.getExtension('OES_texture_float_linear')
    } else {
      halfFloat = glCtx.getExtension('OES_texture_half_float') as { HALF_FLOAT_OES: number } | null
      supportLinearFiltering = glCtx.getExtension('OES_texture_half_float_linear')
    }
    const halfFloatTexType = isWebGL2
      ? (glCtx as unknown as { HALF_FLOAT: number }).HALF_FLOAT
      : halfFloat!.HALF_FLOAT_OES
    let formatRGBA: TextureFormat | null
    let formatRG: TextureFormat | null
    let formatR: TextureFormat | null
    if (isWebGL2) {
      const gl2 = glCtx as unknown as WebGL2RenderingContext
      formatRGBA = getSupportedFormat({ gl: glCtx, internalFormat: gl2.RGBA16F, format: glCtx.RGBA, type: halfFloatTexType })
      formatRG = getSupportedFormat({ gl: glCtx, internalFormat: gl2.RG16F, format: gl2.RG, type: halfFloatTexType })
      formatR = getSupportedFormat({ gl: glCtx, internalFormat: gl2.R16F, format: gl2.RED, type: halfFloatTexType })
    } else {
      formatRGBA = getSupportedFormat({ gl: glCtx, internalFormat: glCtx.RGBA, format: glCtx.RGBA, type: halfFloatTexType })
      formatRG = getSupportedFormat({ gl: glCtx, internalFormat: glCtx.RGBA, format: glCtx.RGBA, type: halfFloatTexType })
      formatR = getSupportedFormat({ gl: glCtx, internalFormat: glCtx.RGBA, format: glCtx.RGBA, type: halfFloatTexType })
    }
    return {
      gl: glCtx,
      ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering },
    }
  }

  /**
   * Probe the given internal/pixel format pair for renderability, recursively falling back to
   * wider formats (R16F → RG16F → RGBA16F) if necessary. Returns null if no fallback succeeds.
   */
  function getSupportedFormat(params: FormatProbeParams): TextureFormat | null {
    const { gl: glCtx, internalFormat, format, type } = params
    if (!supportRenderTextureFormat(params)) {
      const gl2 = glCtx as unknown as WebGL2RenderingContext
      switch (internalFormat) {
        case gl2.R16F:
          return getSupportedFormat({ gl: glCtx, internalFormat: gl2.RG16F, format: gl2.RG, type })
        case gl2.RG16F:
          return getSupportedFormat({ gl: glCtx, internalFormat: gl2.RGBA16F, format: glCtx.RGBA, type })
        default:
          return null
      }
    }
    return { internalFormat, format }
  }

  /**
   * Check whether the given internal/pixel format pair is render-target-complete on this GPU.
   * Allocates a 4×4 probe texture and framebuffer; both are deleted before returning so the
   * probe never leaks GL resources, regardless of the result.
   */
  function supportRenderTextureFormat(params: FormatProbeParams): boolean {
    const { gl: glCtx, internalFormat, format, type } = params
    const texture = glCtx.createTexture()
    glCtx.bindTexture(glCtx.TEXTURE_2D, texture)
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.NEAREST)
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.NEAREST)
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE)
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE)
    glCtx.texImage2D(glCtx.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null)
    const fbo = glCtx.createFramebuffer()
    glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, fbo)
    glCtx.framebufferTexture2D(glCtx.FRAMEBUFFER, glCtx.COLOR_ATTACHMENT0, glCtx.TEXTURE_2D, texture, 0)
    const status = glCtx.checkFramebufferStatus(glCtx.FRAMEBUFFER)
    glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, null)
    glCtx.bindTexture(glCtx.TEXTURE_2D, null)
    glCtx.deleteFramebuffer(fbo)
    glCtx.deleteTexture(texture)
    return status === glCtx.FRAMEBUFFER_COMPLETE
  }

  /** Resolve a target sim resolution into pixel dimensions matching the drawing buffer's aspect ratio. */
  function getResolution(resolution: number): { width: number; height: number } {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio
    const min = Math.round(resolution)
    const max = Math.round(resolution * aspectRatio)
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min }
    else return { width: min, height: max }
  }

  const { ext } = getWebGLContext(gl)

  const cupParams = computeCupParams(gl.drawingBufferWidth, gl.drawingBufferHeight)

  /** Push the cup geometry uniforms (`uCupCenter`, `uCupRadiusUV`) into the currently bound program. */
  const setCupUniforms = (program: GLProgram) => {
    gl.uniform2f(program.uniforms.uCupCenter, cupParams.center[0], cupParams.center[1])
    gl.uniform2f(program.uniforms.uCupRadiusUV, cupParams.radiusUV[0], cupParams.radiusUV[1])
  }

  /** Push an RGBColor into a `vec3` uniform. WebGL silently ignores a null location. */
  const setColorUniform = (loc: WebGLUniformLocation | null, c: RGBColor) => {
    gl.uniform3f(loc, c.r, c.g, c.b)
  }

  // --- Shader compilation ---

  /**
   * Compile a single GLSL shader. The keywords (if any) are emitted as `#define`s above the source.
   * Throws with the GLSL info log on compile failure so a broken pipeline never silently renders garbage.
   */
  function compileShader(params: CompileShaderParams): WebGLShader {
    const { type, keywords } = params
    const source = keywords != null ? keywords.map((k) => '#define ' + k + '\n').join('') + params.source : params.source
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? '(no info log)'
      throw new Error(`Shader compile failed (keywords=${keywords?.join(',') ?? 'none'}):\n${log}`)
    }
    return shader
  }

  /** Link a vertex+fragment shader pair into a program; throws with the program info log on failure. */
  function createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.bindAttribLocation(program, 0, 'aPosition')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? '(no info log)'
      throw new Error(`Program link failed:\n${log}`)
    }
    return program
  }

  /** Enumerate active uniforms on a linked program and return a name → location map. */
  function getUniforms(program: WebGLProgram): Record<string, WebGLUniformLocation | null> {
    const uniforms: Record<string, WebGLUniformLocation | null> = {}
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i)!
      uniforms[info.name] = gl.getUniformLocation(program, info.name)
    }
    return uniforms
  }

  // Tracks the currently-bound GLProgram. Maintained by bind() so blit() can
  // push texelSize into the active program without round-tripping through
  // gl.getParameter / gl.getUniformLocation (both are sync-points on mobile GLES).
  let currentGLProgram: GLProgram | null = null

  /**
   * Compile, link, and wrap a shader pair into a `GLProgram`. Calling `bind()` activates the
   * program and updates `currentGLProgram` so `blit` can push the per-target `uTexelSize` uniform.
   */
  function makeProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): GLProgram {
    const program = createProgram(vertexShader, fragmentShader)
    const uniforms = getUniforms(program)
    const result: GLProgram = {
      uniforms,
      program,
      bind() {
        gl.useProgram(program)
        currentGLProgram = result
      },
    }
    return result
  }

  // Compile all shaders
  const baseVertex = compileShader({ type: gl.VERTEX_SHADER, source: baseVertexShader, keywords: ['baseVertex'] })
  const splatFrag = compileShader({ type: gl.FRAGMENT_SHADER, source: splatShader, keywords: ['splatFrag'] })
  const displayFrag = compileShader({ type: gl.FRAGMENT_SHADER, source: displayShader, keywords: ['displayFrag'] })
  const curlFrag = compileShader({ type: gl.FRAGMENT_SHADER, source: curlShader, keywords: ['curlFrag'] })
  const vorticityFrag = compileShader({ type: gl.FRAGMENT_SHADER, source: vorticityShader, keywords: ['vorticityFrag'] })
  const divergenceFrag = compileShader({ type: gl.FRAGMENT_SHADER, source: divergenceShader, keywords: ['divergenceFrag'] })
  const scaleFrag = compileShader({ type: gl.FRAGMENT_SHADER, source: scaleShader, keywords: ['scaleFrag'] })
  const pressureFrag = compileShader({ type: gl.FRAGMENT_SHADER, source: pressureShader, keywords: ['pressureFrag'] })
  const gradientFrag = compileShader({ type: gl.FRAGMENT_SHADER, source: gradientShader, keywords: ['gradientFrag'] })
  const advectionFrag = compileShader({
    type: gl.FRAGMENT_SHADER,
    source: advectionShader,
    keywords: ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'],
  })
  const macCormackFrag = compileShader({ type: gl.FRAGMENT_SHADER, source: macCormackShader, keywords: ['macCormackFrag'] })

  const splatProgram = makeProgram(baseVertex, splatFrag)
  const displayProgram = makeProgram(baseVertex, displayFrag)
  const curlProgram = makeProgram(baseVertex, curlFrag)
  const vorticityProgram = makeProgram(baseVertex, vorticityFrag)
  const divergenceProgram = makeProgram(baseVertex, divergenceFrag)
  const scaleProgram = makeProgram(baseVertex, scaleFrag)
  const pressureProgram = makeProgram(baseVertex, pressureFrag)
  const gradientSubtractProgram = makeProgram(baseVertex, gradientFrag)
  const advectionProgram = makeProgram(baseVertex, advectionFrag)
  const macCormackProgram = makeProgram(baseVertex, macCormackFrag)

  // --- Fullscreen blit ---

  /**
   * Draw a fullscreen quad into `target` (or the default framebuffer when null).
   * Maintained as an IIFE so the static unit-quad VBO is created exactly once per context.
   * Pushes `uTexelSize` into the currently bound program if it declares one.
   */
  const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(0)
    return (target: FBO | null, clear = false) => {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      } else {
        gl.viewport(0, 0, target.width, target.height)
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
      }
      const texelX = target ? 1.0 / target.width : 1.0 / gl.drawingBufferWidth
      const texelY = target ? 1.0 / target.height : 1.0 / gl.drawingBufferHeight
      const loc = currentGLProgram?.uniforms.uTexelSize
      if (loc) gl.uniform2f(loc, texelX, texelY)

      if (clear) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
    }
  })()

  // --- FBO helpers ---

  /** Create a single FBO with one color attachment and the given filter mode. */
  function createFBO(params: CreateFBOParams): FBO {
    const { w, h, internalFormat, format, type, filtering } = params
    gl.activeTexture(gl.TEXTURE0)
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtering)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtering)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1.0 / w,
      texelSizeY: 1.0 / h,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        return id
      },
    }
  }

  /** Create a ping-pong (read/write + swap) FBO for accumulator passes like dye, velocity, and pressure. */
  function createDoubleFBO(params: CreateFBOParams): DoubleFBO {
    const result: DoubleFBO = {
      width: params.w,
      height: params.h,
      texelSizeX: 1.0 / params.w,
      texelSizeY: 1.0 / params.h,
      read: createFBO(params),
      write: createFBO(params),
      swap() {
        const temp = result.read
        result.read = result.write
        result.write = temp
      },
    }
    return result
  }

  // --- Framebuffers ---

  let dye: DoubleFBO
  let velocity: DoubleFBO
  let curl: FBO
  let divergence: FBO
  let pressure: DoubleFBO
  // MacCormack scratch buffers — phi_hat (forward-advected) and phi_bar (round-trip).
  let velHat: FBO
  let velBar: FBO
  let dyeHat: FBO
  let dyeBar: FBO

  /** Clear a FBO to a solid RGBA color. Used to prime the dye field with full crema. */
  function clearFBO(params: ClearFBOParams) {
    const { target, r, g, b, a } = params
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, target.width, target.height)
    gl.clearColor(r, g, b, a)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  function initFramebuffers() {
    const simRes = getResolution(config.SIM_RESOLUTION)
    const dyeRes = getResolution(config.DYE_RESOLUTION)
    const texType = ext.halfFloatTexType
    const rgba = ext.formatRGBA!
    const rg = ext.formatRG!
    const r = ext.formatR!
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST
    gl.disable(gl.BLEND)

    /** Build a single FBO at sim resolution with the given format and filter mode. */
    const simFBO = (fmt: TextureFormat, filter: number): FBO =>
      createFBO({ w: simRes.width, h: simRes.height, internalFormat: fmt.internalFormat, format: fmt.format, type: texType, filtering: filter })

    /** Build a single FBO at dye resolution with the given format and filter mode. */
    const dyeFBO = (fmt: TextureFormat, filter: number): FBO =>
      createFBO({ w: dyeRes.width, h: dyeRes.height, internalFormat: fmt.internalFormat, format: fmt.format, type: texType, filtering: filter })

    /** Build a ping-pong (read/write) FBO at sim resolution. */
    const simDoubleFBO = (fmt: TextureFormat, filter: number): DoubleFBO =>
      createDoubleFBO({ w: simRes.width, h: simRes.height, internalFormat: fmt.internalFormat, format: fmt.format, type: texType, filtering: filter })

    /** Build a ping-pong (read/write) FBO at dye resolution. */
    const dyeDoubleFBO = (fmt: TextureFormat, filter: number): DoubleFBO =>
      createDoubleFBO({ w: dyeRes.width, h: dyeRes.height, internalFormat: fmt.internalFormat, format: fmt.format, type: texType, filtering: filter })

    if (dye == null) dye = dyeDoubleFBO(rgba, filtering)
    if (velocity == null) velocity = simDoubleFBO(rg, filtering)
    if (curl == null) curl = simFBO(r, gl.NEAREST)
    if (divergence == null) divergence = simFBO(r, gl.NEAREST)
    if (pressure == null) pressure = simDoubleFBO(r, gl.NEAREST)
    if (velHat == null) velHat = simFBO(rg, filtering)
    if (velBar == null) velBar = simFBO(rg, filtering)
    if (dyeHat == null) dyeHat = dyeFBO(rgba, filtering)
    if (dyeBar == null) dyeBar = dyeFBO(rgba, filtering)

    // Prime the cup with a full crema layer (g = 1.0). Both read/write buffers seeded
    // so the first swap doesn't overwrite with a stale zeroed buffer.
    clearFBO({ target: dye.read, r: 0.0, g: 1.0, b: 0.0, a: 1.0 })
    clearFBO({ target: dye.write, r: 0.0, g: 1.0, b: 0.0, a: 1.0 })
  }

  // --- Simulation ---

  /**
   * Inject a splat into the velocity and dye fields.
   * Three GPU passes: radial push (optional), directional velocity, milk mask deposit.
   */
  function splat(params: SplatParams) {
    const { x, y, dx, dy, color, radiusPct, radialForce, heightFactor } = params
    const radius = (radiusPct ?? config.SPLAT_RADIUS) / 10000.0
    const h = heightFactor ?? 0

    splatProgram.bind()
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0))
    gl.uniform1f(splatProgram.uniforms.uAspectRatio, gl.drawingBufferWidth / gl.drawingBufferHeight)
    gl.uniform2f(splatProgram.uniforms.uPoint, x, y)
    gl.uniform1f(splatProgram.uniforms.uMaskMode, 0.0)
    gl.uniform1f(splatProgram.uniforms.uHeightFactor, h)
    setCupUniforms(splatProgram)

    const len = Math.sqrt(dx * dx + dy * dy)
    const pourDirX = len > 0.0001 ? dx / len : 0.0
    const pourDirY = len > 0.0001 ? dy / len : -1.0
    gl.uniform2f(splatProgram.uniforms.uPourDir, pourDirX, pourDirY)

    // Pass 1: radial outward displacement (oval kernel).
    // High pitcher deposits less momentum — gentler stream.
    if (radialForce != null && radialForce > 0) {
      const scaledRadial = radialForce * (1.0 - 0.6 * h)
      gl.uniform3f(splatProgram.uniforms.uColor, scaledRadial, 0.0, 0.0)
      gl.uniform1f(splatProgram.uniforms.uRadius, radius * 4.0)
      gl.uniform1f(splatProgram.uniforms.uRadialMode, 1.0)
      blit(velocity.write)
      velocity.swap()
      // Re-bind uTarget to the swapped-in velocity.read so Pass 2 doesn't
      // sample the texture it's about to write to. WebGL2 strict mode (desktop
      // Chrome) rejects that with "Feedback loop formed between Framebuffer
      // and active Texture"; Android's GLES silently permitted it.
      gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0))
    }

    // Pass 2: directional stream momentum (also attenuated at high pitcher).
    const velScale = 1.0 - 0.6 * h
    gl.uniform3f(splatProgram.uniforms.uColor, dx * velScale, dy * velScale, 0.0)
    gl.uniform1f(splatProgram.uniforms.uRadius, radius)
    gl.uniform1f(splatProgram.uniforms.uRadialMode, 0.0)
    blit(velocity.write)
    velocity.swap()

    // Pass 3: dye deposit (milk mask in r, crema erosion in g — handled by shader).
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0))
    gl.uniform3f(splatProgram.uniforms.uColor, color.r, color.g, color.b)
    gl.uniform1f(splatProgram.uniforms.uMaskMode, 1.0)
    blit(dye.write)
    dye.swap()
  }

  /** Drain pending splats from the queue, adaptively capped per frame for performance. */
  function applyInputs() {
    const queue = splatStackRef.current
    const maxSplatsPerFrame = Math.min(8, Math.max(2, Math.ceil(queue.length / 4)))
    const heightFactor = config.PITCHER_HEIGHT
    let processed = 0
    while (queue.length > 0 && processed < maxSplatsPerFrame) {
      const s = queue.shift()!
      const flowRate = 1.0 + Math.min(0.5, s.elapsedTime * 0.1)
      const pressureScale = 0.7 + 0.3 * s.pressure
      const radiusPct = config.SPLAT_RADIUS / (flowRate * pressureScale)
      const radialForce = (config.RADIAL_PUSH / (flowRate * pressureScale)) * s.weight
      splat({
        x: s.x,
        y: s.y,
        dx: s.dx * s.weight,
        dy: s.dy * s.weight,
        color: config.MILK_COLOR,
        radiusPct,
        radialForce,
        heightFactor,
      })
      processed++
    }
  }

  /** Render the display shader: composites dye over espresso with lighting. */
  function drawDisplay(target: FBO | null) {
    displayProgram.bind()
    const u = displayProgram.uniforms
    gl.uniform1i(u.uTexture, dye.read.attach(0))
    setColorUniform(u.uEspresso, config.ESPRESSO_COLOR)
    setColorUniform(u.uMilk, config.MILK_COLOR)
    setColorUniform(u.uCremaTint, config.CREMA_TINT_COLOR)
    setColorUniform(u.uMilkRim, config.MILK_RIM_COLOR)
    setColorUniform(u.uSpecularTint, config.SPECULAR_TINT_COLOR)
    setColorUniform(u.uCupBackground, config.CUP_BACKGROUND_COLOR)
    setColorUniform(u.uRimColor, config.RIM_COLOR)
    setColorUniform(u.uRimShadowColor, config.RIM_SHADOW_COLOR)
    gl.uniform1f(u.uMilkOpacity, config.MILK_OPACITY)
    gl.uniform1f(u.uValleyStrength, config.VALLEY_STRENGTH)
    gl.uniform1f(u.uCremaStrength, config.CREMA_STRENGTH)
    gl.uniform1f(u.uMilkSpecular, config.MILK_SPECULAR)
    gl.uniform1f(u.uSpecularPower, config.SPECULAR_POWER)
    gl.uniform1f(u.uMaskHarden, config.MASK_HARDEN)
    gl.uniform1f(u.uFoamAbsorption, config.FOAM_ABSORPTION)
    gl.uniform1f(u.uSpecularClamp, config.SPECULAR_CLAMP)
    gl.uniform2f(u.uDyeTexelSize, dye.texelSizeX, dye.texelSizeY)
    gl.uniform1f(u.uRimThicknessFrac, cupParams.rimThicknessFrac)
    gl.uniform1f(u.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight)
    setCupUniforms(displayProgram)
    blit(target)
  }

  /**
   * MacCormack advect a single field. Forward pass writes phi_hat, backward writes phi_bar,
   * combine pass clamps `phi_hat + 0.5*(phi - phi_bar)` and writes to `dst`. The caller is
   * responsible for swapping the field's read/write buffers afterwards.
   *
   * `uVelTexelSize` is always the velocity grid (so the trace distance matches across resolutions);
   * `uDyeTexelSize` falls back to the destination grid only when linear filtering is unavailable.
   */
  const advectMacCormack = (params: AdvectMacCormackParams) => {
    const { source, dst, hat, bar, dstTexelSize, dissipation, dt } = params

    advectionProgram.bind()
    setCupUniforms(advectionProgram)
    gl.uniform2f(advectionProgram.uniforms.uVelTexelSize, velocity.texelSizeX, velocity.texelSizeY)
    if (!ext.supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.uDyeTexelSize, dstTexelSize[0], dstTexelSize[1])

    // Forward: phi_hat = advect(phi, v, +dt)
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(advectionProgram.uniforms.uSource, source.attach(1))
    gl.uniform1f(advectionProgram.uniforms.uDt, dt)
    gl.uniform1f(advectionProgram.uniforms.uDissipation, 0.0)
    blit(hat)

    // Backward: phi_bar = advect(phi_hat, v, -dt)
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(advectionProgram.uniforms.uSource, hat.attach(1))
    gl.uniform1f(advectionProgram.uniforms.uDt, -dt)
    gl.uniform1f(advectionProgram.uniforms.uDissipation, 0.0)
    blit(bar)

    // Combine: dst = clamp(phi_hat + 0.5*(phi - phi_bar))
    macCormackProgram.bind()
    setCupUniforms(macCormackProgram)
    gl.uniform2f(macCormackProgram.uniforms.uVelTexelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(macCormackProgram.uniforms.uField, source.attach(0))
    gl.uniform1i(macCormackProgram.uniforms.uVelocity, velocity.read.attach(1))
    gl.uniform1i(macCormackProgram.uniforms.uHat, hat.attach(2))
    gl.uniform1i(macCormackProgram.uniforms.uBar, bar.attach(3))
    gl.uniform1f(macCormackProgram.uniforms.uDt, dt)
    gl.uniform1f(macCormackProgram.uniforms.uDissipation, dissipation)
    blit(dst)
  }

  /** Execute one full simulation step: curl → vorticity → divergence → pressure → gradient → advection. */
  function step(dt: number) {
    gl.disable(gl.BLEND)

    if (config.CURL !== 0) {
      curlProgram.bind()
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0))
      setCupUniforms(curlProgram)
      blit(curl)

      vorticityProgram.bind()
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0))
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1))
      gl.uniform1f(vorticityProgram.uniforms.uCurlStrength, config.CURL)
      gl.uniform1f(vorticityProgram.uniforms.uDt, dt)
      setCupUniforms(vorticityProgram)
      blit(velocity.write)
      velocity.swap()
    }

    divergenceProgram.bind()
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0))
    setCupUniforms(divergenceProgram)
    blit(divergence)

    scaleProgram.bind()
    gl.uniform1i(scaleProgram.uniforms.uSource, pressure.read.attach(0))
    gl.uniform1f(scaleProgram.uniforms.uValue, config.PRESSURE)
    blit(pressure.write)
    pressure.swap()

    pressureProgram.bind()
    setCupUniforms(pressureProgram)
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0))
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1))
      blit(pressure.write)
      pressure.swap()
    }

    gradientSubtractProgram.bind()
    setCupUniforms(gradientSubtractProgram)
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0))
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1))
    blit(velocity.write)
    velocity.swap()

    // Advect velocity (MacCormack: forward → backward → corrected/clamped combine).
    advectMacCormack({
      source: velocity.read,
      dst: velocity.write,
      hat: velHat,
      bar: velBar,
      dstTexelSize: [velocity.texelSizeX, velocity.texelSizeY],
      dissipation: config.VELOCITY_DISSIPATION,
      dt,
    })
    velocity.swap()

    // Advect dye (milk + crema channels) — MacCormack.
    advectMacCormack({
      source: dye.read,
      dst: dye.write,
      hat: dyeHat,
      bar: dyeBar,
      dstTexelSize: [dye.texelSizeX, dye.texelSizeY],
      dissipation: config.DENSITY_DISSIPATION,
      dt,
    })
    dye.swap()
  }

  // --- Init and render loop ---

  initFramebuffers()

  let lastUpdateTime = Date.now()
  function calcDeltaTime(): number {
    const now = Date.now()
    let dt = (now - lastUpdateTime) / 1000
    dt = Math.min(dt, 0.033)
    lastUpdateTime = now
    return dt
  }

  let cancelled = false
  cancelSimRef.current = () => {
    cancelled = true
  }

  function update() {
    if (cancelled) return
    const dt = calcDeltaTime()
    applyInputs()
    if (!config.PAUSED) step(dt)
    drawDisplay(null)
    try {
      ;(gl as unknown as { endFrameEXP: () => void }).endFrameEXP()
    } catch {
      cancelled = true
      return
    }
    requestAnimationFrame(update)
  }

  update()
}
