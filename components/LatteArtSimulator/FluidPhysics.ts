import Vec2 from './Vec2';
import { clamp } from './MathUtils';

/**
 * Configuration for the fluid simulation
 */
export interface FluidConfig {
  resolution: number;
  numIters: number;
  dt: number;
  drag: number;
  diffusion: number;
  viscosity: number;
  vorticity: number;
  smokeBuoyancy: number;
  smokeWeight: number;
  smokeDissipation: number;
}

/**
 * Scene configuration for the latte art simulator
 */
export interface LatteSceneConfig extends FluidConfig {
  obstacleRadius: number;
  latteCupRadius: number;
  milkStartSpeed: number;
  timeToZeroMilkSpeed: number;
  timeToMinObstacleRadius: number;
  chocolateRadius: number;
  lattePenRadius: number;
  overRelaxation: number;
}

/**
 * Fluid physics simulation for the latte art simulator
 */
export class FluidPhysics {
  // Grid dimensions
  numX: number;
  numY: number;
  h: number;
  
  // Fluid properties
  u: number[]; // Velocity x
  v: number[]; // Velocity y
  newU: number[];
  newV: number[];
  p: number[]; // Pressure
  s: number[]; // Solid (0 = solid, 1 = fluid)
  m: number[]; // Smoke density
  newM: number[];
  c: number[]; // Chocolate density
  newC: number[];

  /**
   * Create a new fluid physics simulation
   */
  constructor(config: FluidConfig, canvasSize: Vec2) {
    // Calculate grid dimensions based on resolution
    this.numX = Math.floor(config.resolution);
    this.numY = Math.floor(config.resolution);
    this.h = 1.0 / this.numX;

    // Initialize arrays
    const size = this.numX * this.numY;
    this.u = new Array(size).fill(0);
    this.v = new Array(size).fill(0);
    this.newU = new Array(size).fill(0);
    this.newV = new Array(size).fill(0);
    this.p = new Array(size).fill(0);
    this.s = new Array(size).fill(1); // All fluid initially
    this.m = new Array(size).fill(0);
    this.newM = new Array(size).fill(0);
    this.c = new Array(size).fill(0);
    this.newC = new Array(size).fill(0);
  }

  /**
   * Create a new fluid physics simulation with the given config
   */
  static makeFluidPhysics(config: FluidConfig, canvasSize: Vec2): FluidPhysics {
    return new FluidPhysics(config, canvasSize);
  }

  /**
   * Simulate one step of the fluid physics
   */
  simulate(scene: LatteSceneConfig, dt: number): void {
    this.advectVelocity(dt, scene.drag);
    this.advectSmoke(dt, scene.smokeDissipation, true);
    this.addBuoyancy(dt, scene.smokeBuoyancy, scene.smokeWeight);
    this.addVorticity(dt, scene.vorticity);
    this.project(scene.numIters, scene.overRelaxation);
  }

