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
import { GLView } from 'expo-gl'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** RGB color with components in the 0–1 range. */
interface RGBColor {
  /** Red channel. */
  r: number
  /** Green channel. */
  g: number
  /** Blue channel. */
  b: number
}

/** Pending splat input queued from touch events. */
interface SplatInput {
  /** UV x-coordinate (0 = left, 1 = right). */
  x: number
  /** UV y-coordinate (0 = bottom, 1 = top). */
  y: number
  /** Velocity x-component in sim units. */
  dx: number
  /** Velocity y-component in sim units. */
  dy: number
  /** Normalized touch pressure (0.1–1.0). */
  pressure: number
  /** Seconds elapsed since the current pour began. */
  elapsedTime: number
}

/** WebGL texture format pair for FBO creation. */
interface TextureFormat {
  /** GL internal format enum (e.g. RGBA16F). */
  internalFormat: number
  /** GL pixel format enum (e.g. RGBA). */
  format: number
}

/** WebGL extension capabilities detected at init. */
interface GLExtensions {
  /** RGBA half-float format, or null if unsupported. */
  formatRGBA: TextureFormat | null
  /** RG half-float format, or null if unsupported. */
  formatRG: TextureFormat | null
  /** R half-float format, or null if unsupported. */
  formatR: TextureFormat | null
  /** Half-float texture type enum. */
  halfFloatTexType: number
  /** Whether OES_texture_*_linear is available. */
  supportLinearFiltering: unknown
}

/** Single framebuffer object with an attached texture. */
interface FBO {
  /** The backing GL texture. */
  texture: WebGLTexture
  /** The GL framebuffer. */
  fbo: WebGLFramebuffer
  /** Texture width in pixels. */
  width: number
  /** Texture height in pixels. */
  height: number
  /** 1 / width. */
  texelSizeX: number
  /** 1 / height. */
  texelSizeY: number
  /** Bind this texture to the given texture unit and return the unit index. */
  attach: (id: number) => number
}

/** Double-buffered FBO for ping-pong rendering. */
interface DoubleFBO {
  /** Texture width in pixels. */
  width: number
  /** Texture height in pixels. */
  height: number
  /** 1 / width. */
  texelSizeX: number
  /** 1 / height. */
  texelSizeY: number
  /** Current read buffer. */
  read: FBO
  /** Current write buffer. */
  write: FBO
  /** Swap read and write buffers. */
  swap: () => void
}

/** Parameters for a single fluid splat injection. */
interface SplatParams {
  /** UV x-coordinate of the splat center. */
  x: number
  /** UV y-coordinate of the splat center. */
  y: number
  /** Velocity x-component. */
  dx: number
  /** Velocity y-component. */
  dy: number
  /** Dye color to deposit. */
  color: RGBColor
  /** Splat radius as a percentage of screen size. Defaults to config.SPLAT_RADIUS. */
  radiusPct?: number
  /** Radial outward displacement force. */
  radialForce?: number
}

/** Parameters for creating a single FBO. */
interface CreateFBOParams {
  /** Width in pixels. */
  w: number
  /** Height in pixels. */
  h: number
  /** GL internal format. */
  internalFormat: number
  /** GL pixel format. */
  format: number
  /** GL texture data type. */
  type: number
  /** GL filtering mode (LINEAR or NEAREST). */
  filtering: number
}

/** Compiled GL program wrapper. */
interface GLProgram {
  /** Map of uniform names to their GL locations. */
  uniforms: Record<string, WebGLUniformLocation | null>
  /** The underlying WebGLProgram. */
  program: WebGLProgram
  /** Activate this program for subsequent draw calls. */
  bind: () => void
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
  CAPTURE_RESOLUTION: 1024,

  // Fluid tuning
  DENSITY_DISSIPATION: 0,
  VELOCITY_DISSIPATION: 1,
  PRESSURE: 1,
  PRESSURE_ITERATIONS: 10,
  CURL: 0,

