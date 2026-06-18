import type { Settings } from './config';

/** High-contrast ANSI colors for model differentiation */
export const HIGH_CONTRAST_COLORS = [
  'cyan', 'magenta', 'green', 'yellow',
  'blue', 'red', 'white', 'gray',
] as const;

/**
 * Calculate cost from token counts and pricing table.
 * @param inputTokens - Base input tokens
 * @param outputTokens - Output tokens generated
 * @param modelPricing - Pricing map from settings
 * @param modelName - Model name (vertex_ai/ prefix stripped automatically)
 * @param recordedCost - If non-null, returned directly (bypasses calculation)
 * @param cacheReadTokens - Cache read tokens (cheaper)
 * @param cacheWriteTokens - Cache write tokens (slightly more expensive)
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  modelPricing: Settings['modelPricing'],
  modelName: string,
  recordedCost?: number | null,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  if (recordedCost !== undefined && recordedCost !== null) {
    return recordedCost;
  }

  const key = modelName.replace(/^vertex_ai\//, '');
  const pricing = modelPricing[key];
  if (!pricing) {
    return 0;
  }

  const cacheReadRate = pricing.cacheRead ?? pricing.input * 0.1;
  const cacheWriteRate = pricing.cacheWrite ?? pricing.input * 1.25;

  return (inputTokens / 1_000_000) * pricing.input
    + (outputTokens / 1_000_000) * pricing.output
    + (cacheReadTokens / 1_000_000) * cacheReadRate
    + (cacheWriteTokens / 1_000_000) * cacheWriteRate;
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

  if (modelColors[key]) {
    return modelColors[key];
  }

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }

  return HIGH_CONTRAST_COLORS[Math.abs(hash) % HIGH_CONTRAST_COLORS.length];
}
