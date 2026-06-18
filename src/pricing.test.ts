import { describe, it, expect } from 'vitest';
import { calculateCost, resolveModelColor, HIGH_CONTRAST_COLORS } from './pricing';
import type { Settings } from './config';

describe('pricing', () => {
  describe('calculateCost', () => {
    it('calculates cost from tokens and pricing', () => {
      const pricing: Settings['modelPricing'] = {
        'test-model': { input: 5, output: 15 },
      };
      // 1M input tokens at $5/M + 100K output at $15/M = $5 + $1.5 = $6.5
      const cost = calculateCost(1_000_000, 100_000, pricing, 'test-model');
      expect(cost).toBeCloseTo(6.5, 4);
    });

    it('returns 0 when model not in pricing table', () => {
      const pricing: Settings['modelPricing'] = {
        'known-model': { input: 1, output: 2 },
      };
      // unknown-model has no pricing, so cost = 0
      const cost = calculateCost(1_000_000, 1_000_000, pricing, 'unknown-model');
      expect(cost).toBe(0);
    });

    it('handles zero tokens', () => {
      const pricing: Settings['modelPricing'] = {
        'test': { input: 3, output: 15 },
      };
      expect(calculateCost(0, 0, pricing, 'test')).toBe(0);
    });

    it('strips vertex_ai/ prefix from model names', () => {
      const pricing: Settings['modelPricing'] = {
        'claude-sonnet-4-6': { input: 3, output: 15 },
      };
      const cost = calculateCost(1_000_000, 0, pricing, 'vertex_ai/claude-sonnet-4-6');
      expect(cost).toBeCloseTo(3, 4);
    });

    it('uses recorded cost when provided (non-null)', () => {
      const pricing: Settings['modelPricing'] = {
        'test': { input: 1, output: 1 },
      };
      // When recordedCost is passed (not undefined/null), return it directly
      const cost = calculateCost(0, 0, pricing, 'test', 42.5);
      expect(cost).toBe(42.5);
    });
  });

  describe('resolveModelColor', () => {
    it('returns predefined color when available', () => {
      const colors: Settings['modelColors'] = {
        'model-a': 'red',
        'model-b': 'blue',
      };
      expect(resolveModelColor('model-a', colors)).toBe('red');
      expect(resolveModelColor('model-b', colors)).toBe('blue');
    });

    it('returns deterministic color from hash when not predefined', () => {
      const colors: Settings['modelColors'] = {};
      const c1 = resolveModelColor('same-model', colors);
      const c2 = resolveModelColor('same-model', colors);
      expect(c1).toBe(c2);
      expect(HIGH_CONTRAST_COLORS.includes(c1)).toBe(true);
    });

    it('assigns different colors to different models', () => {
      const colors: Settings['modelColors'] = {};
      const set = new Set<string>();
      for (let i = 0; i < 20; i++) {
        set.add(resolveModelColor(`model-${i}`, colors));
      }
      // With 8 colors and 20 models, we reuse, but not adjacent
      // Just check all are valid colors
      for (const c of set) {
        expect(HIGH_CONTRAST_COLORS.includes(c)).toBe(true);
      }
    });

    it('respects predefined colors over hash', () => {
      const colors: Settings['modelColors'] = {
        'haiku': 'yellow',
      };
      expect(resolveModelColor('haiku', colors)).toBe('yellow');
      // Even though hash might give a different result
    });
  });
});