  // Pour tuning
  SPLAT_RADIUS: 1.2,
  SPLAT_FORCE: 200,
  RADIAL_PUSH: 3.0,
  FOAM_ABSORPTION: 1.0,

  // Latte-art display
  TRANSPARENT: false,
  MASK_HARDEN: 0.4,
  MILK_SPECULAR: 0.28,
  SPECULAR_POWER: 48.0,
  SPECULAR_CLAMP: 0.48,
  MILK_OPACITY: 1.0,
  CREMA_STRENGTH: 0.08,
  ESPRESSO_COLOR: { r: 0.14, g: 0.055, b: 0.014 } as RGBColor,
  MILK_COLOR: { r: 1.0, g: 0.98, b: 0.96 } as RGBColor,
  VALLEY_STRENGTH: 0.9,
  PAUSED: false,
}

/** User-adjustable simulation settings exposed in the HUD modal. */
interface SimSettings {
  /** Gaussian splat radius as % of screen. */
  SPLAT_RADIUS: number
  /** Velocity magnitude injected per splat. */
  SPLAT_FORCE: number
  /** Rate at which velocity decays each frame (higher = faster decay). */
  VELOCITY_DISSIPATION: number
  /** Vorticity confinement strength. */
  CURL: number
  /** Strength of espresso reveal in thin-milk valleys. */
  VALLEY_STRENGTH: number
  /** Sharpness of the milk-espresso boundary (0 = soft, 1 = crisp). */
  MASK_HARDEN: number
  /** Radial outward displacement intensity around the pour point. */
  RADIAL_PUSH: number
  /** Beer-Lambert absorption coefficient for foam opacity. */
  FOAM_ABSORPTION: number
  /** Granular crema noise intensity on espresso surface. */
  CREMA_STRENGTH: number
  /** Overall milk opacity (lower reveals more espresso through foam). */
  MILK_OPACITY: number
  /** Specular highlight intensity on milk foam. */
  MILK_SPECULAR: number
  /** Specular exponent controlling highlight tightness. */
  SPECULAR_POWER: number
}

/** UI definition for a single settings row. */
interface SettingDef {
  /** Display label shown in the settings modal. */
  label: string
  /** Config key to read/write. */
  key: keyof SimSettings
  /** Minimum allowed value. */
  min: number
  /** Maximum allowed value. */
  max: number
  /** Increment/decrement step size. */
  step: number
}

/** Settings modal definitions mapping labels to config keys. */
const SETTING_DEFS: SettingDef[] = [
  { label: 'Pour Width', key: 'SPLAT_RADIUS', min: 0.5, max: 4.0, step: 0.1 },
  { label: 'Pour Force', key: 'SPLAT_FORCE', min: 50, max: 300, step: 10 },
  { label: 'Flow Decay', key: 'VELOCITY_DISSIPATION', min: 0, max: 2, step: 0.1 },
  { label: 'Swirl', key: 'CURL', min: 0, max: 5, step: 0.5 },
  { label: 'Edge Definition', key: 'VALLEY_STRENGTH', min: 0, max: 1, step: 0.05 },
  { label: 'Milk Boundary', key: 'MASK_HARDEN', min: 0, max: 1, step: 0.05 },
  { label: 'Radial Push', key: 'RADIAL_PUSH', min: 0, max: 5, step: 0.25 },
  { label: 'Foam Absorption', key: 'FOAM_ABSORPTION', min: 0, max: 2, step: 0.1 },
  { label: 'Crema Texture', key: 'CREMA_STRENGTH', min: 0, max: 0.3, step: 0.02 },
  { label: 'Milk Opacity', key: 'MILK_OPACITY', min: 0.5, max: 1.0, step: 0.05 },
  { label: 'Milk Shine', key: 'MILK_SPECULAR', min: 0, max: 0.6, step: 0.02 },
  { label: 'Shine Focus', key: 'SPECULAR_POWER', min: 8, max: 128, step: 4 },
]

