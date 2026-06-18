import type { Settings } from './config';

/** High-contrast ANSI colors for model differentiation */
export const HIGH_CONTRAST_COLORS = [
  'cyan', 'magenta', 'green', 'yellow',
  'blue', 'red', 'white', 'gray',
] as const;

/**
 * Calculate cost from token counts and pricing table.
 * @param inputTokens - Input tokens used
 * @param outputTokens - Output tokens generated
 * @param modelPricing - Pricing map from settings
 * @param modelName - Model name (vertex_ai/ prefix stripped automatically)
 * @param recordedCost - If non-null, returned directly (bypasses calculation)
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  modelPricing: Settings['modelPricing'],
  modelName: string,
  recordedCost?: number | null,
): number {
  if (recordedCost !== undefined && recordedCost !== null) {
    return recordedCost;
  }

  const key = modelName.replace(/^vertex_ai\//, '');
  const pricing = modelPricing[key];
  if (!pricing) {
    return 0;
  }

  return (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;
}

/**
 * Resolve the color for a model name. Uses predefined color from settings
 * if available, otherwise picks a deterministic color from the hash.
 */
export function resolveModelColor(
  modelName: string,
  modelColors: Settings['modelColors'],
): string {
  const key = modelName.replace(/^vertex_ai\//, '');

  // Check predefined colors first
  if (modelColors[key]) {
    return modelColors[key];
  }

  // Deterministic hash-based color assignment
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }

  return HIGH_CONTRAST_COLORS[Math.abs(hash) % HIGH_CONTRAST_COLORS.length];
}
