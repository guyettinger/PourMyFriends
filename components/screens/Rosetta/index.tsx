import React, { useRef } from 'react'
import { View, Dimensions, PanResponder } from 'react-native'
import { GLView } from 'expo-gl'

const SCREEN_WIDTH = Dimensions.get('screen').width
const SCREEN_HEIGHT = Dimensions.get('screen').height

// Configuration for Latte Art Simulator (espresso + frothed milk)
const config = {
  SIM_RESOLUTION: 512,
  DYE_RESOLUTION: 1024,
  CAPTURE_RESOLUTION: 1024,

  // Fluid tuning
  DENSITY_DISSIPATION: 0, // milk shouldn't fade
  VELOCITY_DISSIPATION: 1, // thicker flow
  PRESSURE: 1,
  PRESSURE_ITERATIONS: 1, // better incompressibility for smoother motion
  CURL: 0, // gentle roll for leaf edges

  // Pour tuning (percent of screen width/height in splat())
  SPLAT_RADIUS: 1.2, // ~1.2% starting radius
  SPLAT_FORCE: 6000,

  // Latte-art specifics
  TRANSPARENT: false,
  MASK_HARDEN: 0.0, // sharpen mask in display compositing
  MILK_SPECULAR: 0.0, // subtle highlight on milk (reduced to avoid blowout)
  SPECULAR_POWER: 32.0, // shininess for spec term
  SPECULAR_CLAMP: 0.06, // clamp spec contribution to avoid white jaggies
  MILK_OPACITY: 0.85, // allow espresso to show through milk a bit
  CREMA_STRENGTH: 0.03, // subtle crema noise strength
  ESPRESSO_COLOR: { r: 0.1, g: 0.06, b: 0.04 },
  MILK_COLOR: { r: 1.0, g: 0.98, b: 0.95 },
  VALLEY_STRENGTH: 0.2, // how much valleys reveal espresso
  PAUSED: false,
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
uniform float uSpec;
uniform float uSpecPower;
uniform float uSpecClamp;
uniform float uMilkOpacity;
uniform float uCremaStrength;
uniform float uValleyStrength;
uniform float harden;
uniform vec2 texelSize;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
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

  // 8-neighbor Laplacian on blurred mask (positive => valley)
  float neighAvg = (edges + corners) / 8.0;
  float lap = neighAvg - mBlur;

  // Normalize and softly map to [0,1]; threshold scales with resolution
  float k = 0.75 * length(texelSize);   // larger k = smoother, less blocky
  float valley = smoothstep(0.0, k, max(0.0, lap));

  // Base mask (optionally hardened)
  float mask = mix(mBlur, smoothstep(0.0, 1.0, mBlur), harden);
  float maskAlpha = clamp(mask * uMilkOpacity, 0.0, 1.0);

  // Thin milk in valleys so espresso shows through
  maskAlpha *= (1.0 - uValleyStrength * valley);

  // Lighting from gradient of blurred mask
  float dx = mr - ml;
  float dy = mt - mb;
  vec3 n = normalize(vec3(dx, dy, length(texelSize)));
  vec3 lightDir = normalize(vec3(0.0, 0.0, 1.0));
  float diff = clamp(dot(n, lightDir), 0.0, 1.0);

  // Espresso with crema stronger where milk is thin
  float crema = 1.0 + (hash(vUv * 1024.0) * 2.0 - 1.0) * uCremaStrength * (1.0 - maskAlpha);
  vec3 espresso = uEspresso * crema;

  // Specular reduced in valleys to avoid white seams
  float specRaw = pow(max(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0), uSpecPower);
  float maskGate = smoothstep(0.3, 0.9, mask);
  float spec = min(specRaw * uSpec * maskGate, uSpecClamp) * (1.0 - valley);

  vec3 milkCol = uMilk * (0.8 + 0.2 * diff) + vec3(spec);
  vec3 c = mix(espresso, clamp(milkCol, 0.0, 1.0), maskAlpha);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

// Splat: supports velocity (add) and milk mask (saturate) modes
const splatShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
uniform float uMaskMode; // 0.0 => additive (velocity), 1.0 => saturating (milk mask)
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  float s = exp(-dot(p, p) / radius);
  vec3 splat = s * color;

  vec3 base = texture2D(uTarget, vUv).xyz;

  // For milk mask: saturate toward white; for velocity: additive
  vec3 result = mix(base + splat, max(base, splat), step(0.5, uMaskMode));
  gl_FragColor = vec4(result, 1.0);
}
`

const copyShader = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uTexture;
void main () {
  gl_FragColor = texture2D(uTexture, vUv);
}
`