/** Snapshot of config values at module load, used for "Reset to Defaults". */
const DEFAULT_SETTINGS: SimSettings = {
  SPLAT_RADIUS: config.SPLAT_RADIUS,
  SPLAT_FORCE: config.SPLAT_FORCE,
  VELOCITY_DISSIPATION: config.VELOCITY_DISSIPATION,
  CURL: config.CURL,
  VALLEY_STRENGTH: config.VALLEY_STRENGTH,
  MASK_HARDEN: config.MASK_HARDEN,
  RADIAL_PUSH: config.RADIAL_PUSH,
  FOAM_ABSORPTION: config.FOAM_ABSORPTION,
  CREMA_STRENGTH: config.CREMA_STRENGTH,
  MILK_OPACITY: config.MILK_OPACITY,
  MILK_SPECULAR: config.MILK_SPECULAR,
  SPECULAR_POWER: config.SPECULAR_POWER,
}

// ---------------------------------------------------------------------------
// GLSL Shaders
// ---------------------------------------------------------------------------

/** Shared vertex shader: computes UV and 4-neighbor offsets from texelSize. */
const baseVertexShader = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

/**
 * Display fragment shader: composites milk mask over espresso.
 * Uses a 3x3 tent blur, Laplacian valley detection, Beer-Lambert opacity,
 * boundary sharpening, directional lighting, crema noise, and warm specular.
 */
const displayShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uTexture;
uniform vec3 uEspresso;
uniform vec3 uMilk;
uniform float uMilkOpacity;
uniform vec2 texelSize;
uniform float uValleyStrength;
uniform float uCremaStrength;
uniform float uMilkSpecular;
uniform float uSpecularPower;
uniform float uMaskHarden;
uniform float uFoamAbsorption;
uniform float uSpecularClamp;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main () {
  // Sample 4-neighbor mask values
  float m  = texture2D(uTexture, vUv).r;
  float ml = texture2D(uTexture, vL).r;
  float mr = texture2D(uTexture, vR).r;
  float mt = texture2D(uTexture, vT).r;
  float mb = texture2D(uTexture, vB).r;

  // Diagonal samples for 3x3 tent kernel
  vec2 d = texelSize;
  float mtl = texture2D(uTexture, vUv + vec2(-d.x,  d.y)).r;
  float mtr = texture2D(uTexture, vUv + vec2( d.x,  d.y)).r;
  float mbl = texture2D(uTexture, vUv + vec2(-d.x, -d.y)).r;
  float mbr = texture2D(uTexture, vUv + vec2( d.x, -d.y)).r;

  // 3x3 tent blur to reduce pixelation
  float edges = ml + mr + mt + mb;
  float corners = mtl + mtr + mbl + mbr;
  float mBlur = (4.0*m + 2.0*edges + corners) / 16.0;

  // Valley detection: Laplacian of raw mask (positive at local minima = thin milk)
  float laplacian = ml + mr + mt + mb - 4.0 * m;
  float valleyScale = 10.0 / (length(texelSize) * 512.0);
  float valley = clamp(laplacian * uValleyStrength * valleyScale, 0.0, 1.0);
  float mask = mBlur;

  // Beer-Lambert opacity: thin foam is translucent, thick foam is opaque
  float physAlpha = 1.0 - exp(-uFoamAbsorption * mBlur);

  // Sharpen the milk-espresso boundary
  float lo = mix(0.0, 0.3, uMaskHarden);
  float hi = mix(1.0, 0.65, uMaskHarden);
  float mEdge = smoothstep(lo, hi, physAlpha);
  float maskAlpha = clamp((mEdge - valley * 0.5) * uMilkOpacity, 0.0, 1.0);

  // Directional lighting from blurred mask gradient
  float dx = mr - ml;
  float dy = mt - mb;
  vec3 n = normalize(vec3(dx, dy, 0.15));
  vec3 lightDir = normalize(vec3(0.2, 0.3, 1.0));
  float diff = clamp(dot(n, lightDir), 0.0, 1.0);

  // Crema noise on espresso surface
  float crema = 1.0 - uCremaStrength * hash21(floor(vUv * 256.0));
  vec3 espresso = uEspresso * crema;

  // Specular highlight gated by maskAlpha with warm tint
  float spec = pow(max(n.z, 0.0), uSpecularPower) * uMilkSpecular * maskAlpha;
  spec = min(spec, uSpecularClamp);
  vec3 warmSpec = spec * vec3(1.0, 0.97, 0.92);
  vec3 milkCol = uMilk * (0.8 + 0.2 * diff) + warmSpec;
  vec3 c = mix(espresso, clamp(milkCol, 0.0, 1.0), maskAlpha);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

/**
 * Splat fragment shader: injects velocity (additive) or milk mask (saturating).
 * Supports isotropic Gaussian (directional/dye) and anisotropic oval (radial push).
 */
const splatShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
uniform float uMaskMode;
uniform float uRadialMode;
uniform vec2 uPourDir;

void main () {
  vec2 p_raw = vUv - point.xy;
  vec2 p = vec2(p_raw.x * aspectRatio, p_raw.y);
  float dist2 = dot(p, p);

  // Isotropic Gaussian for directional and dye passes
  float s_iso = exp(-dist2 / radius);

  // Anisotropic Gaussian elongated along pour direction for radial pass
  vec2 pourDirAC = normalize(vec2(uPourDir.x * aspectRatio, uPourDir.y));
  float pPar = dot(p, pourDirAC);
  vec2 pPerpVec = p - pPar * pourDirAC;
  float pPerp2 = dot(pPerpVec, pPerpVec);
  float s_aniso = exp(-(pPar * pPar / radius + pPerp2 / (radius * 0.25)));

  float s = mix(s_iso, s_aniso, uRadialMode);

  // Radial outward unit vector (aspect-corrected -> UV space)
  vec2 outward = p / (sqrt(dist2) + 0.0001);
  vec2 radialVel = vec2(outward.x / aspectRatio, outward.y) * color.r;

  vec2 vel = mix(color.xy, radialVel, uRadialMode);

  vec3 splatContent = mix(vec3(vel, 0.0), color, uMaskMode);
  vec3 splat = splatContent * s;

  vec3 base = texture2D(uTarget, vUv).xyz;
  vec3 result = mix(base + splat, max(base, splat), step(0.5, uMaskMode));
  gl_FragColor = vec4(result, 1.0);
}
`

/** Curl shader: computes scalar vorticity from the velocity field. */
const curlShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`

/** Vorticity confinement shader: re-injects rotational energy to counter numerical dissipation. */
const vorticityShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`

/** Divergence shader: computes velocity divergence with boundary reflection. */
const divergenceShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`

/** Clear shader: scales the existing texture by a uniform value (used to attenuate pressure). */
const clearShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main () {
  gl_FragColor = value * texture2D(uTexture, vUv);
}
`

/** Jacobi pressure solver: one iteration of the pressure Poisson equation. */
const pressureShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`

/** Gradient subtraction shader: subtracts pressure gradient from velocity for incompressibility. */
const gradientShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`

/** Semi-Lagrangian advection shader with optional manual bilinear filtering fallback. */
const advectionShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}
void main () {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
#endif
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}
`

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

  /** Adjust a single setting by delta, clamped to [min, max]. Mutates config immediately. */
  const adjustSetting = (key: keyof SimSettings, delta: number, min: number, max: number) => {
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

  /** Memoized PanResponder; reads config inline so it tracks live setting changes. */
  const panResponderRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        touchingRef.current = true
        const x = evt.nativeEvent.locationX / SCREEN_WIDTH
        const y = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
        lastTouchRef.current = { x, y }
        const pressure = (evt.nativeEvent as unknown as { force?: number }).force || 1.0
        touchPressureRef.current = Math.max(0.1, Math.min(1.0, pressure))
        startContinuousPouring()
      },
      onPanResponderMove: (evt) => {
        if (!touchingRef.current) return
        lastMoveTimeRef.current = Date.now()

        const newX = evt.nativeEvent.locationX / SCREEN_WIDTH
        const newY = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
        const pressure = (evt.nativeEvent as unknown as { force?: number }).force || 1.0
        const p = Math.max(0.1, Math.min(1.0, pressure))
        touchPressureRef.current = p

        const prev = { ...lastTouchRef.current }
        const ddx = newX - prev.x
        const ddy = newY - prev.y
        const dist = Math.sqrt(ddx * ddx + ddy * ddy)

        const baseVel = config.SPLAT_FORCE / 25
        const speed = Math.max(baseVel, dist * config.SPLAT_FORCE * 0.5)
        const vx = dist > 0 ? (ddx / dist) * speed * p : 0
        const vy = dist > 0 ? (ddy / dist) * speed * p : -baseVel * p

        // Interpolate along the drag path to avoid gaps in the stream
        const step = 0.008
        const steps = Math.max(1, Math.min(15, Math.ceil(dist / step)))
        const elapsedTime = (Date.now() - pourStartTimeRef.current) / 1000

        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          splatStackRef.current.push({
            x: prev.x + ddx * t,
            y: prev.y + ddy * t,
            dx: vx,
            dy: vy,
            pressure: p,
            elapsedTime,
          })
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
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgb(25, 15, 8)' }}>
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
        <View style={{ flex: 1, backgroundColor: 'rgb(18, 12, 8)' }}>
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
              <RNText style={{ color: '#A0896B', fontSize: 16 }}>Done</RNText>
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
                  <RNText style={{ flex: 1, color: '#D0C0A8', fontSize: 15 }}>{label}</RNText>
                  <TouchableOpacity
                    onPress={() => adjustSetting(key, -step, min, max)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <RNText style={{ color: 'white', fontSize: 20, lineHeight: 24 }}>−</RNText>
                  </TouchableOpacity>
                  <RNText style={{ color: 'white', fontSize: 15, width: 56, textAlign: 'center' }}>
                    {settings[key].toFixed(decimals)}
                  </RNText>
                  <TouchableOpacity
                    onPress={() => adjustSetting(key, step, min, max)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
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
              <RNText style={{ color: '#A0896B', fontSize: 15 }}>Reset to Defaults</RNText>
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
      formatRGBA = getSupportedFormat(glCtx, gl2.RGBA16F, glCtx.RGBA, halfFloatTexType)
      formatRG = getSupportedFormat(glCtx, gl2.RG16F, gl2.RG, halfFloatTexType)
      formatR = getSupportedFormat(glCtx, gl2.R16F, gl2.RED, halfFloatTexType)
    } else {
      formatRGBA = getSupportedFormat(glCtx, glCtx.RGBA, glCtx.RGBA, halfFloatTexType)
      formatRG = getSupportedFormat(glCtx, glCtx.RGBA, glCtx.RGBA, halfFloatTexType)
      formatR = getSupportedFormat(glCtx, glCtx.RGBA, glCtx.RGBA, halfFloatTexType)
    }
    return {
      gl: glCtx,
      ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering },
    }
  }

  function getSupportedFormat(
    glCtx: WebGLRenderingContext,
    internalFormat: number,
    format: number,
    type: number,
  ): TextureFormat | null {
    if (!supportRenderTextureFormat(glCtx, internalFormat, format, type)) {
      const gl2 = glCtx as unknown as WebGL2RenderingContext
      switch (internalFormat) {
        case gl2.R16F:
          return getSupportedFormat(glCtx, gl2.RG16F, gl2.RG, type)
        case gl2.RG16F:
          return getSupportedFormat(glCtx, gl2.RGBA16F, glCtx.RGBA, type)
        default:
          return null
      }
    }
    return { internalFormat, format }
  }

  function supportRenderTextureFormat(
    glCtx: WebGLRenderingContext,
    internalFormat: number,
    format: number,
    type: number,
  ): boolean {
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
    return status === glCtx.FRAMEBUFFER_COMPLETE
  }

  function getResolution(resolution: number): { width: number; height: number } {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio
    const min = Math.round(resolution)
    const max = Math.round(resolution * aspectRatio)
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min }
    else return { width: min, height: max }
  }

  const { ext } = getWebGLContext(gl)

  if (!ext.supportLinearFiltering) {
    config.DYE_RESOLUTION = 512
  }

  // --- Shader compilation ---

  function compileShader(type: number, source: string, keywords: string[] | null): WebGLShader {
    if (keywords != null) {
      source = keywords.map((k) => '#define ' + k + '\n').join('') + source
    }
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.trace(gl.getShaderInfoLog(shader))
    return shader
  }

  function createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.bindAttribLocation(program, 0, 'aPosition')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.trace(gl.getProgramInfoLog(program))
    return program
  }

  function getUniforms(program: WebGLProgram): Record<string, WebGLUniformLocation | null> {
    const uniforms: Record<string, WebGLUniformLocation | null> = {}
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i)!
      uniforms[info.name] = gl.getUniformLocation(program, info.name)
    }
    return uniforms
  }

  function makeProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): GLProgram {
    const program = createProgram(vertexShader, fragmentShader)
    const uniforms = getUniforms(program)
    return {
      uniforms,
      program,
      bind() {
        gl.useProgram(program)
      },
    }
  }

  // Compile all shaders
  const baseVertex = compileShader(gl.VERTEX_SHADER, baseVertexShader, ['baseVertex'])
  const splatFrag = compileShader(gl.FRAGMENT_SHADER, splatShader, ['splatFrag'])
  const displayFrag = compileShader(gl.FRAGMENT_SHADER, displayShader, ['displayFrag'])
  const curlFrag = compileShader(gl.FRAGMENT_SHADER, curlShader, ['curlFrag'])
  const vorticityFrag = compileShader(gl.FRAGMENT_SHADER, vorticityShader, ['vorticityFrag'])
  const divergenceFrag = compileShader(gl.FRAGMENT_SHADER, divergenceShader, ['divergenceFrag'])
  const clearFrag = compileShader(gl.FRAGMENT_SHADER, clearShader, ['clearFrag'])
  const pressureFrag = compileShader(gl.FRAGMENT_SHADER, pressureShader, ['pressureFrag'])
  const gradientFrag = compileShader(gl.FRAGMENT_SHADER, gradientShader, ['gradientFrag'])
  const advectionFrag = compileShader(
    gl.FRAGMENT_SHADER,
    advectionShader,
    ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'],
  )

  const splatProgram = makeProgram(baseVertex, splatFrag)
  const displayProgram = makeProgram(baseVertex, displayFrag)
  const curlProgram = makeProgram(baseVertex, curlFrag)
  const vorticityProgram = makeProgram(baseVertex, vorticityFrag)
  const divergenceProgram = makeProgram(baseVertex, divergenceFrag)
  const clearProgram = makeProgram(baseVertex, clearFrag)
  const pressureProgram = makeProgram(baseVertex, pressureFrag)
  const gradientSubtractProgram = makeProgram(baseVertex, gradientFrag)
  const advectionProgram = makeProgram(baseVertex, advectionFrag)

  // --- Fullscreen blit ---

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
      const currentProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null
      if (currentProgram) {
        const loc = gl.getUniformLocation(currentProgram, 'texelSize')
        if (loc) gl.uniform2f(loc, texelX, texelY)
      }

      if (clear) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
    }
  })()

  // --- FBO helpers ---

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

  function createDoubleFBO(params: CreateFBOParams): DoubleFBO {
    let fbo1 = createFBO(params)
    let fbo2 = createFBO(params)
    return {
      width: params.w,
      height: params.h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() {
        return fbo1
      },
      set read(value) {
        fbo1 = value
      },
      get write() {
        return fbo2
      },
      set write(value) {
        fbo2 = value
      },
      swap() {
        const temp = fbo1
        fbo1 = fbo2
        fbo2 = temp
      },
    }
  }

  // --- Framebuffers ---

  let dye: DoubleFBO
  let velocity: DoubleFBO
  let curl: FBO
  let divergence: FBO
  let pressure: DoubleFBO

  function initFramebuffers() {
    const simRes = getResolution(config.SIM_RESOLUTION)
    const dyeRes = getResolution(config.DYE_RESOLUTION)
    const texType = ext.halfFloatTexType
    const rgba = ext.formatRGBA!
    const rg = ext.formatRG!
    const r = ext.formatR!
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST
    gl.disable(gl.BLEND)

    if (dye == null)
      dye = createDoubleFBO({
        w: dyeRes.width,
        h: dyeRes.height,
        internalFormat: rgba.internalFormat,
        format: rgba.format,
        type: texType,
        filtering,
      })
    if (velocity == null)
      velocity = createDoubleFBO({
        w: simRes.width,
        h: simRes.height,
        internalFormat: rg.internalFormat,
        format: rg.format,
        type: texType,
        filtering,
      })
    if (curl == null)
      curl = createFBO({
        w: simRes.width,
        h: simRes.height,
        internalFormat: r.internalFormat,
        format: r.format,
        type: texType,
        filtering: gl.NEAREST,
      })
    if (divergence == null)
      divergence = createFBO({
        w: simRes.width,
        h: simRes.height,
        internalFormat: r.internalFormat,
        format: r.format,
        type: texType,
        filtering: gl.NEAREST,
      })
    if (pressure == null)
      pressure = createDoubleFBO({
        w: simRes.width,
        h: simRes.height,
        internalFormat: r.internalFormat,
        format: r.format,
        type: texType,
        filtering: gl.NEAREST,
      })
  }

  // --- Simulation ---

  /**
   * Inject a splat into the velocity and dye fields.
   * Three GPU passes: radial push (optional), directional velocity, milk mask deposit.
   */
  function splat(params: SplatParams) {
    const { x, y, dx, dy, color, radiusPct, radialForce } = params
    const radius = (radiusPct !== undefined ? radiusPct : config.SPLAT_RADIUS) / 10000.0

    splatProgram.bind()
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0))
    gl.uniform1f(splatProgram.uniforms.aspectRatio, gl.drawingBufferWidth / gl.drawingBufferHeight)
    gl.uniform2f(splatProgram.uniforms.point, x, y)
    gl.uniform1f(splatProgram.uniforms.uMaskMode, 0.0)

    const len = Math.sqrt(dx * dx + dy * dy)
    const pourDirX = len > 0.0001 ? dx / len : 0.0
    const pourDirY = len > 0.0001 ? dy / len : -1.0
    gl.uniform2f(splatProgram.uniforms.uPourDir, pourDirX, pourDirY)

    // Pass 1: radial outward displacement (oval kernel)
    if (radialForce != null && radialForce > 0) {
      gl.uniform3f(splatProgram.uniforms.color, radialForce, 0.0, 0.0)
      gl.uniform1f(splatProgram.uniforms.radius, radius * 8.0)
      gl.uniform1f(splatProgram.uniforms.uRadialMode, 1.0)
      blit(velocity.write)
      velocity.swap()
    }

    // Pass 2: directional stream momentum
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0)
    gl.uniform1f(splatProgram.uniforms.radius, radius)
    gl.uniform1f(splatProgram.uniforms.uRadialMode, 0.0)
    blit(velocity.write)
    velocity.swap()

    // Pass 3: milk mask deposit (saturating blend)
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0))
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b)
    gl.uniform1f(splatProgram.uniforms.uMaskMode, 1.0)
    blit(dye.write)
    dye.swap()
  }

  /** Drain pending splats from the queue, adaptively capped per frame for performance. */
  function applyInputs() {
    const qlen = splatStackRef.current?.length ?? 0
    const maxSplatsPerFrame = Math.min(8, Math.max(2, Math.ceil(qlen / 4)))
    let processed = 0
    while ((splatStackRef.current?.length ?? 0) > 0 && processed < maxSplatsPerFrame) {
      const s = splatStackRef.current!.shift()!
      const radiusPct = config.SPLAT_RADIUS + Math.min(2.8, s.elapsedTime * 2.2)
      const speed = Math.sqrt(s.dx * s.dx + s.dy * s.dy)
      const radialForce = speed * config.RADIAL_PUSH
      splat({ x: s.x, y: s.y, dx: s.dx, dy: s.dy, color: config.MILK_COLOR, radiusPct, radialForce })
      processed++
    }
  }

  /** Render the display shader: composites dye over espresso with lighting. */
  function drawDisplay(target: FBO | null) {
    displayProgram.bind()
    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0))
    gl.uniform3f(
      displayProgram.uniforms.uEspresso,
      config.ESPRESSO_COLOR.r,
      config.ESPRESSO_COLOR.g,
      config.ESPRESSO_COLOR.b,
    )
    gl.uniform3f(displayProgram.uniforms.uMilk, config.MILK_COLOR.r, config.MILK_COLOR.g, config.MILK_COLOR.b)
    gl.uniform1f(displayProgram.uniforms.uMilkOpacity, config.MILK_OPACITY)
    gl.uniform1f(displayProgram.uniforms.uValleyStrength, config.VALLEY_STRENGTH)
    gl.uniform1f(displayProgram.uniforms.uCremaStrength, config.CREMA_STRENGTH)
    gl.uniform1f(displayProgram.uniforms.uMilkSpecular, config.MILK_SPECULAR)
    gl.uniform1f(displayProgram.uniforms.uSpecularPower, config.SPECULAR_POWER)
    gl.uniform1f(displayProgram.uniforms.uMaskHarden, config.MASK_HARDEN)
    gl.uniform1f(displayProgram.uniforms.uFoamAbsorption, config.FOAM_ABSORPTION)
    gl.uniform1f(displayProgram.uniforms.uSpecularClamp, config.SPECULAR_CLAMP)
    blit(target)
  }

  /** Execute one full simulation step: curl → vorticity → divergence → pressure → gradient → advection. */
  function step(dt: number) {
    gl.disable(gl.BLEND)

    if (config.CURL !== 0) {
      curlProgram.bind()
      gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0))
      blit(curl)

      vorticityProgram.bind()
      gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0))
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1))
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL)
      gl.uniform1f(vorticityProgram.uniforms.dt, dt)
      blit(velocity.write)
      velocity.swap()
    }

    divergenceProgram.bind()
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0))
    blit(divergence)

    clearProgram.bind()
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0))
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE)
    blit(pressure.write)
    pressure.swap()

    pressureProgram.bind()
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0))
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1))
      blit(pressure.write)
      pressure.swap()
    }

    gradientSubtractProgram.bind()
    gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0))
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1))
    blit(velocity.write)
    velocity.swap()

    // Advect velocity
    advectionProgram.bind()
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    if (!ext.supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY)
    const velocityId = velocity.read.attach(0)
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId)
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId)
    gl.uniform1f(advectionProgram.uniforms.dt, dt)
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION)
    blit(velocity.write)
    velocity.swap()

    // Advect dye (milk mask)
    if (!ext.supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY)
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1))
    gl.uniform1f(advectionProgram.uniforms.dt, dt)
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION)
    blit(dye.write)
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
