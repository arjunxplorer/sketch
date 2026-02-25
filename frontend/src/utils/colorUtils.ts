/**
 * Color manipulation utilities.
 */

/**
 * Pre-defined color palette matching backend.
 * Colors are assigned in order as users join.
 */
export const COLOR_PALETTE = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33F5', '#F5FF33',
  '#33FFF5', '#FF8C33', '#8C33FF', '#33FF8C', '#FF338C',
  '#338CFF', '#8CFF33', '#FF3333', '#33FF33', '#3333FF',
] as const;

/**
 * Parse hex color to RGB components.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result || !result[1] || !result[2] || !result[3]) {
    return null;
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB to hex color string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Adjust color brightness.
 * @param hex - Hex color string
 * @param percent - Percentage to adjust (-100 to 100)
 */
export function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const factor = 1 + percent / 100;
  return rgbToHex(
    rgb.r * factor,
    rgb.g * factor,
    rgb.b * factor
  );
}

/**
 * Get contrasting text color (black or white) for a background.
 */
export function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';

  // Calculate relative luminance
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Add alpha channel to hex color.
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Generate a random color from the palette.
 */
export function getRandomColor(): string {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]!;
}

/**
 * Default pen colors for the toolbar.
 */
export const PEN_COLORS = [
  '#FFFFFF', // White (default for dark background)
  '#000000', // Black
  '#EF4444', // Red
  '#F59E0B', // Orange
  '#22C55E', // Green
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
] as const;

/**
 * Default stroke widths for the toolbar.
 */
export const STROKE_WIDTHS = [2, 4, 6, 8, 12] as const;

