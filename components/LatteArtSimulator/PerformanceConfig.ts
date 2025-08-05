import { Platform, Dimensions } from 'react-native';
import { LatteSceneConfig } from './FluidPhysics';

/**
 * Performance preset levels
 */
export type PerformancePreset = 'low' | 'medium' | 'high' | 'ultra';

/**
 * Device performance tier based on screen size and platform
 */
export type DeviceTier = 'low-end' | 'mid-range' | 'high-end' | 'flagship';

/**
 * Performance configuration interface
 */
export interface PerformanceConfig {
  preset: PerformancePreset;
  resolution: number;
  numIters: number;
  targetFPS: number;
  useWorklets: boolean;
  adaptiveQuality: boolean;
  maxFrameTime: number; // milliseconds
}

/**
 * Detect device performance tier based on screen dimensions and platform
 */
export function detectDeviceTier(): DeviceTier {
  const { width, height } = Dimensions.get('screen');
  const screenArea = width * height;
  const pixelDensity = width / Dimensions.get('window').width;

  // iOS devices generally have better performance
  if (Platform.OS === 'ios') {
    if (screenArea > 2000000) return 'flagship'; // iPhone Pro Max, iPad Pro
    if (screenArea > 1500000) return 'high-end'; // iPhone Pro, iPad Air
    if (screenArea > 1000000) return 'mid-range'; // iPhone, iPad mini
    return 'low-end'; // Older devices
  }

  // Android performance varies more widely
  if (Platform.OS === 'android') {
    if (screenArea > 2500000 && pixelDensity > 2.5) return 'flagship';
    if (screenArea > 2000000) return 'high-end';
    if (screenArea > 1200000) return 'mid-range';
    return 'low-end';
  }

  // Web defaults to high-end
  return 'high-end';
}

/**
 * Get performance preset based on device tier
 */
export function getRecommendedPreset(deviceTier: DeviceTier): PerformancePreset {
  switch (deviceTier) {
    case 'flagship':
      return 'ultra';
    case 'high-end':
      return 'high';
    case 'mid-range':
      return 'medium';
    case 'low-end':
    default:
      return 'low';
  }
}

/**
 * Performance configurations for different presets
 */
export const PERFORMANCE_PRESETS: Record<PerformancePreset, PerformanceConfig> = {
  low: {
    preset: 'low',
    resolution: 80,
    numIters: 8,
    targetFPS: 30,
    useWorklets: true,
    adaptiveQuality: true,
    maxFrameTime: 33, // ~30fps
  },
  medium: {
    preset: 'medium',
    resolution: 120,
    numIters: 12,
    targetFPS: 45,
    useWorklets: true,
    adaptiveQuality: true,
    maxFrameTime: 22, // ~45fps
  },
  high: {
    preset: 'high',
    resolution: 160,
    numIters: 16,
    targetFPS: 60,
    useWorklets: true,
    adaptiveQuality: true,
    maxFrameTime: 16, // ~60fps
  },
  ultra: {
    preset: 'ultra',
    resolution: 200,
    numIters: 20,
    targetFPS: 60,
    useWorklets: true,
    adaptiveQuality: false, // Always max quality
    maxFrameTime: 16, // ~60fps
  },
};

/**
 * Create optimized latte scene config based on performance settings
 */
export function createOptimizedLatteConfig(
  performanceConfig: PerformanceConfig,
  baseConfig?: Partial<LatteSceneConfig>
): LatteSceneConfig {
  const config: LatteSceneConfig = {
    // Fluid simulation parameters optimized for performance
    resolution: performanceConfig.resolution,
    numIters: performanceConfig.numIters,
    dt: 1 / performanceConfig.targetFPS,
    drag: 0.97,
    diffusion: 0.1,
    viscosity: 0.1,
    vorticity: performanceConfig.preset === 'low' ? 0.05 : 0.1, // Reduce vorticity on low-end
    smokeBuoyancy: 0.1,
    smokeWeight: 0.05,
    smokeDissipation: 0.99,
    overRelaxation: performanceConfig.preset === 'low' ? 1.2 : 1.4, // Less relaxation on low-end
    
    // Latte specific parameters
    obstacleRadius: 0.036,
    latteCupRadius: 0.4,
    milkStartSpeed: 0.5,
    timeToZeroMilkSpeed: 0.5,
    timeToMinObstacleRadius: 0.3,
    chocolateRadius: 0.01,
    lattePenRadius: 0.01,
    
    // Override with any provided base config
    ...baseConfig,
  };

  return config;
}

/**
 * Adaptive quality manager for dynamic performance adjustment
 */
export class AdaptiveQualityManager {
  private frameTimings: number[] = [];
  private currentConfig: PerformanceConfig;
  private readonly maxSamples = 30;
  private readonly adjustmentThreshold = 5; // frames
  private framesSinceAdjustment = 0;

