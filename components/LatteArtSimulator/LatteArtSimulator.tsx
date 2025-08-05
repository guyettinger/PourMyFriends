import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, Text, Dimensions } from 'react-native'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import { LatteArtRenderer } from './LatteArtRenderer'
import { createLatteScene, LatteScene, LatteTool, setObstacle } from './LatteScene'
import { FluidPhysicsWorklet } from './FluidPhysicsWorklet'
import { 
  detectDeviceTier, 
  getRecommendedPreset, 
  PERFORMANCE_PRESETS, 
  createOptimizedLatteConfig,
  AdaptiveQualityManager,
  FrameRateLimiter,
  PerformanceMonitor,
  PerformancePreset,
  PerformanceConfig
} from './PerformanceConfig'
import Vec2 from './Vec2'

interface LatteArtSimulatorProps {
  width?: number
  height?: number
  performancePreset?: PerformancePreset
  enablePerformanceMonitoring?: boolean
  onPerformanceUpdate?: (fps: number, frameTime: number) => void
}

/**
 * Main component for the Latte Art Simulator
 */
export const LatteArtSimulator: React.FC<LatteArtSimulatorProps> = ({
  width = Dimensions.get('window').width,
  height = Dimensions.get('window').width,
  performancePreset,
  enablePerformanceMonitoring = false,
  onPerformanceUpdate,
}) => {
  // Detect device performance and set up configuration
  const deviceTier = useMemo(() => detectDeviceTier(), [])
  const recommendedPreset = useMemo(() => getRecommendedPreset(deviceTier), [deviceTier])
  const activePreset = performancePreset || recommendedPreset
  const performanceConfig = useMemo(() => PERFORMANCE_PRESETS[activePreset], [activePreset])

  // Performance monitoring setup
  const [qualityManager] = useState(() => new AdaptiveQualityManager(performanceConfig))
  const [frameRateLimiter] = useState(() => new FrameRateLimiter(performanceConfig.targetFPS))
  const [performanceMonitor] = useState(() => new PerformanceMonitor())
  const [currentPerformanceConfig, setCurrentPerformanceConfig] = useState(performanceConfig)

  // Create the optimized latte scene
  const [scene, setScene] = useState<LatteScene>(() => {
    const optimizedConfig = createOptimizedLatteConfig(currentPerformanceConfig)
    return createLatteScene(new Vec2(width, height), optimizedConfig)
  })

  // Track if the simulation is paused
  const [isPaused, setIsPaused] = useState(false)

  // Track the current tool
  const [currentTool, setCurrentTool] = useState<LatteTool>('Milk')

  // Performance metrics
  const [currentFPS, setCurrentFPS] = useState(0)
  const [frameTime, setFrameTime] = useState(0)

  // Update scene when tool changes
  useEffect(() => {
    setScene((prevScene) => ({
      ...prevScene,
      tool: currentTool,
    }))
  }, [currentTool])

  // Update scene when pause state changes
  useEffect(() => {
    setScene((prevScene) => ({
      ...prevScene,
      paused: isPaused,
    }))
  }, [isPaused])

  // Update performance configuration when preset changes
  useEffect(() => {
    const newConfig = PERFORMANCE_PRESETS[activePreset]
    setCurrentPerformanceConfig(newConfig)
    qualityManager.reset(newConfig)
    frameRateLimiter.setTargetFPS(newConfig.targetFPS)
    performanceMonitor.reset()
  }, [activePreset, qualityManager, frameRateLimiter, performanceMonitor])

  // Performance monitoring effect
  useEffect(() => {
    if (!enablePerformanceMonitoring) return

    const interval = setInterval(() => {
      const fps = performanceMonitor.getCurrentFPS()
      setCurrentFPS(fps)
      
      if (onPerformanceUpdate) {
        onPerformanceUpdate(fps, frameTime)
      }
    }, 1000) // Update every second

    return () => clearInterval(interval)
  }, [enablePerformanceMonitoring, onPerformanceUpdate, frameTime, performanceMonitor])

  // Reset the simulation with optimized configuration
  const handleReset = useCallback(() => {
    const optimizedConfig = createOptimizedLatteConfig(currentPerformanceConfig)
    setScene(createLatteScene(new Vec2(width, height), optimizedConfig))
    performanceMonitor.reset()
  }, [width, height, currentPerformanceConfig, performanceMonitor])

  // Toggle pause state
  const handlePause = useCallback(() => {
    setIsPaused((prev) => !prev)
  }, [])

  // Handle tool selection
  const handleToolSelect = useCallback((tool: LatteTool) => {
    setCurrentTool(tool)
  }, [])

  // Handle performance preset selection
  const handlePresetSelect = useCallback((preset: PerformancePreset) => {
    const newConfig = PERFORMANCE_PRESETS[preset]
    setCurrentPerformanceConfig(newConfig)
    qualityManager.reset(newConfig)
    frameRateLimiter.setTargetFPS(newConfig.targetFPS)
    
    // Recreate scene with new performance settings
    const optimizedConfig = createOptimizedLatteConfig(newConfig)
    setScene(createLatteScene(new Vec2(width, height), optimizedConfig))
    performanceMonitor.reset()
  }, [width, height, qualityManager, frameRateLimiter, performanceMonitor])

  // Helper functions for gesture interactions (to be called with runOnJS)
  const handleGestureStart = useCallback((x: number, y: number) => {
    setScene((prevScene) => {
      // Reset frame counter for milk tool
      if (prevScene.tool === 'Milk') {
        prevScene.frameNr = 1
      }

      // Set obstacle at touch position
      setObstacle(prevScene, x, y, true, true)
      return { ...prevScene }
    })
  }, [])

  const handleGestureUpdate = useCallback((x: number, y: number) => {
    setScene((prevScene) => {
      setObstacle(prevScene, x, y, false, true)
      return { ...prevScene }
    })
  }, [])

  const handleGestureEnd = useCallback(() => {
    setScene((prevScene) => {
      if (prevScene.tool === 'Milk') {
        setObstacle(prevScene, 0, 0, true, true)
      }
      return { ...prevScene }
    })
  }, [])

  // Create pan gesture for interacting with the simulation
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart((e) => {
          // Convert touch coordinates to simulation space
          const y = e.x / width
          const x = e.y / height

          // Start interaction with the selected tool (run on JS thread)
          runOnJS(handleGestureStart)(x, y)
        })
        .onUpdate((e) => {
          // Convert touch coordinates to simulation space
          const y = e.x / width
          const x = e.y / height // Invert Y coordinate

          // Update obstacle position (run on JS thread)
          runOnJS(handleGestureUpdate)(x, y)
        })
        .onEnd(() => {
          // End interaction (run on JS thread)
          runOnJS(handleGestureEnd)()
        }),
    [width, height, handleGestureStart, handleGestureUpdate, handleGestureEnd],
  )

  return (
    <View style={styles.container}>
      {/* Simulation canvas */}
      <GestureDetector gesture={panGesture}>
        <View style={[styles.canvasContainer, { width, height }]}>
          <LatteArtRenderer scene={scene} width={width} height={height} />
        </View>
      </GestureDetector>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Performance metrics */}
        {enablePerformanceMonitoring && (
          <View style={styles.performanceContainer}>
            <Text style={styles.performanceTitle}>Performance:</Text>
            <Text style={styles.performanceText}>
              FPS: {currentFPS} | Preset: {activePreset} | Device: {deviceTier}
            </Text>
            <Text style={styles.performanceText}>
              Resolution: {currentPerformanceConfig.resolution}x{currentPerformanceConfig.resolution} | 
              Iterations: {currentPerformanceConfig.numIters}
            </Text>
          </View>
        )}

        {/* Performance preset selection */}
        <View style={styles.toolsContainer}>
          <Text style={styles.toolsTitle}>Quality:</Text>
          <View style={styles.toolButtons}>
            <ToolButton 
              label="Low" 
              isSelected={activePreset === 'low'} 
              onPress={() => handlePresetSelect('low')} 
            />
            <ToolButton 
              label="Medium" 
              isSelected={activePreset === 'medium'} 
              onPress={() => handlePresetSelect('medium')} 
            />
            <ToolButton 
              label="High" 
              isSelected={activePreset === 'high'} 
              onPress={() => handlePresetSelect('high')} 
            />
            <ToolButton 
              label="Ultra" 
              isSelected={activePreset === 'ultra'} 
              onPress={() => handlePresetSelect('ultra')} 
            />
          </View>
        </View>

        {/* Tool selection */}
        <View style={styles.toolsContainer}>
          <Text style={styles.toolsTitle}>Tools:</Text>
          <View style={styles.toolButtons}>
            <ToolButton label="Milk" isSelected={currentTool === 'Milk'} onPress={() => handleToolSelect('Milk')} />
            <ToolButton label="Spoon" isSelected={currentTool === 'Spoon'} onPress={() => handleToolSelect('Spoon')} />
            <ToolButton
              label="Pen"
              isSelected={currentTool === 'LattePen'}
              onPress={() => handleToolSelect('LattePen')}
            />
            <ToolButton
              label="Chocolate"
              isSelected={currentTool === 'Chocolate'}
              onPress={() => handleToolSelect('Chocolate')}
            />
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.button} onPress={handlePause}>
            <Text style={styles.buttonText}>{isPaused ? 'Resume' : 'Pause'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleReset}>
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

/**
 * Tool selection button component
 */
interface ToolButtonProps {
  label: string
  isSelected: boolean
  onPress: () => void
}

const ToolButton: React.FC<ToolButtonProps> = ({ label, isSelected, onPress }) => (
  <TouchableOpacity style={[styles.toolButton, isSelected && styles.selectedToolButton]} onPress={onPress}>
    <Text style={[styles.toolButtonText, isSelected && styles.selectedToolButtonText]}>{label}</Text>
  </TouchableOpacity>
)

/**
 * Styles for the component
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  canvasContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  controls: {
    width: '100%',
    padding: 16,
    marginTop: 16,
  },
  performanceContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  performanceTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  performanceText: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 2,
  },
  toolsContainer: {
    marginBottom: 16,
  },
  toolsTitle: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
  },
  toolButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#333',
    marginRight: 8,
  },
  selectedToolButton: {
    backgroundColor: '#08aab2',
  },
  toolButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  selectedToolButtonText: {
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#08aab2',
    minWidth: 100,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
})

export default LatteArtSimulator