  /**
   * Advect velocity field
   */
  advectVelocity(dt: number, drag: number): void {
    const n = this.numY;
    
    // For each cell
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (this.s[i * n + j] > 0) {
          // Get velocity at this cell
          const u = this.u[i * n + j];
          const v = this.v[i * n + j];
          
          // Trace back along velocity
          const x = i - dt * u / this.h;
          const y = j - dt * v / this.h;
          
          // Interpolate velocity at traced position
          this.newU[i * n + j] = this.sampleField(x, y, this.u) * drag;
          this.newV[i * n + j] = this.sampleField(x, y, this.v) * drag;
        }
      }
    }
    
    // Swap velocity buffers
    [this.u, this.newU] = [this.newU, this.u];
    [this.v, this.newV] = [this.newV, this.v];
    
    // Apply boundary conditions
    this.setBoundaryCondition();
  }

  /**
   * Advect smoke density
   */
  advectSmoke(dt: number, dissipation: number, isLatte: boolean): void {
    const n = this.numY;
    
    // For each cell
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (this.s[i * n + j] > 0) {
          // Get velocity at this cell
          const u = this.u[i * n + j];
          const v = this.v[i * n + j];
          
          // Trace back along velocity
          const x = i - dt * u / this.h;
          const y = j - dt * v / this.h;
          
          // Interpolate smoke density at traced position
          this.newM[i * n + j] = this.sampleField(x, y, this.m) * dissipation;
          
          // For latte scene, also advect chocolate
          if (isLatte) {
            this.newC[i * n + j] = this.sampleField(x, y, this.c) * dissipation;
          }
        }
      }
    }
    
    // Swap smoke buffers
    [this.m, this.newM] = [this.newM, this.m];
    
    // For latte scene, swap chocolate buffers
    if (isLatte) {
      [this.c, this.newC] = [this.newC, this.c];
    }
  }

  /**
   * Add buoyancy force to the velocity field
   */
  addBuoyancy(dt: number, buoyancy: number, weight: number): void {
    const n = this.numY;
    
    // For each cell
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (this.s[i * n + j] > 0) {
          // Add buoyancy force based on smoke density
          this.v[i * n + j] += dt * (buoyancy * this.m[i * n + j] - weight);
        }
      }
    }
  }

  /**
   * Add vorticity confinement to the velocity field
   */
  addVorticity(dt: number, amount: number): void {
    if (amount <= 0) return;
    
    const n = this.numY;
    const curl = new Array(this.numX * this.numY).fill(0);
    
    // Calculate curl for each cell
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (this.s[i * n + j] > 0) {
          // Calculate curl as dv/dx - du/dy
          const dudy = (this.u[i * n + (j + 1)] - this.u[i * n + (j - 1)]) / (2 * this.h);
          const dvdx = (this.v[(i + 1) * n + j] - this.v[(i - 1) * n + j]) / (2 * this.h);
          curl[i * n + j] = dvdx - dudy;
        }
      }
    }
    
    // Apply vorticity confinement force
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (this.s[i * n + j] > 0) {
          // Calculate gradient of curl magnitude
          const dx = Math.abs(curl[(i + 1) * n + j]) - Math.abs(curl[(i - 1) * n + j]);
          const dy = Math.abs(curl[i * n + (j + 1)]) - Math.abs(curl[i * n + (j - 1)]);
          
          // Normalize gradient
          const len = Math.sqrt(dx * dx + dy * dy) + 1e-6;
          const nx = dx / len;
          const ny = dy / len;
          
          // Apply force
          this.u[i * n + j] += dt * amount * ny * curl[i * n + j];
          this.v[i * n + j] -= dt * amount * nx * curl[i * n + j];
        }
      }
    }
  }

  /**
   * Project velocity field to be divergence-free
   */
  project(numIters: number, overRelaxation: number): void {
    const n = this.numY;
    
    // Calculate divergence
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (this.s[i * n + j] > 0) {
          const sx0 = this.s[(i - 1) * n + j];
          const sx1 = this.s[(i + 1) * n + j];
          const sy0 = this.s[i * n + (j - 1)];
          const sy1 = this.s[i * n + (j + 1)];
          const s = sx0 + sx1 + sy0 + sy1;
          
          if (s > 0) {
            const div = this.u[(i + 1) * n + j] - this.u[i * n + j] +
                        this.v[i * n + (j + 1)] - this.v[i * n + j];
            this.p[i * n + j] = -div / s;
          }
        }
      }
    }
    
    // Solve pressure Poisson equation
    for (let iter = 0; iter < numIters; iter++) {
      for (let i = 1; i < this.numX - 1; i++) {
        for (let j = 1; j < this.numY - 1; j++) {
          if (this.s[i * n + j] > 0) {
            const sx0 = this.s[(i - 1) * n + j];
            const sx1 = this.s[(i + 1) * n + j];
            const sy0 = this.s[i * n + (j - 1)];
            const sy1 = this.s[i * n + (j + 1)];
            const s = sx0 + sx1 + sy0 + sy1;
            
            if (s > 0) {
              const p = (sx0 * this.p[(i - 1) * n + j] +
                         sx1 * this.p[(i + 1) * n + j] +
                         sy0 * this.p[i * n + (j - 1)] +
                         sy1 * this.p[i * n + (j + 1)]) / s;
              
              this.p[i * n + j] = (1 - overRelaxation) * this.p[i * n + j] + 
                                  overRelaxation * p;
            }
          }
        }
      }
    }
    
    // Apply pressure gradient to velocity
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (this.s[i * n + j] > 0) {
          const sx0 = this.s[(i - 1) * n + j];
          const sx1 = this.s[(i + 1) * n + j];
          const sy0 = this.s[i * n + (j - 1)];
          const sy1 = this.s[i * n + (j + 1)];
          
          this.u[i * n + j] -= sx1 > 0 ? this.p[(i + 1) * n + j] : 0;
          this.u[(i + 1) * n + j] += sx0 > 0 ? this.p[i * n + j] : 0;
          this.v[i * n + j] -= sy1 > 0 ? this.p[i * n + (j + 1)] : 0;
          this.v[i * n + (j + 1)] += sy0 > 0 ? this.p[i * n + j] : 0;
        }
      }
    }
    
    // Apply boundary conditions
    this.setBoundaryCondition();
  }

  /**
   * Set boundary conditions for velocity field
   */
  setBoundaryCondition(): void {
    const n = this.numY;
    
    // Set velocity at boundaries
    for (let i = 0; i < this.numX; i++) {
      this.u[i * n + 0] = 0;
      this.u[i * n + (this.numY - 1)] = 0;
      this.v[i * n + 0] = 0;
      this.v[i * n + (this.numY - 1)] = 0;
    }
    
    for (let j = 0; j < this.numY; j++) {
      this.u[0 * n + j] = 0;
      this.u[(this.numX - 1) * n + j] = 0;
      this.v[0 * n + j] = 0;
      this.v[(this.numX - 1) * n + j] = 0;
    }
  }

  /**
   * Sample a field at a non-integer position using bilinear interpolation
   */
  sampleField(x: number, y: number, field: number[]): number {
    const n = this.numY;
    
    // Clamp coordinates to grid
    x = clamp(x, 1, this.numX - 2);
    y = clamp(y, 1, this.numY - 2);
    
    // Get integer coordinates
    const i0 = Math.floor(x);
    const j0 = Math.floor(y);
    const i1 = i0 + 1;
    const j1 = j0 + 1;
    
    // Get interpolation weights
    const s1 = x - i0;
    const s0 = 1 - s1;
    const t1 = y - j0;
    const t0 = 1 - t1;
    
    // Bilinear interpolation
    return s0 * (t0 * field[i0 * n + j0] + t1 * field[i0 * n + j1]) +
           s1 * (t0 * field[i1 * n + j0] + t1 * field[i1 * n + j1]);
  }
}