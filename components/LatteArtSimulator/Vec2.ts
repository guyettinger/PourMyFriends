/**
 * A 2D vector class for fluid simulation calculations
 */
export default class Vec2 {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /**
   * Add another vector to this one
   */
  add(v: Vec2): Vec2 {
    return new Vec2(this.x + v.x, this.y + v.y);
  }

  /**
   * Subtract another vector from this one
   */
  subtract(v: Vec2): Vec2 {
    return new Vec2(this.x - v.x, this.y - v.y);
  }

  /**
   * Scale this vector by a scalar value
   */
  scale(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }

  /**
   * Get the length (magnitude) of this vector
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Get the squared length of this vector (faster than length())
   */
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * Normalize this vector (make it unit length)
   */
  normalize(): Vec2 {
    const len = this.length();
    if (len > 0) {
      return new Vec2(this.x / len, this.y / len);
    }
    return new Vec2(0, 0);
  }

  /**
   * Calculate the dot product with another vector
   */
  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y;
  }

  /**
   * Create a copy of this vector
   */
  copy(): Vec2 {
    return new Vec2(this.x, this.y);
  }
}