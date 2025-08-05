import { clamp, lerp, remap, blendColors, blendWhite, rgbToHex, rgbaToHex, rgbArrayToHex, rgbaArrayToHex } from '../MathUtils';

describe('MathUtils', () => {
  describe('clamp', () => {
    it('should return the value if it is within the range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should return the min value if the value is less than min', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should return the max value if the value is greater than max', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should handle equal min and max values', () => {
      expect(clamp(5, 7, 7)).toBe(7);
    });
  });

  describe('lerp', () => {
    it('should linearly interpolate between two values', () => {
      expect(lerp(0, 10, 0.5)).toBe(5);
    });

    it('should return the first value when t is 0', () => {
      expect(lerp(5, 10, 0)).toBe(5);
    });

    it('should return the second value when t is 1', () => {
      expect(lerp(5, 10, 1)).toBe(10);
    });

    it('should extrapolate when t is outside [0, 1]', () => {
      expect(lerp(0, 10, 2)).toBe(20);
      expect(lerp(0, 10, -1)).toBe(-10);
    });
  });

  describe('remap', () => {
    it('should remap a value from one range to another', () => {
      expect(remap(5, 0, 10, 0, 100)).toBe(50);
    });

    it('should handle the lower bound of the input range', () => {
      expect(remap(0, 0, 10, 0, 100)).toBe(0);
    });

    it('should handle the upper bound of the input range', () => {
      expect(remap(10, 0, 10, 0, 100)).toBe(100);
    });

    it('should handle values outside the input range', () => {
      expect(remap(-5, 0, 10, 0, 100)).toBe(-50);
      expect(remap(15, 0, 10, 0, 100)).toBe(150);
    });

    it('should handle decreasing output range', () => {
      expect(remap(5, 0, 10, 100, 0)).toBe(50);
    });
  });

  describe('blendColors', () => {
    it('should blend two RGB colors', () => {
      const color1 = [100, 150, 200];
      const color2 = [200, 100, 50];
      const result = blendColors(color1, color2, 0.5);
      expect(result).toEqual([150, 125, 125, 255]);
    });

    it('should return the first color when t is 0', () => {
      const color1 = [100, 150, 200];
      const color2 = [200, 100, 50];
      const result = blendColors(color1, color2, 0);
      expect(result).toEqual([100, 150, 200, 255]);
    });

    it('should return the second color when t is 1', () => {
      const color1 = [100, 150, 200];
      const color2 = [200, 100, 50];
      const result = blendColors(color1, color2, 1);
      expect(result).toEqual([200, 100, 50, 255]);
    });

    it('should blend RGBA colors and preserve alpha', () => {
      const color1 = [100, 150, 200, 128];
      const color2 = [200, 100, 50, 255];
      const result = blendColors(color1, color2, 0.5);
      expect(result).toEqual([150, 125, 125, 191.5]);
    });
  });

  describe('blendWhite', () => {
    it('should blend a color with white', () => {
      const color = [100, 150, 200];
      const result = blendWhite(color, 0.5);
      expect(result).toEqual([177.5, 202.5, 227.5, 255]);
    });

    it('should return the original color when t is 0', () => {
      const color = [100, 150, 200];
      const result = blendWhite(color, 0);
      expect(result).toEqual([100, 150, 200, 255]);
    });

    it('should return white when t is 1', () => {
      const color = [100, 150, 200];
      const result = blendWhite(color, 1);
      expect(result).toEqual([255, 255, 255, 255]);
    });
  });

  describe('rgbToHex', () => {
    it('should convert RGB values to a hex color string', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
      expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
      expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
      expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
    });

    it('should handle non-integer values by truncating', () => {
      expect(rgbToHex(255.9, 0.1, 0.9)).toBe('#ff0000');
    });
  });

  describe('rgbaToHex', () => {
    it('should convert RGBA values to a hex color string with alpha', () => {
      expect(rgbaToHex(255, 0, 0, 1)).toBe('#ff0000ff');
      expect(rgbaToHex(0, 255, 0, 0.5)).toBe('#00ff0080');
      expect(rgbaToHex(0, 0, 255, 0)).toBe('#0000ff00');
    });

    it('should handle non-integer values by rounding', () => {
      expect(rgbaToHex(255, 0, 0, 0.51)).toBe('#ff000082');
    });
  });

  describe('rgbArrayToHex', () => {
    it('should convert an RGB array to a hex color string', () => {
      expect(rgbArrayToHex([255, 0, 0])).toBe('#ff0000');
      expect(rgbArrayToHex([0, 255, 0])).toBe('#00ff00');
      expect(rgbArrayToHex([0, 0, 255])).toBe('#0000ff');
    });

    it('should clamp values to the valid range', () => {
      expect(rgbArrayToHex([300, -10, 1000])).toBe('#ff00ff');
    });
  });

  describe('rgbaArrayToHex', () => {
    it('should convert an RGBA array to a hex color string with alpha', () => {
      expect(rgbaArrayToHex([255, 0, 0, 255])).toBe('#ff0000ff');
      expect(rgbaArrayToHex([0, 255, 0, 128])).toBe('#00ff0080');
    });

    it('should use alpha 1 if not provided', () => {
      expect(rgbaArrayToHex([0, 0, 255])).toBe('#0000ffff');
    });

    it('should clamp values to the valid range', () => {
      expect(rgbaArrayToHex([300, -10, 1000, 300])).toBe('#ff00ffff');
    });
  });
});