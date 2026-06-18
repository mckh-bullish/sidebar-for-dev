import { describe, it, expect, vi } from 'vitest';
import type { CostDay } from './litellm';

describe('litellm', () => {
  describe('parseSpendLogs', () => {
    it('groups spend by date and model', () => {
      const fixture = [
        {
          start_date: '2026-06-17',
          end_date: '2026-06-18',
          models: {
            'vertex_ai/claude-sonnet-4-6': 33.16,
            'vertex_ai/claude-haiku-4-5': 44.90,
            'vertex_ai/claude-opus-4-8': 22.94,
          },
          spend: 101.01,
        },
      ];

      const result: CostDay[] = [];
      for (const day of fixture) {
        const cost = day.spend;
        for (const [model, spend] of Object.entries(day.models)) {
          const existing = result.find(r => r.date === day.start_date);
          if (existing) {
            existing.models.push({ model: model.replace(/^vertex_ai\//, ''), spend });
          } else {
            result.push({
              date: day.start_date ?? '',
              total: cost,
              models: [{ model: model.replace(/^vertex_ai\//, ''), spend }],
            });
          }
        }
      }

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-06-17');
      expect(result[0].total).toBe(101.01);
      expect(result[0].models).toHaveLength(3);
      expect(result[0].models[0]).toEqual({ model: 'claude-sonnet-4-6', spend: 33.16 });
    });

    it('handles multiple date ranges', () => {
      const fixture = [
        {
          start_date: '2026-06-16',
          end_date: '2026-06-17',
          models: { 'vertex_ai/claude-sonnet-4-6': 10.0 },
          spend: 10.0,
        },
        {
          start_date: '2026-06-17',
          end_date: '2026-06-18',
          models: { 'vertex_ai/claude-opus-4-8': 5.0 },
          spend: 5.0,
        },
      ];

      const result: CostDay[] = [];
      for (const day of fixture) {
        const cost = day.spend;
        for (const [model, spend] of Object.entries(day.models)) {
          const existing = result.find(r => r.date === day.start_date);
          if (existing) {
            existing.models.push({ model: model.replace(/^vertex_ai\//, ''), spend });
          } else {
            result.push({
              date: day.start_date ?? '',
              total: cost,
              models: [{ model: model.replace(/^vertex_ai\//, ''), spend }],
            });
          }
        }
      }

      expect(result).toHaveLength(2);
      expect(result.map(r => r.date)).toEqual(['2026-06-16', '2026-06-17']);
    });

    it('handles empty response', () => {
      const fixture: Array<{ start_date?: string; end_date?: string; models?: Record<string, number>; spend?: number }> = [];
      const result: CostDay[] = [];
      for (const day of fixture) {
        const cost = day.spend ?? 0;
        for (const [model, spend] of Object.entries(day.models ?? {})) {
          const existing = result.find(r => r.date === day.start_date);
          if (existing) {
            existing.models.push({ model: model.replace(/^vertex_ai\//, ''), spend });
          } else {
            result.push({
              date: day.start_date ?? '',
              total: cost,
              models: [{ model: model.replace(/^vertex_ai\//, ''), spend }],
            });
          }
        }
      }
      expect(result).toHaveLength(0);
    });
  });
});
