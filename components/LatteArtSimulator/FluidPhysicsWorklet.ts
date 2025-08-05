import { runOnUI, SharedValue } from 'react-native-reanimated';
import Vec2 from './Vec2';
import { clamp } from './MathUtils';
import { FluidConfig, LatteSceneConfig } from './FluidPhysics';

/**
 * Worklet-optimized fluid physics simulation for better performance
 * Uses react-native-reanimated to offload heavy computations to UI thread
 */
export class FluidPhysicsWorklet {
  // Grid dimensions
  numX: number;
  numY: number;
  h: number;
  
  // Fluid properties as shared values for worklet access
  u: SharedValue<number[]>; // Velocity x
  v: SharedValue<number[]>; // Velocity y
  newU: SharedValue<number[]>;
  newV: SharedValue<number[]>;
  p: SharedValue<number[]>; // Pressure
  s: SharedValue<number[]>; // Solid (0 = solid, 1 = fluid)
  m: SharedValue<number[]>; // Smoke density
  newM: SharedValue<number[]>;
  c: SharedValue<number[]>; // Chocolate density
  newC: SharedValue<number[]>;

  constructor(config: FluidConfig, canvasSize: Vec2) {
    // Calculate grid dimensions based on resolution
    this.numX = Math.floor(config.resolution);
    this.numY = Math.floor(config.resolution);
    this.h = 1.0 / this.numX;

    // Initialize arrays as shared values
    const size = this.numX * this.numY;
    this.u = { value: new Array(size).fill(0) } as SharedValue<number[]>;
    this.v = { value: new Array(size).fill(0) } as SharedValue<number[]>;
    this.newU = { value: new Array(size).fill(0) } as SharedValue<number[]>;
    this.newV = { value: new Array(size).fill(0) } as SharedValue<number[]>;
    this.p = { value: new Array(size).fill(0) } as SharedValue<number[]>;
    this.s = { value: new Array(size).fill(1) } as SharedValue<number[]>; // All fluid initially
    this.m = { value: new Array(size).fill(0) } as SharedValue<number[]>;
    this.newM = { value: new Array(size).fill(0) } as SharedValue<number[]>;
    this.c = { value: new Array(size).fill(0) } as SharedValue<number[]>;
    this.newC = { value: new Array(size).fill(0) } as SharedValue<number[]>;
  }

  /**
   * Create a new worklet-optimized fluid physics simulation
   */
  static makeFluidPhysics(config: FluidConfig, canvasSize: Vec2): FluidPhysicsWorklet {
    return new FluidPhysicsWorklet(config, canvasSize);
  }

  /**
   * Simulate one step of the fluid physics using worklets for performance
   */
  simulate(scene: LatteSceneConfig, dt: number): void {
    // Run heavy computations on UI thread for better performance
    runOnUI(() => {
      'worklet';
      this.advectVelocityWorklet(dt, scene.drag);
      this.advectSmokeWorklet(dt, scene.smokeDissipation, true);
      this.addBuoyancyWorklet(dt, scene.smokeBuoyancy, scene.smokeWeight);
      this.addVorticityWorklet(dt, scene.vorticity);
      this.projectWorklet(scene.numIters, scene.overRelaxation);
    })();
  }

