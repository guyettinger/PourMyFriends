import Vec2 from '../Vec2';

describe('Vec2', () => {
  describe('constructor', () => {
    it('should create a vector with the given x and y values', () => {
      const vec = new Vec2(3, 4);
      expect(vec.x).toBe(3);
      expect(vec.y).toBe(4);
    });
  });

  describe('add', () => {
    it('should add two vectors', () => {
      const vec1 = new Vec2(1, 2);
      const vec2 = new Vec2(3, 4);
      const result = vec1.add(vec2);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });

    it('should not modify the original vectors', () => {
      const vec1 = new Vec2(1, 2);
      const vec2 = new Vec2(3, 4);
      vec1.add(vec2);
      expect(vec1.x).toBe(1);
      expect(vec1.y).toBe(2);
      expect(vec2.x).toBe(3);
      expect(vec2.y).toBe(4);
    });
  });

  describe('subtract', () => {
    it('should subtract the second vector from the first', () => {
      const vec1 = new Vec2(5, 7);
      const vec2 = new Vec2(2, 3);
      const result = vec1.subtract(vec2);
      expect(result.x).toBe(3);
      expect(result.y).toBe(4);
    });

    it('should not modify the original vectors', () => {
      const vec1 = new Vec2(5, 7);
      const vec2 = new Vec2(2, 3);
      vec1.subtract(vec2);
      expect(vec1.x).toBe(5);
      expect(vec1.y).toBe(7);
      expect(vec2.x).toBe(2);
      expect(vec2.y).toBe(3);
    });
  });

  describe('scale', () => {
    it('should scale the vector by a scalar value', () => {
      const vec = new Vec2(2, 3);
      const result = vec.scale(2);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });

    it('should not modify the original vector', () => {
      const vec = new Vec2(2, 3);
      vec.scale(2);
      expect(vec.x).toBe(2);
      expect(vec.y).toBe(3);
    });
  });

  describe('length', () => {
    it('should calculate the length of the vector', () => {
      const vec = new Vec2(3, 4);
      expect(vec.length()).toBe(5);
    });

    it('should return 0 for a zero vector', () => {
      const vec = new Vec2(0, 0);
      expect(vec.length()).toBe(0);
    });
  });

  describe('lengthSquared', () => {
    it('should calculate the squared length of the vector', () => {
      const vec = new Vec2(3, 4);
      expect(vec.lengthSquared()).toBe(25);
    });

    it('should return 0 for a zero vector', () => {
      const vec = new Vec2(0, 0);
      expect(vec.lengthSquared()).toBe(0);
    });
  });

  describe('normalize', () => {
    it('should normalize the vector to unit length', () => {
      const vec = new Vec2(3, 4);
      const result = vec.normalize();
      expect(result.x).toBeCloseTo(0.6);
      expect(result.y).toBeCloseTo(0.8);
      expect(result.length()).toBeCloseTo(1);
    });

    it('should return a zero vector when normalizing a zero vector', () => {
      const vec = new Vec2(0, 0);
      const result = vec.normalize();
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('should not modify the original vector', () => {
      const vec = new Vec2(3, 4);
      vec.normalize();
      expect(vec.x).toBe(3);
      expect(vec.y).toBe(4);
    });
  });

  describe('dot', () => {
    it('should calculate the dot product of two vectors', () => {
      const vec1 = new Vec2(2, 3);
      const vec2 = new Vec2(4, 5);
      expect(vec1.dot(vec2)).toBe(23); // 2*4 + 3*5 = 8 + 15 = 23
    });

    it('should return 0 for perpendicular vectors', () => {
      const vec1 = new Vec2(1, 0);
      const vec2 = new Vec2(0, 1);
      expect(vec1.dot(vec2)).toBe(0);
    });
  });

  describe('copy', () => {
    it('should create a copy of the vector', () => {
      const vec = new Vec2(2, 3);
      const copy = vec.copy();
      expect(copy.x).toBe(2);
      expect(copy.y).toBe(3);
      expect(copy).not.toBe(vec); // Check that it's a new object
    });

    it('should not be affected by changes to the original', () => {
      const vec = new Vec2(2, 3);
      const copy = vec.copy();
      vec.x = 5;
      vec.y = 6;
      expect(copy.x).toBe(2);
      expect(copy.y).toBe(3);
    });
  });
});