  constructor(initialConfig: PerformanceConfig) {
    this.currentConfig = { ...initialConfig };
  }

  /**
   * Record frame timing and potentially adjust quality
   */
  recordFrameTime(frameTime: number): PerformanceConfig | null {
    if (!this.currentConfig.adaptiveQuality) {
      return null; // No adaptive quality
    }

    this.frameTimings.push(frameTime);
    this.framesSinceAdjustment++;

    // Keep only recent samples
    if (this.frameTimings.length > this.maxSamples) {
      this.frameTimings.shift();
    }

    // Only adjust after enough frames
    if (this.framesSinceAdjustment < this.adjustmentThreshold) {
      return null;
    }

    const avgFrameTime = this.frameTimings.reduce((a, b) => a + b, 0) / this.frameTimings.length;
    const targetFrameTime = this.currentConfig.maxFrameTime;

    let needsAdjustment = false;

    // If we're consistently over target, reduce quality
    if (avgFrameTime > targetFrameTime * 1.2) {
      needsAdjustment = this.reduceQuality();
    }
    // If we're consistently under target, increase quality
    else if (avgFrameTime < targetFrameTime * 0.8 && this.currentConfig.preset !== 'ultra') {
      needsAdjustment = this.increaseQuality();
    }

    if (needsAdjustment) {
      this.framesSinceAdjustment = 0;
      this.frameTimings = []; // Reset timings after adjustment
      return { ...this.currentConfig };
    }

    return null;
  }

  /**
   * Reduce quality settings
   */
  private reduceQuality(): boolean {
    const current = this.currentConfig;

    // Try reducing iterations first
    if (current.numIters > 6) {
      current.numIters = Math.max(6, current.numIters - 2);
      return true;
    }

    // Then reduce resolution
    if (current.resolution > 60) {
      current.resolution = Math.max(60, current.resolution - 20);
      return true;
    }

    // Finally reduce target FPS
    if (current.targetFPS > 30) {
      current.targetFPS = Math.max(30, current.targetFPS - 15);
      current.maxFrameTime = 1000 / current.targetFPS;
      return true;
    }

    return false; // Can't reduce further
  }

  /**
   * Increase quality settings
   */
  private increaseQuality(): boolean {
    const current = this.currentConfig;

    // Try increasing FPS first
    if (current.targetFPS < 60) {
      current.targetFPS = Math.min(60, current.targetFPS + 15);
      current.maxFrameTime = 1000 / current.targetFPS;
      return true;
    }

    // Then increase resolution
    if (current.resolution < 200) {
      current.resolution = Math.min(200, current.resolution + 20);
      return true;
    }

    // Finally increase iterations
    if (current.numIters < 20) {
      current.numIters = Math.min(20, current.numIters + 2);
      return true;
    }

    return false; // Can't increase further
  }

  /**
   * Get current configuration
   */
  getCurrentConfig(): PerformanceConfig {
    return { ...this.currentConfig };
  }

  /**
   * Reset to initial configuration
   */
  reset(config: PerformanceConfig): void {
    this.currentConfig = { ...config };
    this.frameTimings = [];
    this.framesSinceAdjustment = 0;
  }
}

/**
 * Frame rate limiter to prevent excessive computation
 */
export class FrameRateLimiter {
  private lastFrameTime = 0;
  private targetFrameTime: number;

  constructor(targetFPS: number) {
    this.targetFrameTime = 1000 / targetFPS;
  }

  /**
   * Check if enough time has passed for the next frame
   */
  shouldRender(currentTime: number): boolean {
    if (currentTime - this.lastFrameTime >= this.targetFrameTime) {
      this.lastFrameTime = currentTime;
      return true;
    }
    return false;
  }

  /**
   * Update target frame rate
   */
  setTargetFPS(fps: number): void {
    this.targetFrameTime = 1000 / fps;
  }

  /**
   * Get current target frame time in milliseconds
   */
  getTargetFrameTime(): number {
    return this.targetFrameTime;
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private frameCount = 0;
  private startTime = Date.now();
  private lastFPSUpdate = Date.now();
  private currentFPS = 0;

  /**
   * Record a frame and calculate FPS
   */
  recordFrame(): number {
    this.frameCount++;
    const now = Date.now();
    
    // Update FPS every second
    if (now - this.lastFPSUpdate >= 1000) {
      this.currentFPS = this.frameCount;
      this.frameCount = 0;
      this.lastFPSUpdate = now;
    }

    return this.currentFPS;
  }

  /**
   * Get average FPS since start
   */
  getAverageFPS(): number {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return elapsed > 0 ? this.frameCount / elapsed : 0;
  }

  /**
   * Get current FPS
   */
  getCurrentFPS(): number {
    return this.currentFPS;
  }

  /**
   * Reset monitoring
   */
  reset(): void {
    this.frameCount = 0;
    this.startTime = Date.now();
    this.lastFPSUpdate = Date.now();
    this.currentFPS = 0;
  }
}