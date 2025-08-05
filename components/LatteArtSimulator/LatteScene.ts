import { FluidPhysics, LatteSceneConfig } from './FluidPhysics';
import Vec2 from './Vec2';
import { clamp, remap } from './MathUtils';

/**
 * Tool types for the latte art simulator
 */
export type LatteTool = 'Milk' | 'Spoon' | 'LattePen' | 'Chocolate';

/**
 * Scene state for the latte art simulator
 */
export interface LatteScene extends LatteSceneConfig {
  // Simulation state
  fluid: FluidPhysics;
  paused: boolean;
  frameNr: number;
  
  // Tool state
  tool: LatteTool;
  obstacleX: number;
  obstacleY: number;
}

/**
 * Default configuration for the latte scene
 */
export const defaultLatteConfig: LatteSceneConfig = {
  // Fluid simulation parameters
  resolution: 180,
  numIters: 20,
  dt: 1/60,
  drag: 0.97,
  diffusion: 0.1,
  viscosity: 0.1,
  vorticity: 0.1,
  smokeBuoyancy: 0.1,
  smokeWeight: 0.05,
  smokeDissipation: 0.99,
  overRelaxation: 1.4,
  
  // Latte specific parameters
  obstacleRadius: 0.036,
  latteCupRadius: 0.4,
  milkStartSpeed: 0.5,
  timeToZeroMilkSpeed: 0.5,
  timeToMinObstacleRadius: 0.3,
  chocolateRadius: 0.01,
  lattePenRadius: 0.01,
};

/**
 * Create a new latte scene
 */
export function createLatteScene(
  canvasSize: Vec2,
  overrides: Partial<LatteSceneConfig> = {}
): LatteScene {
  // Merge default config with overrides
  const config = {
    ...defaultLatteConfig,
    ...overrides,
  };
  
  // Create fluid physics
  const fluid = FluidPhysics.makeFluidPhysics(config, canvasSize);
  
  // Create scene
  const scene: LatteScene = {
    ...config,
    fluid,
    paused: false,
    frameNr: 0,
    tool: 'Milk',
    obstacleX: 0,
    obstacleY: 0,
  };
  
  // Initialize the latte cup
  initializeLatteScene(scene);
  
  return scene;
}

/**
 * Initialize the latte scene
 */
function initializeLatteScene(scene: LatteScene): void {
  const f = scene.fluid;
  const n = f.numY;
  
  // Initialize all cells with dark brown (espresso)
  for (let i = 0; i < f.numX; i++) {
    for (let j = 0; j < f.numY; j++) {
      f.m[i * n + j] = 0; // Darkest Brown Smoke (espresso)
    }
  }
  
  // Set up the cup boundary
  const cupRadius = scene.latteCupRadius / scene.fluid.h;
  const centerX = Math.floor(f.numX / 2);
  const centerY = Math.floor(f.numY / 2);
  
  for (let i = 0; i < f.numX; i++) {
    for (let j = 0; j < f.numY; j++) {
      const dx = i - centerX;
      const dy = j - centerY;
      const distSquared = dx * dx + dy * dy;
      
      // Outside the cup is solid
      if (distSquared > cupRadius * cupRadius) {
        f.s[i * n + j] = 0; // Solid
      }
    }
  }
}

/**
 * Set an obstacle in the scene (used for user interaction)
 */
export function setObstacle(
  scene: LatteScene,
  x: number,
  y: number,
  reset: boolean,
  isLeft: boolean = true
): void {
  let vx = 0.0;
  let vy = 0.0;
  
  if (!reset) {
    // How fast the obstacle moved since last frame
    vx = (x - scene.obstacleX) / scene.dt;
    vy = (y - scene.obstacleY) / scene.dt;
  }
  
  scene.obstacleX = x;
  scene.obstacleY = y;
  
  let r = scene.obstacleRadius;
  const f = scene.fluid;
  const n = f.numY;
  
  // Determine which tool to use
  const tool: LatteTool = !isLeft ? 'LattePen' : scene.tool;
  const minRadius = 0.015;
  
  // Calculate milk velocity and radius based on time
  let latteV = 0.0;
  if (tool === 'Milk') {
    const framesTo0Speed = scene.timeToZeroMilkSpeed / scene.dt;
    const framesToMinRadius = scene.timeToMinObstacleRadius / scene.dt;
    
    latteV = remap(scene.frameNr, 0, framesTo0Speed, scene.milkStartSpeed, 0);
    
    if (scene.frameNr <= framesToMinRadius) {
      // Over some secs after mouse press, the radius shrinks from r to minRadius
      r = remap(scene.frameNr, 0, framesToMinRadius, r, minRadius);
    }
  } else if (tool === 'Chocolate') {
    r = scene.chocolateRadius;
  } else if (tool === 'LattePen') {
    r = scene.lattePenRadius;
  }
  
  // Convert to grid coordinates
  const gridX = Math.floor(x / f.h);
  const gridY = Math.floor(y / f.h);
  const gridR = Math.floor(r / f.h);
  
  // For all cells in a square around the obstacle
  for (let i = Math.max(1, gridX - gridR); i <= Math.min(f.numX - 2, gridX + gridR); i++) {
    for (let j = Math.max(1, gridY - gridR); j <= Math.min(f.numY - 2, gridY + gridR); j++) {
      // Check if cell is within obstacle radius
      const dx = (i + 0.5) * f.h - x;
      const dy = (j + 0.5) * f.h - y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < r * r) {
        // Cell is inside obstacle
        if (tool === 'Milk') {
          // Add milk (white smoke)
          f.m[i * n + j] = 1.0;
          
          // Add velocity
          f.u[i * n + j] = vx;
          f.v[i * n + j] = vy + latteV;
        } else if (tool === 'Chocolate') {
          // Add chocolate
          f.c[i * n + j] = 1.0;
        } else if (tool === 'Spoon') {
          // Spoon just adds velocity
          f.u[i * n + j] = vx * 2;
          f.v[i * n + j] = vy * 2;
        } else if (tool === 'LattePen') {
          // Latte pen draws with milk
          f.m[i * n + j] = 1.0;
        }
      }
    }
  }
}

/**
 * Simulate one step of the latte scene
 */
export function simulateLatteScene(scene: LatteScene): void {
  if (scene.paused) return;
  
  // Simulate fluid physics
  scene.fluid.simulate(scene, scene.dt);
  
  // Increment frame counter for milk tool
  if (scene.tool === 'Milk' && scene.frameNr > 0) {
    scene.frameNr++;
  }
}