const colorShader = `
precision mediump float;
uniform vec4 color;
void main () {
  gl_FragColor = color;
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

  // Optimized continuous pouring function with widening milk effect
  const startContinuousPouring = () => {
    if (pourIntervalRef.current) return // Already pouring
    pourStartTimeRef.current = Date.now()
    pourIntervalRef.current = setInterval(() => {
      if (touchingRef.current) {
        const baseVelocity = 5
        const pressure = touchPressureRef.current || 1.0
        const velocity = baseVelocity * pressure
        const elapsedTime = (Date.now() - pourStartTimeRef.current) / 1000
        splatStackRef.current.push({
          x: lastTouchRef.current.x,
          y: lastTouchRef.current.y,
          dx: 0,
          dy: -velocity, // upward flow
          pressure,
          elapsedTime,
        })
      }
    }, 15)
  }

  const stopContinuousPouring = () => {
    if (pourIntervalRef.current) {
      clearInterval(pourIntervalRef.current)
      pourIntervalRef.current = null
    }
  }

  const panResponder = PanResponder.create({
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
      if (touchingRef.current) {
        const newX = evt.nativeEvent.locationX / SCREEN_WIDTH
        const newY = 1.0 - evt.nativeEvent.locationY / SCREEN_HEIGHT

        // Interpolate along movement path to ensure continuous stream
        const prev = { ...lastTouchRef.current }
        const dx = newX - prev.x
        const dy = newY - prev.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const step = 0.005 // normalized UV step spacing
        const steps = Math.max(1, Math.min(25, Math.ceil(dist / step)))
        const pressure = (evt.nativeEvent as any).force || 1.0
        const p = pressure < 0.1 ? 0.1 : pressure > 1.0 ? 1.0 : pressure
        const baseVelocity = 5
        const vy = -baseVelocity * p

        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          splatStackRef.current.push({
            x: prev.x + dx * t,
            y: prev.y + dy * t,
            dx: 0,
            dy: vy,
            pressure: p,
            elapsedTime: (Date.now() - pourStartTimeRef.current) / 1000,
          })
        }

        lastTouchRef.current.x = newX
        lastTouchRef.current.y = newY
        touchPressureRef.current = p
      }
    },
    onPanResponderRelease: () => {
      touchingRef.current = false
      touchPressureRef.current = 0
      stopContinuousPouring()
    },
  })

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgb(25, 15, 8)' }}>
      <GLView
        style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
        onContextCreate={(gl) => onContextCreate(gl, splatStackRef)}
        {...panResponder.panHandlers}
      />
    </View>
  )
}

function onContextCreate(gl: WebGLRenderingContext, splatStackRef: React.MutableRefObject<any[]>) {
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

  function normalizeColor(input: { r: number; g: number; b: number }) {
    return {
      r: input.r / 255,
      g: input.g / 255,
      b: input.b / 255,
    }
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
  const copyFrag = compileShader(gl.FRAGMENT_SHADER, copyShader, ['copyFrag'])
  const colorFrag = compileShader(gl.FRAGMENT_SHADER, colorShader, ['colorFrag'])
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
  const copyProgram = new Program(baseVertex, copyFrag)
  const colorProgram = new Program(baseVertex, colorFrag)
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
  let dyeTemp1: any
  let dyeTemp2: any
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
    if (dyeTemp1 == null)
      dyeTemp1 = createFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering)
    if (dyeTemp2 == null)
      dyeTemp2 = createFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering)

    if (velocity == null)
      velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering)
    if (curl == null) curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST)
    if (divergence == null)
      divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST)
    if (pressure == null)
      pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST)
  }

  // Simulation splat: velocity (add) + milk mask (saturate)
  function splat(
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: { r: number; g: number; b: number },
    customRadiusPct?: number,
  ) {
    const radius = (customRadiusPct !== undefined ? customRadiusPct : config.SPLAT_RADIUS) / 10000.0

    // Inject velocity (additive)
    splatProgram.bind()
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0))
    gl.uniform1f(splatProgram.uniforms.aspectRatio, SCREEN_WIDTH / SCREEN_HEIGHT)
    gl.uniform2f(splatProgram.uniforms.point, x, y)
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0)
    gl.uniform1f(splatProgram.uniforms.radius, radius)
    gl.uniform1f(splatProgram.uniforms.uMaskMode, 0.0) // velocity path
    blit(velocity.write)
    velocity.swap()

    // Inject milk mask (saturating toward white)
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0))
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b)
    gl.uniform1f(splatProgram.uniforms.uMaskMode, 1.0) // mask path
    blit(dye.write)
    dye.swap()
  }

  function applyInputs() {
    const qlen = splatStackRef.current?.length ?? 0
    // Adaptively process more when backlog builds, capped for perf
    const maxSplatsPerFrame = Math.min(12, Math.max(2, Math.ceil(qlen / 4)))
    let processed = 0
    while ((splatStackRef.current?.length ?? 0) > 0 && processed < maxSplatsPerFrame) {
      const s = splatStackRef.current.shift()
      // Wider contact patch over time (about 1.2% -> 4%)
      const radiusPct = 1.2 + Math.min(2.8, s.elapsedTime * 2.2)
      splat(s.x, s.y, s.dx, s.dy, config.MILK_COLOR, radiusPct)
      processed++
    }
  }

  function drawColor(target: any, color: { r: number; g: number; b: number }) {
    colorProgram.bind()
    gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1)
    blit(target)
  }

  function drawDisplay(target: any) {
    displayProgram.bind()
    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0))
    gl.uniform2f(displayProgram.uniforms.texelSize, dye.texelSizeX, dye.texelSizeY)
    gl.uniform3f(
      displayProgram.uniforms.uEspresso,
      config.ESPRESSO_COLOR.r,
      config.ESPRESSO_COLOR.g,
      config.ESPRESSO_COLOR.b,
    )
    gl.uniform3f(displayProgram.uniforms.uMilk, config.MILK_COLOR.r, config.MILK_COLOR.g, config.MILK_COLOR.b)
    gl.uniform1f(displayProgram.uniforms.uSpec, config.MILK_SPECULAR)
    gl.uniform1f(displayProgram.uniforms.uSpecPower, config.SPECULAR_POWER)
    gl.uniform1f(displayProgram.uniforms.uSpecClamp, config.SPECULAR_CLAMP)
    gl.uniform1f(displayProgram.uniforms.uMilkOpacity, config.MILK_OPACITY)
    gl.uniform1f(displayProgram.uniforms.uCremaStrength, config.CREMA_STRENGTH)
    gl.uniform1f(displayProgram.uniforms.harden, config.MASK_HARDEN)
    gl.uniform1f(displayProgram.uniforms.uValleyStrength, config.VALLEY_STRENGTH)

    blit(target)
  }

  function step(dt: number) {
    gl.disable(gl.BLEND)

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
    if (!config.TRANSPARENT) drawColor(target, normalizeColor(config.ESPRESSO_COLOR))
    drawDisplay(target)
  }

  // Init
  initFramebuffers()

  let lastUpdateTime = Date.now()
  function calcDeltaTime() {
    const now = Date.now()
    let dt = (now - lastUpdateTime) / 1000
    dt = Math.min(dt, 0.016666) // cap at ~60fps
    lastUpdateTime = now
    return dt
  }

  function update() {
    const dt = calcDeltaTime()
    applyInputs()
    if (!config.PAUSED) step(dt)
    render(null)
    ;(gl as any).endFrameEXP()
    requestAnimationFrame(update)
  }

  update()
}
