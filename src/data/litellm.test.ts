import { describe, it, expect } from 'vitest';
import { parseDailyActivity } from './litellm';
import type { CostDay } from './litellm';

const makeResponse = (results: Array<{
  date: string;
  spend: number;
  models: Record<string, number>;
}>) => ({
  results: results.map(r => ({
    date: r.date,
    metrics: { spend: r.spend },
    breakdown: {
      models: Object.fromEntries(
        Object.entries(r.models).map(([m, s]) => [m, { metrics: { spend: s } }]),
      ),
    },
  })),
});

describe('litellm', () => {
  describe('parseDailyActivity', () => {
    it('parses date and per-model spend correctly', () => {
      const response = makeResponse([{
        date: '2026-06-18',
        spend: 101.01,
        models: {
          'vertex_ai/claude-sonnet-4-6': 33.16,
          'vertex_ai/claude-haiku-4-5': 44.90,
          'vertex_ai/claude-opus-4-8': 22.94,
        },
      }]);

      const result: CostDay[] = parseDailyActivity(response);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-06-18');
      expect(result[0].total).toBe(101.01);
      expect(result[0].models).toHaveLength(3);
      expect(result[0].models.find(m => m.model === 'claude-sonnet-4-6')?.spend).toBe(33.16);
    });

    it('strips vertex_ai/ prefix from model names', () => {
      const response = makeResponse([{
        date: '2026-06-18', spend: 5,
        models: { 'vertex_ai/claude-haiku-4-5': 5 },
      }]);
      const result = parseDailyActivity(response);
      expect(result[0].models[0].model).toBe('claude-haiku-4-5');
    });

    it('strips date suffixes from model names', () => {
      const response = makeResponse([{
        date: '2026-06-18', spend: 5,
        models: { 'claude-haiku-4-5-20251001': 5 },
      }]);
      const result = parseDailyActivity(response);
      expect(result[0].models[0].model).toBe('claude-haiku-4-5');
    });

    it('merges duplicate model names after stripping', () => {
      const response = makeResponse([{
        date: '2026-06-18', spend: 10,
        models: {
          'claude-haiku-4-5-20251001': 4,
          'vertex_ai/claude-haiku-4-5': 6,
        },
      }]);
      const result = parseDailyActivity(response);
      expect(result[0].models).toHaveLength(1);
      expect(result[0].models[0].model).toBe('claude-haiku-4-5');
      expect(result[0].models[0].spend).toBeCloseTo(10, 5);
    });

    it('filters out zero-spend models', () => {
      const response = makeResponse([{
        date: '2026-06-18', spend: 5,
        models: { 'vertex_ai/claude-haiku-4-5': 5, 'vertex_ai/claude-opus-4-8': 0 },
      }]);
      const result = parseDailyActivity(response);
      expect(result[0].models).toHaveLength(1);
    });

    it('handles multiple dates', () => {
      const response = makeResponse([
        { date: '2026-06-17', spend: 10, models: { 'vertex_ai/claude-sonnet-4-6': 10 } },
        { date: '2026-06-18', spend: 5, models: { 'vertex_ai/claude-opus-4-8': 5 } },
      ]);
      const result = parseDailyActivity(response);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.date)).toEqual(['2026-06-17', '2026-06-18']);
    });

    it('handles empty results', () => {
      expect(parseDailyActivity({ results: [] })).toHaveLength(0);
    });
  });
});
