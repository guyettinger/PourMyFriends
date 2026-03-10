import React, { useEffect, useRef, useState } from 'react'
import { View, Dimensions, PanResponder, Modal, TouchableOpacity, Text as RNText, ScrollView, Platform } from 'react-native'
import { GLView } from 'expo-gl'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/*
Latte Art Rosetta Simulator (Expo + WebGL)

Overview
- Simulates a simplified 2D fluid field (velocity/pressure) and a dye buffer representing frothed milk.
- The user pours by touching/draging; we inject velocity and deposit a milk mask via splats.
- A display shader composites milk over espresso, revealing espresso in “valleys” (thin milk) with subtle lighting and crema noise.

Goals
- Realistic layered look (milk/espresso separation) without heavy compute cost.
- Stable, responsive pouring interactions and smooth edges (reduced pixelation).
- Portable WebGL pipeline (ES 2.0 compatible) for Expo/React Native.

Pipeline
1) Velocity update: curl -> vorticity confinement -> divergence -> pressure solve -> gradient subtract -> advection.
2) Dye (milk) advection by the velocity field; dye has zero dissipation (milk persists).
3) Display: tent-filter the milk mask, estimate valleys using a Laplacian, thin milk in valleys, add gentle specular and crema modulation.

Notes on sharpness vs realism
- Pixelation often comes from aggressive valley reveal thresholds and hard masks.
- We use a small tent blur and a softened valley threshold (k) to reduce blockiness while keeping crisp rosetta edges.
*/

const SCREEN_WIDTH = Dimensions.get('screen').width
const SCREEN_HEIGHT = Dimensions.get('screen').height

// Configuration for Latte Art Simulator (espresso + frothed milk)
// Global configuration for the latte art simulator.
// Adjust these to balance realism, sharpness, and performance.
const config = {
  SIM_RESOLUTION: 256,
  DYE_RESOLUTION: 512,
  CAPTURE_RESOLUTION: 1024,

  // Fluid tuning
  DENSITY_DISSIPATION: 0, // milk shouldn't fade
  VELOCITY_DISSIPATION: 1, // thicker flow
  PRESSURE: 1,
  PRESSURE_ITERATIONS: 10, // 10 iterations: good incompressibility without heavy GPU cost
  CURL: 0, // gentle roll for leaf edges

  // Pour tuning (percent of screen width/height in splat())
  SPLAT_RADIUS: 1.2, // ~1.2% starting radius; widened over time in applyInputs()
  SPLAT_FORCE: 200,
  RADIAL_PUSH: 3.0,    // froth displacement intensity; scales with pour velocity
  FOAM_ABSORPTION: 1.0, // Beer-Lambert absorption coefficient; higher = foam turns opaque faster
                    // VELOCITY_DISSIPATION is the surface-tension settling speed

  // Latte-art specifics
  TRANSPARENT: false,
  MASK_HARDEN: 0.40, // sharpen milk-espresso boundary; 0 = soft linear, 1 = crisp
  MILK_SPECULAR: 0.28, // subtle highlight on milk foam
  SPECULAR_POWER: 48.0, // shininess for spec term
  SPECULAR_CLAMP: 0.48, // clamp spec contribution to avoid white jaggies
  MILK_OPACITY: 1.0, // allow a hint of espresso to bleed through thin milk
  CREMA_STRENGTH: 0.08, // granular crema texture on espresso surface
  ESPRESSO_COLOR: { r: 0.14, g: 0.055, b: 0.014 }, // deep espresso brown (dark in linear = rich on screen)
  MILK_COLOR: { r: 1.0, g: 0.98, b: 0.96 },         // bright neutral white foam
  VALLEY_STRENGTH: 0.90, // espresso shows through thin milk (key for latte art lines)
  PAUSED: false,

}

// Settings exposed in the HUD modal
type SimSettings = {
  SPLAT_RADIUS: number
  SPLAT_FORCE: number
  VELOCITY_DISSIPATION: number
  CURL: number
  VALLEY_STRENGTH: number
  MASK_HARDEN: number
  RADIAL_PUSH: number
  FOAM_ABSORPTION: number
  CREMA_STRENGTH: number
  MILK_OPACITY: number
  MILK_SPECULAR: number
  SPECULAR_POWER: number
}

