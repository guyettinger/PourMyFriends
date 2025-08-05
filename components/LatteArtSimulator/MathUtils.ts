/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between a and b by t
 */
export function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * Remap a value from one range to another
 */
export function remap(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number
): number {
  const t = (value - fromLow) / (fromHigh - fromLow);
  return lerp(toLow, toHigh, t);
}

/**
 * Blend two colors together
 */
export function blendColors(
  color1: number[],
  color2: number[],
  t: number
): number[] {
  return [
    lerp(color1[0], color2[0], t),
    lerp(color1[1], color2[1], t),
    lerp(color1[2], color2[2], t),
    color1.length > 3 && color2.length > 3 ? lerp(color1[3], color2[3], t) : 255,
  ];
}

/**
 * Blend a color with white
 */
export function blendWhite(color: number[], t: number): number[] {
  return blendColors(color, [255, 255, 255, 255], t);
}

/**
 * Convert RGB values to a hex color string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (Math.floor(r) << 16) + (Math.floor(g) << 8) + Math.floor(b)).toString(16).slice(1)}`;
}

/**
 * Convert RGBA values to a hex color string with alpha
 */
export function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const alpha = Math.round(a * 255).toString(16).padStart(2, '0');
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}${alpha}`;
}

/**
 * Convert RGB array to a hex color string
 */
export function rgbArrayToHex(color: number[]): string {
  return rgbToHex(
    Math.round(clamp(color[0], 0, 255)),
    Math.round(clamp(color[1], 0, 255)),
    Math.round(clamp(color[2], 0, 255))
  );
}

/**
 * Convert RGBA array to a hex color string with alpha
 */
export function rgbaArrayToHex(color: number[]): string {
  return rgbaToHex(
    Math.round(clamp(color[0], 0, 255)),
    Math.round(clamp(color[1], 0, 255)),
    Math.round(clamp(color[2], 0, 255)),
    color.length > 3 ? clamp(color[3] / 255, 0, 1) : 1
  );
}