  /**
   * Worklet version of advectVelocity for UI thread execution
   */
  private advectVelocityWorklet = (dt: number, drag: number) => {
    'worklet';
    const n = this.numY;
    const u = this.u.value;
    const v = this.v.value;
    const newU = this.newU.value;
    const newV = this.newV.value;
    const s = this.s.value;
    
    // For each cell
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (s[i * n + j] > 0) {
          // Get velocity at this cell
          const uVal = u[i * n + j];
          const vVal = v[i * n + j];
          
          // Trace back along velocity
          const x = i - dt * uVal / this.h;
          const y = j - dt * vVal / this.h;
          
          // Interpolate velocity at traced position
          newU[i * n + j] = this.sampleFieldWorklet(x, y, u) * drag;
          newV[i * n + j] = this.sampleFieldWorklet(x, y, v) * drag;
        }
      }
    }
    
    // Swap velocity buffers
    this.u.value = newU;
    this.v.value = u;
    this.newU.value = u;
    this.newV.value = newV;
    
    // Apply boundary conditions
    this.setBoundaryConditionWorklet();
  };

  /**
   * Worklet version of advectSmoke for UI thread execution
   */
  private advectSmokeWorklet = (dt: number, dissipation: number, isLatte: boolean) => {
    'worklet';
    const n = this.numY;
    const u = this.u.value;
    const v = this.v.value;
    const m = this.m.value;
    const newM = this.newM.value;
    const c = this.c.value;
    const newC = this.newC.value;
    const s = this.s.value;
    
    // For each cell
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (s[i * n + j] > 0) {
          // Get velocity at this cell
          const uVal = u[i * n + j];
          const vVal = v[i * n + j];
          
          // Trace back along velocity
          const x = i - dt * uVal / this.h;
          const y = j - dt * vVal / this.h;
          
          // Interpolate smoke density at traced position
          newM[i * n + j] = this.sampleFieldWorklet(x, y, m) * dissipation;
          
          // For latte scene, also advect chocolate
          if (isLatte) {
            newC[i * n + j] = this.sampleFieldWorklet(x, y, c) * dissipation;
          }
        }
      }
    }
    
    // Swap smoke buffers
    this.m.value = newM;
    this.newM.value = m;
    
    // For latte scene, swap chocolate buffers
    if (isLatte) {
      this.c.value = newC;
      this.newC.value = c;
    }
  };

  /**
   * Worklet version of addBuoyancy for UI thread execution
   */
  private addBuoyancyWorklet = (dt: number, buoyancy: number, weight: number) => {
    'worklet';
    const n = this.numY;
    const v = this.v.value;
    const m = this.m.value;
    const s = this.s.value;
    
    // For each cell
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (s[i * n + j] > 0) {
          // Add buoyancy force based on smoke density
          v[i * n + j] += dt * (buoyancy * m[i * n + j] - weight);
        }
      }
    }
  };

  /**
   * Worklet version of addVorticity for UI thread execution
   */
  private addVorticityWorklet = (dt: number, amount: number) => {
    'worklet';
    if (amount <= 0) return;
    
    const n = this.numY;
    const u = this.u.value;
    const v = this.v.value;
    const s = this.s.value;
    const curl = new Array(this.numX * this.numY).fill(0);
    
    // Calculate curl for each cell
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (s[i * n + j] > 0) {
          // Calculate curl as dv/dx - du/dy
          const dudy = (u[i * n + (j + 1)] - u[i * n + (j - 1)]) / (2 * this.h);
          const dvdx = (v[(i + 1) * n + j] - v[(i - 1) * n + j]) / (2 * this.h);
          curl[i * n + j] = dvdx - dudy;
        }
      }
    }
    
    // Apply vorticity confinement force
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (s[i * n + j] > 0) {
          // Calculate gradient of curl magnitude
          const dx = Math.abs(curl[(i + 1) * n + j]) - Math.abs(curl[(i - 1) * n + j]);
          const dy = Math.abs(curl[i * n + (j + 1)]) - Math.abs(curl[i * n + (j - 1)]);
          
          // Normalize gradient
          const len = Math.sqrt(dx * dx + dy * dy) + 1e-6;
          const nx = dx / len;
          const ny = dy / len;
          
          // Apply force
          u[i * n + j] += dt * amount * ny * curl[i * n + j];
          v[i * n + j] -= dt * amount * nx * curl[i * n + j];
        }
      }
    }
  };

  /**
   * Worklet version of project for UI thread execution - most expensive operation
   */
  private projectWorklet = (numIters: number, overRelaxation: number) => {
    'worklet';
    const n = this.numY;
    const u = this.u.value;
    const v = this.v.value;
    const p = this.p.value;
    const s = this.s.value;
    
    // Calculate divergence
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (s[i * n + j] > 0) {
          const sx0 = s[(i - 1) * n + j];
          const sx1 = s[(i + 1) * n + j];
          const sy0 = s[i * n + (j - 1)];
          const sy1 = s[i * n + (j + 1)];
          const sSum = sx0 + sx1 + sy0 + sy1;
          
          if (sSum > 0) {
            const div = u[(i + 1) * n + j] - u[i * n + j] +
                        v[i * n + (j + 1)] - v[i * n + j];
            p[i * n + j] = -div / sSum;
          }
        }
      }
    }
    
    // Solve pressure Poisson equation - most expensive part
    for (let iter = 0; iter < numIters; iter++) {
      for (let i = 1; i < this.numX - 1; i++) {
        for (let j = 1; j < this.numY - 1; j++) {
          if (s[i * n + j] > 0) {
            const sx0 = s[(i - 1) * n + j];
            const sx1 = s[(i + 1) * n + j];
            const sy0 = s[i * n + (j - 1)];
            const sy1 = s[i * n + (j + 1)];
            const sSum = sx0 + sx1 + sy0 + sy1;
            
            if (sSum > 0) {
              const pVal = (sx0 * p[(i - 1) * n + j] +
                           sx1 * p[(i + 1) * n + j] +
                           sy0 * p[i * n + (j - 1)] +
                           sy1 * p[i * n + (j + 1)]) / sSum;
              
              p[i * n + j] = (1 - overRelaxation) * p[i * n + j] + 
                            overRelaxation * pVal;
            }
          }
        }
      }
    }
    
    // Apply pressure gradient to velocity
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numY - 1; j++) {
        if (s[i * n + j] > 0) {
          const sx0 = s[(i - 1) * n + j];
          const sx1 = s[(i + 1) * n + j];
          const sy0 = s[i * n + (j - 1)];
          const sy1 = s[i * n + (j + 1)];
          
          u[i * n + j] -= sx1 > 0 ? p[(i + 1) * n + j] : 0;
          u[(i + 1) * n + j] += sx0 > 0 ? p[i * n + j] : 0;
          v[i * n + j] -= sy1 > 0 ? p[i * n + (j + 1)] : 0;
          v[i * n + (j + 1)] += sy0 > 0 ? p[i * n + j] : 0;
        }
      }
    }
    
    // Apply boundary conditions
    this.setBoundaryConditionWorklet();
  };

  /**
   * Worklet version of setBoundaryCondition
   */
  private setBoundaryConditionWorklet = () => {
    'worklet';
    const n = this.numY;
    const u = this.u.value;
    const v = this.v.value;
    
    // Set velocity at boundaries
    for (let i = 0; i < this.numX; i++) {
      u[i * n + 0] = 0;
      u[i * n + (this.numY - 1)] = 0;
      v[i * n + 0] = 0;
      v[i * n + (this.numY - 1)] = 0;
    }
    
    for (let j = 0; j < this.numY; j++) {
      u[0 * n + j] = 0;
      u[(this.numX - 1) * n + j] = 0;
      v[0 * n + j] = 0;
      v[(this.numX - 1) * n + j] = 0;
    }
  };

  /**
   * Worklet version of sampleField with bilinear interpolation
   */
  private sampleFieldWorklet = (x: number, y: number, field: number[]): number => {
    'worklet';
    const n = this.numY;
    
    // Clamp coordinates to grid
    x = Math.max(1, Math.min(this.numX - 2, x));
    y = Math.max(1, Math.min(this.numY - 2, y));
    
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
  };

  /**
   * Get current fluid data for rendering (called from JS thread)
   */
  getFluidData() {
    return {
      numX: this.numX,
      numY: this.numY,
      h: this.h,
      u: this.u.value,
      v: this.v.value,
      p: this.p.value,
      s: this.s.value,
      m: this.m.value,
      c: this.c.value,
    };
  }

  /**
   * Update fluid data from JS thread (for user interactions)
   */
  updateFluidData(updates: Partial<{
    u: number[];
    v: number[];
    m: number[];
    c: number[];
    s: number[];
  }>) {
    if (updates.u) this.u.value = updates.u;
    if (updates.v) this.v.value = updates.v;
    if (updates.m) this.m.value = updates.m;
    if (updates.c) this.c.value = updates.c;
    if (updates.s) this.s.value = updates.s;
  }
}