const SETTING_DEFS: { label: string; key: keyof SimSettings; min: number; max: number; step: number }[] = [
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

// Shaders
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

// Display: composite milk mask over espresso with gentle lighting
// Anti-pixelation measures:
// - 3x3 tent blur of the milk mask to reduce blockiness without losing edge definition
// - Resolution-scaled valley threshold (k) for stable reveal across devices
// - Specular clamped and gated by mask to avoid bright jaggies along seams
const displayShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uTexture; // dye as milk mask (use R)
uniform vec3 uEspresso;
uniform vec3 uMilk;
uniform float uMilkOpacity;
uniform vec2 texelSize;
uniform float uValleyStrength;
uniform float uCremaStrength;
uniform float uMilkSpecular;
uniform float uSpecularPower;
uniform float uMaskHarden;     // 0 = soft linear blend, 1 = crisp smoothstep boundary
uniform float uFoamAbsorption; // Beer-Lambert k: opacity = 1 - exp(-k * thickness)
uniform float uSpecularClamp;  // clamp spec contribution to avoid white jaggies

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main () {
  // 4-neighbor
  float m  = texture2D(uTexture, vUv).r;
  float ml = texture2D(uTexture, vL).r;
  float mr = texture2D(uTexture, vR).r;
  float mt = texture2D(uTexture, vT).r;
  float mb = texture2D(uTexture, vB).r;

  // Diagonals (computed using texelSize to avoid extra varyings)
  vec2 d = texelSize;
  float mtl = texture2D(uTexture, vUv + vec2(-d.x,  d.y)).r;
  float mtr = texture2D(uTexture, vUv + vec2( d.x,  d.y)).r;
  float mbl = texture2D(uTexture, vUv + vec2(-d.x, -d.y)).r;
  float mbr = texture2D(uTexture, vUv + vec2( d.x, -d.y)).r;

  // 3x3 tent blur (low-pass) to reduce pixelation
  float edges = ml + mr + mt + mb;
  float corners = mtl + mtr + mbl + mbr;
  float mBlur = (4.0*m + 2.0*edges + corners) / 16.0;

  // Valley: Laplacian of raw mask (positive at local minima = thin milk pits)
  float laplacian = ml + mr + mt + mb - 4.0 * m;
  float valleyScale = 10.0 / (length(texelSize) * 512.0);
  float valley = clamp(laplacian * uValleyStrength * valleyScale, 0.0, 1.0);
  float mask = mBlur;

  // Beer-Lambert: foam as a scattering medium where opacity = 1 - exp(-k * thickness).
  // Thin foam (low mBlur) is genuinely translucent; thick foam is opaque. This maps
  // the linear mask value onto a physically-based opacity before the smoothstep sharpener.
  float physAlpha = 1.0 - exp(-uFoamAbsorption * mBlur);

  // Sharpen the milk-espresso boundary on top of the physical curve.
  // uMaskHarden=0: lo=0.0/hi=1.0 (linear, soft). uMaskHarden=1: lo=0.3/hi=0.65 (crisp).
  float lo = mix(0.0, 0.3, uMaskHarden);
  float hi = mix(1.0, 0.65, uMaskHarden);
  float mEdge = smoothstep(lo, hi, physAlpha);
  float maskAlpha = clamp((mEdge - valley * 0.5) * uMilkOpacity, 0.0, 1.0);

  // Lighting from gradient of blurred mask
  float dx = mr - ml;
  float dy = mt - mb;
  vec3 n = normalize(vec3(dx, dy, 0.15));
  vec3 lightDir = normalize(vec3(0.2, 0.3, 1.0));
  float diff = clamp(dot(n, lightDir), 0.0, 1.0);

  // Crema noise on espresso
  float crema = 1.0 - uCremaStrength * hash21(floor(vUv * 256.0));
  vec3 espresso = uEspresso * crema;

  // Milk shading with specular highlight (gated by maskAlpha, not raw mask)
  float spec = pow(max(n.z, 0.0), uSpecularPower) * uMilkSpecular * maskAlpha;
  spec = min(spec, uSpecularClamp);
  vec3 warmSpec = spec * vec3(1.0, 0.97, 0.92);
  vec3 milkCol = uMilk * (0.8 + 0.2 * diff) + warmSpec;
  vec3 c = mix(espresso, clamp(milkCol, 0.0, 1.0), maskAlpha);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`


// Splat: supports velocity (add) and milk mask (saturate) modes, with optional radial outward velocity
const splatShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
uniform float uMaskMode;   // 0.0 = additive velocity, 1.0 = saturating dye
uniform float uRadialMode; // 0.0 = directional [dx,dy], 1.0 = radial outward (oval)
uniform vec2 uPourDir;     // normalized pour direction in UV space (for oval anisotropy)

void main () {
  vec2 p_raw = vUv - point.xy;
  vec2 p = vec2(p_raw.x * aspectRatio, p_raw.y);
  float dist2 = dot(p, p);

  // Isotropic Gaussian — used for directional and dye passes
  float s_iso = exp(-dist2 / radius);

  // Anisotropic Gaussian — oval elongated along pour direction for radial pass.
  // Decompose p into parallel (pour axis) and perpendicular components, then
  // apply a tighter radius perpendicular (0.25x) so the kernel is ~2x longer
  // along the pour than across it.
  vec2 pourDirAC = normalize(vec2(uPourDir.x * aspectRatio, uPourDir.y));
  float pPar = dot(p, pourDirAC);
  vec2 pPerpVec = p - pPar * pourDirAC;
  float pPerp2 = dot(pPerpVec, pPerpVec);
  float s_aniso = exp(-(pPar * pPar / radius + pPerp2 / (radius * 0.25)));

  // Select kernel: isotropic (uRadialMode=0) or oval (uRadialMode=1)
  float s = mix(s_iso, s_aniso, uRadialMode);

  // Radial outward unit vector (aspect-corrected space -> back to UV space)
  vec2 outward = p / (sqrt(dist2) + 0.0001);
  vec2 radialVel = vec2(outward.x / aspectRatio, outward.y) * color.r;

  // Blend: directional (uRadialMode=0) or radial outward (uRadialMode=1)
  vec2 vel = mix(color.xy, radialVel, uRadialMode);

  // Content: velocity (uMaskMode=0) or raw dye color (uMaskMode=1)
  vec3 splatContent = mix(vec3(vel, 0.0), color, uMaskMode);
  vec3 splat = splatContent * s;

  vec3 base = texture2D(uTarget, vUv).xyz;
  vec3 result = mix(base + splat, max(base, splat), step(0.5, uMaskMode));
  gl_FragColor = vec4(result, 1.0);
}
`


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

export const RosettaScreen = () => {
  const touchingRef = useRef(false)
  const lastTouchRef = useRef({ x: 0, y: 0 })
  const splatStackRef = useRef<any[]>([])
  const touchPressureRef = useRef(0)
  const pourIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pourStartTimeRef = useRef(0)
  // Timestamp of the last move event — used to suppress the stationary interval
  // while the finger is actively dragging.
  const lastMoveTimeRef = useRef(0)
  // Cancellation handle for the active RAF loop — called before a new context starts
  // so the old loop stops rather than continuing to run against a destroyed GL context.
  const cancelSimRef = useRef<(() => void) | null>(null)

  // Simulation key: incrementing forces GLView to remount (full WebGL context reset)
  const [simKey, setSimKey] = useState(0)
  // Settings modal visibility
  const [settingsVisible, setSettingsVisible] = useState(false)
  // Local copy of adjustable config values for UI display
  const [settings, setSettings] = useState<SimSettings>({ ...DEFAULT_SETTINGS })

  const insets = useSafeAreaInsets()

  // Adjust a setting: updates local state and mutates config so simulation picks it up immediately
  const adjustSetting = (key: keyof SimSettings, delta: number, min: number, max: number) => {
    setSettings((prev) => {
      const next = Math.round((prev[key] + delta) * 1000) / 1000
      const clamped = Math.max(min, Math.min(max, next))
      ;(config as any)[key] = clamped
      return { ...prev, [key]: clamped }
    })
  }

  const resetSettings = () => {
    setSettings({ ...DEFAULT_SETTINGS })
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SimSettings)[]) {
      ;(config as any)[key] = DEFAULT_SETTINGS[key]
    }
  }

  // Stationary drip: fires on interval only when the finger is held still.
  // Suppressed automatically when onPanResponderMove is firing (lastMoveTimeRef
  // is updated each move event; if it was recent, we skip the interval tick).
  const startContinuousPouring = () => {
    if (pourIntervalRef.current) return
    pourStartTimeRef.current = Date.now()
    pourIntervalRef.current = setInterval(() => {
      if (!touchingRef.current) return
      // Skip if a move event fired within the last 32 ms (two interval ticks) —
      // onPanResponderMove is already generating splats with motion velocity.
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

  const stopContinuousPouring = () => {
    if (pourIntervalRef.current) {
      clearInterval(pourIntervalRef.current)
      pourIntervalRef.current = null
    }
  }

  // Memoize PanResponder so it's created once, reading config inline
  const panResponderRef = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: (evt) => {
      touchingRef.current = true
      const x = evt.nativeEvent.locationX / SCREEN_WIDTH
      const y = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
      lastTouchRef.current = { x, y }
      const pressure = (evt.nativeEvent as any).force || 1.0
      touchPressureRef.current = Math.max(0.1, Math.min(1.0, pressure))
      startContinuousPouring()
    },
    onPanResponderMove: (evt) => {
      if (!touchingRef.current) return
      lastMoveTimeRef.current = Date.now()

      const newX = evt.nativeEvent.locationX / SCREEN_WIDTH
      const newY = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT
      const pressure = (evt.nativeEvent as any).force || 1.0
      const p = Math.max(0.1, Math.min(1.0, pressure))
      touchPressureRef.current = p

      const prev = { ...lastTouchRef.current }
      const ddx = newX - prev.x
      const ddy = newY - prev.y
      const dist = Math.sqrt(ddx * ddx + ddy * ddy)

      // Read BASE_VELOCITY from config inline so it tracks SPLAT_FORCE changes
      const baseVel = config.SPLAT_FORCE / 25
      const speed = Math.max(baseVel, dist * config.SPLAT_FORCE * 0.5)
      const vx = dist > 0 ? (ddx / dist) * speed * p : 0
      const vy = dist > 0 ? (ddy / dist) * speed * p : -baseVel * p

      // Interpolate along the movement path so there are no gaps in the stream.
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
  }))

  // Cleanup: stop interval and cancel RAF loop on unmount
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
          // Cancel any previous animation loop before this new context starts.
          if (cancelSimRef.current) {
            cancelSimRef.current()
            cancelSimRef.current = null
          }
          // Discard splats queued for the old session so they don't bleed into the reset.
          splatStackRef.current = []
          onContextCreate(gl, splatStackRef, cancelSimRef)
        }}
        {...panResponderRef.current.panHandlers}
      />

      {/* HUD overlay — box-none so the bar background passes touches to GLView */}
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
          <RNText style={{ color: 'white', fontSize: 17, fontFamily: 'SF-Pro-Display-Bold' }}>
            Rosetta
          </RNText>
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
          {/* Header */}
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
            <RNText
              style={{ flex: 1, color: 'white', fontSize: 18, fontFamily: 'SF-Pro-Display-Bold' }}
            >
              Simulation Settings
            </RNText>
            <TouchableOpacity onPress={() => setSettingsVisible(false)} style={{ padding: 4 }}>
              <RNText style={{ color: '#A0896B', fontSize: 16 }}>Done</RNText>
            </TouchableOpacity>
          </View>
          {/* Setting rows */}
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
                  <RNText
                    style={{ color: 'white', fontSize: 15, width: 56, textAlign: 'center' }}
                  >
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

