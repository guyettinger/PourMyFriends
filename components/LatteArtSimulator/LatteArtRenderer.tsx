import React, { useEffect, useState } from 'react'
import {
  Canvas,
  Group,
  Image,
  useCanvasRef,
  SkImage,
  Skia,
  Circle,
  Paint,
  AlphaType,
  ColorType,
} from '@shopify/react-native-skia'
import { LatteScene } from './LatteScene'

interface LatteArtRendererProps {
  scene: LatteScene
  width: number
  height: number
}

/**
 * Colors used for rendering the latte art
 */
const espresso = [76, 47, 38, 255] // Dark brown for espresso
const chocolate = [56, 30, 17, 255] // Darker brown for chocolate
const cupColor = '#08aab2' // Turquoise for cup

/**
 * Component that renders the latte art simulation using react-native-skia
 */
export const LatteArtRenderer: React.FC<LatteArtRendererProps> = ({ scene, width, height }) => {
  // Reference to the canvas for creating images
  const canvasRef = useCanvasRef()

  // State to hold the current image
  const [currentImage, setCurrentImage] = useState<SkImage | null>(null)

  // Function to generate image from fluid simulation data
  const generateImage = () => {
    // Skip if no canvas reference
    if (!canvasRef.current) return null

    // Get fluid simulation data
    const f = scene.fluid
    const n = f.numY

    // Create a bitmap for the fluid simulation
    const imageInfo = {
      width: f.numX,
      height: f.numY,
      alphaType: AlphaType.Unpremul,
      colorType: ColorType.RGBA_8888,
    }

    // Create pixel data array
    const pixelData = new Uint8Array(f.numX * f.numY * 4)

    // Calculate cup radius squared
    const cupRadius = scene.latteCupRadius / f.h
    const centerX = Math.floor(f.numX / 2)
    const centerY = Math.floor(f.numY / 2)
    const cupSquared = cupRadius * cupRadius

    // Fill pixel data
    for (let i = 0; i < f.numX; i++) {
      for (let j = 0; j < f.numY; j++) {
        const idx = (i * f.numY + j) * 4

        // Check if inside cup
        const dx = i - centerX
        const dy = j - centerY
        const isOutsideCup = dx * dx + dy * dy > cupSquared

        if (isOutsideCup) {
          // Cup color
          pixelData[idx] = 8 // R
          pixelData[idx + 1] = 170 // G
          pixelData[idx + 2] = 178 // B
          pixelData[idx + 3] = 255 // A
        } else {
          // Get smoke density (milk)
          const s = f.m[i * n + j]

          // Blend espresso with white based on milk density
          const contrast = 2.8
          const lightness = (s - 0.5) * contrast + 0.5
          const color = blendWhite(espresso, Math.max(0, Math.min(1, lightness)))

          // Add chocolate if present
          const c = f.c[i * n + j]
          if (c > 0.0) {
            const finalColor = blendColors(chocolate, color, Math.max(0, Math.min(1, c)))
            pixelData[idx] = finalColor[0] // R
            pixelData[idx + 1] = finalColor[1] // G
            pixelData[idx + 2] = finalColor[2] // B
            pixelData[idx + 3] = 255 // A
          } else {
            pixelData[idx] = color[0] // R
            pixelData[idx + 1] = color[1] // G
            pixelData[idx + 2] = color[2] // B
            pixelData[idx + 3] = 255 // A
          }
        }
      }
    }

    // Create Skia image from pixel data
    const pixels = Skia.Data.fromBytes(pixelData)
    return Skia.Image.MakeImage(imageInfo, pixels, imageInfo.width * 4)
  }

  // Animation loop
  useEffect(() => {
    let animationFrame: number

    const animate = () => {
      // Simulate one step of the fluid
      if (!scene.paused) {
        scene.fluid.simulate(scene, scene.dt)

        // Increment frame counter for milk tool
        if (scene.tool === 'Milk' && scene.frameNr > 0) {
          scene.frameNr++
        }

        // Generate new image from fluid simulation
        const newImage = generateImage()
        if (newImage) {
          setCurrentImage(newImage)
        }
      }

      // Continue animation loop
      animationFrame = requestAnimationFrame(animate)
    }

    // Start animation loop
    animationFrame = requestAnimationFrame(animate)

    // Clean up animation loop
    return () => cancelAnimationFrame(animationFrame)
  }, [scene])

  return (
    <Canvas ref={canvasRef} style={{ width, height }}>
      <Group>
        {/* Render the fluid simulation */}
        {currentImage && (
          <Image image={currentImage} x={0} y={0} width={width} height={height} fit="contain" />
        )}

        {/* Render cup outline */}
        <Circle cx={width / 2} cy={height / 2} r={scene.latteCupRadius * Math.min(width, height)} style="stroke">
          <Paint color="white" strokeWidth={2} />
        </Circle>
      </Group>
    </Canvas>
  )
}

/**
 * Blend two colors together
 */
function blendColors(color1: number[], color2: number[], t: number): number[] {
  return [
    Math.round(color1[0] * (1 - t) + color2[0] * t),
    Math.round(color1[1] * (1 - t) + color2[1] * t),
    Math.round(color1[2] * (1 - t) + color2[2] * t),
    255,
  ]
}

/**
 * Blend a color with white
 */
function blendWhite(color: number[], t: number): number[] {
  return blendColors(color, [255, 255, 255, 255], t)
}