function onContextCreate(
  gl: WebGLRenderingContext,
  splatStackRef: React.MutableRefObject<any[]>,
  cancelSimRef: React.MutableRefObject<(() => void) | null>,
) {
  // Utilities
  function getWebGLContext(gl: any) {
    const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
    let halfFloat: any
    let supportLinearFiltering: any
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float')
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear')
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float')
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear')
    }
    const halfFloatTexType = isWebGL2 ? (gl as any).HALF_FLOAT : (halfFloat as any).HALF_FLOAT_OES
    let formatRGBA: any
    let formatRG: any
    let formatR: any
    if (isWebGL2) {
      formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType)
      formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType)
      formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType)
    } else {
      formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType)
      formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType)
      formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType)
    }
    return {
      gl,
      ext: {
        formatRGBA,
        formatRG,
        formatR,
        halfFloatTexType,
        supportLinearFiltering,
      },
    }
  }

  function getSupportedFormat(gl: any, internalFormat: number, format: number, type: number) {
    if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
      switch (internalFormat) {
        case (gl as any).R16F:
          return getSupportedFormat(gl, (gl as any).RG16F, (gl as any).RG, type)
        case (gl as any).RG16F:
          return getSupportedFormat(gl, (gl as any).RGBA16F, (gl as any).RGBA, type)
        default:
          return null
      }
    }
    return { internalFormat, format }
  }

  function supportRenderTextureFormat(gl: any, internalFormat: number, format: number, type: number) {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    return status === gl.FRAMEBUFFER_COMPLETE
  }

  function getResolution(gl: any, resolution: number) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio
    const min = Math.round(resolution)
    const max = Math.round(resolution * aspectRatio)
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min }
    else return { width: min, height: max }
  }

  const { gl: glContext, ext } = getWebGLContext(gl)

  if (!ext.supportLinearFiltering) {
    config.DYE_RESOLUTION = 512
  }

  // Shader compile/link helpers
  function compileShader(type: number, source: string, keywords: string[] | null) {
    source = addKeywords(source, keywords)
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.trace(gl.getShaderInfoLog(shader))
    return shader
  }

  function addKeywords(source: string, keywords: string[] | null) {
    if (keywords == null) return source
    let keywordsString = ''
    keywords.forEach((k) => {
      keywordsString += '#define ' + k + '\n'
    })
    return keywordsString + source
  }

  function createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    // Bind attribute 0 to aPosition for safety in some drivers
    gl.bindAttribLocation(program, 0, 'aPosition')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.trace(gl.getProgramInfoLog(program))
    return program
  }

  function getUniforms(program: WebGLProgram) {
    const uniforms: any = []
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i)!
      const name = info.name
      uniforms[name] = gl.getUniformLocation(program, name)
    }
    return uniforms
  }

  class Program {
    uniforms: any
    program: WebGLProgram
    constructor(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
      this.uniforms = {}
      this.program = createProgram(vertexShader, fragmentShader)
      this.uniforms = getUniforms(this.program)
    }
    bind() {
      gl.useProgram(this.program)
    }
  }

  // Compile shaders
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

  // Create programs
  const splatProgram = new Program(baseVertex, splatFrag)
  const displayProgram = new Program(baseVertex, displayFrag)
  const curlProgram = new Program(baseVertex, curlFrag)
  const vorticityProgram = new Program(baseVertex, vorticityFrag)
  const divergenceProgram = new Program(baseVertex, divergenceFrag)
  const clearProgram = new Program(baseVertex, clearFrag)
  const pressureProgram = new Program(baseVertex, pressureFrag)
  const gradientSubtractProgram = new Program(baseVertex, gradientFrag)
  const advectionProgram = new Program(baseVertex, advectionFrag)

  // Fullscreen triangle/quad blit
  const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(0)
    return (target: any, clear = false) => {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      } else {
        gl.viewport(0, 0, target.width, target.height)
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
      }
      // Provide texel size to vertex shader
      const texelX = target ? 1.0 / target.width : 1.0 / gl.drawingBufferWidth
      const texelY = target ? 1.0 / target.height : 1.0 / gl.drawingBufferHeight
      // Set on whichever program is currently bound (they all declare texelSize)
      const currentProgram: any = (gl as any).getParameter(gl.CURRENT_PROGRAM)
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

  // FBO helpers
  function createFBO(w: number, h: number, internalFormat: number, format: number, type: number, param: number) {
    gl.activeTexture(gl.TEXTURE0)
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const texelSizeX = 1.0 / w
    const texelSizeY = 1.0 / h
    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX,
      texelSizeY,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        return id
      },
    }
  }

  function createDoubleFBO(w: number, h: number, internalFormat: number, format: number, type: number, param: number) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param)
    let fbo2 = createFBO(w, h, internalFormat, format, type, param)
    return {
      width: w,
      height: h,
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

  // Framebuffers
  let dye: any
  let velocity: any
  let curl: any
  let divergence: any
  let pressure: any

  function initFramebuffers() {
    const simRes = getResolution(gl, config.SIM_RESOLUTION)
    const dyeRes = getResolution(gl, config.DYE_RESOLUTION)
    const texType = ext.halfFloatTexType
    const rgba = ext.formatRGBA
    const rg = ext.formatRG
    const r = ext.formatR
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST
    gl.disable(gl.BLEND)

    if (dye == null)
      dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering)

    if (velocity == null)
      velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering)
    // Always allocate the curl FBO so the CURL setting can be changed at runtime without crashing.
  if (curl == null)
    curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST)
    if (divergence == null)
      divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST)
    if (pressure == null)
      pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST)

  }

  // Simulation splat: injects momentum (additive) and deposits milk mask (saturating toward white).
  // - Velocity path keeps fluid motion lively.
  // - Milk mask uses a saturating blend to avoid transparent “holes” and maintain a creamy look.
  // - Optional radialForce injects a radial outward velocity pass before the directional pass.
  function splat(
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: { r: number; g: number; b: number },
    customRadiusPct?: number,
    radialForce?: number,
  ) {
    const radius = (customRadiusPct !== undefined ? customRadiusPct : config.SPLAT_RADIUS) / 10000.0

    splatProgram.bind()
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0))
    gl.uniform1f(splatProgram.uniforms.aspectRatio, gl.drawingBufferWidth / gl.drawingBufferHeight)
    gl.uniform2f(splatProgram.uniforms.point, x, y)
    gl.uniform1f(splatProgram.uniforms.uMaskMode, 0.0)

    // Normalized pour direction for oval anisotropy (fallback to downward if stationary)
    const len = Math.sqrt(dx * dx + dy * dy)
    const pourDirX = len > 0.0001 ? dx / len : 0.0
    const pourDirY = len > 0.0001 ? dy / len : -1.0
    gl.uniform2f(splatProgram.uniforms.uPourDir, pourDirX, pourDirY)

    // Pass 1 (radial): oval outward displacement zone; color.r = force magnitude
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

    // Pass 3: milk mask deposit (uMaskMode=1 → saturating; uRadialMode irrelevant here)
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0))
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b)
    gl.uniform1f(splatProgram.uniforms.uMaskMode, 1.0)
    blit(dye.write)
    dye.swap()
  }

  // Apply pending input splats from the queue.
  // This function keeps responsiveness high by adapting the number of processed
  // splats per frame to the current backlog, with an upper bound for performance.
  function applyInputs() {
    const qlen = splatStackRef.current?.length ?? 0
    // Adaptively process more when backlog builds, capped for perf
    const maxSplatsPerFrame = Math.min(8, Math.max(2, Math.ceil(qlen / 4)))
    let processed = 0
    while ((splatStackRef.current?.length ?? 0) > 0 && processed < maxSplatsPerFrame) {
      const s = splatStackRef.current.shift()
      // Wider contact patch over time to emulate a pitcher lowering toward the surface.
      // Starts at SPLAT_RADIUS (user-adjustable) and grows by up to 2.8% over the pour duration.
      const radiusPct = config.SPLAT_RADIUS + Math.min(2.8, s.elapsedTime * 2.2)
      const speed = Math.sqrt(s.dx * s.dx + s.dy * s.dy)
      const radialForce = speed * config.RADIAL_PUSH
      splat(s.x, s.y, s.dx, s.dy, config.MILK_COLOR, radiusPct, radialForce)
      processed++
    }
  }

  // Composite dye (milk mask) over espresso with lighting and valley-driven reveal.
  function drawDisplay(target: any) {
    displayProgram.bind()
    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0))
    // We'll rely on matching source/target sizes; blit sets texelSize for neighbors.
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



  function step(dt: number) {
    gl.disable(gl.BLEND)

    if (config.CURL !== 0) {
      // Curl
      curlProgram.bind()
      gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0))
      blit(curl)

      // Vorticity confinement
      vorticityProgram.bind()
      gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0))
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1))
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL)
      gl.uniform1f(vorticityProgram.uniforms.dt, dt)
      blit(velocity.write)
      velocity.swap()
    }

    // Divergence
    divergenceProgram.bind()
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0))
    blit(divergence)

    // Clear pressure
    clearProgram.bind()
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0))
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE)
    blit(pressure.write)
    pressure.swap()

    // Pressure solve
    pressureProgram.bind()
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0))
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1))
      blit(pressure.write)
      pressure.swap()
    }

    // Gradient subtract
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

    // Advection
    if (!ext.supportLinearFiltering)
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY)
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1))
    gl.uniform1f(advectionProgram.uniforms.dt, dt)
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION)
    blit(dye.write)
    dye.swap()
  }

  function render(target: any) {
    drawDisplay(target)
  }

  // Init
  initFramebuffers()

  let lastUpdateTime = Date.now()
  function calcDeltaTime() {
    const now = Date.now()
    let dt = (now - lastUpdateTime) / 1000
    dt = Math.min(dt, 0.033) // cap at ~30fps — allows real-time sim speed down to 30fps
    lastUpdateTime = now
    return dt
  }

  // Cancellation flag: set to true by cancelSimRef.current() when a new GL context
  // is created (GLView remounts after simKey increment). Stops the loop from
  // running against a destroyed context, preventing CPU/GPU resource leaks.
  let cancelled = false
  cancelSimRef.current = () => {
    cancelled = true
  }

  function update() {
    if (cancelled) return
    const dt = calcDeltaTime()
    applyInputs()
    if (!config.PAUSED) step(dt)
    render(null)
    try {
      ;(gl as any).endFrameEXP()
    } catch {
      // GL context was destroyed (GLView unmounted) — stop the loop gracefully.
      cancelled = true
      return
    }
    requestAnimationFrame(update)
  }

  update()
}
