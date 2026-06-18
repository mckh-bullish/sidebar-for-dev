import { describe, it, expect } from 'vitest';
import { mergeSessions } from './index';
import type { NormalizedSession } from './types';

function makeSession(overrides: Partial<NormalizedSession> & { id: string; tool: NormalizedSession['tool'] }): NormalizedSession {
  return {
    project: '/test',
    lastActivity: new Date(),
    inputTokens: 100,
    outputTokens: 20,
    cost: 0.001,
    costRecorded: true,
    model: 'claude-haiku-4-5',
    messages: [],
    ...overrides,
  };
}

describe('session index', () => {
  describe('mergeSessions', () => {
    it('merges claude, pi, and opencode sessions and sorts by lastActivity descending', () => {
      const now = Date.now();
      const sessions = mergeSessions(
        [makeSession({ id: 'claude-1', tool: 'claude', lastActivity: new Date(now - 1000) })],
        [makeSession({ id: 'pi-1', tool: 'pi', lastActivity: new Date(now - 3000) })],
        [makeSession({ id: 'oc-1', tool: 'opencode', lastActivity: new Date(now - 2000) })],
      );

      expect(sessions).toHaveLength(3);
      expect(sessions[0].id).toBe('claude-1');
      expect(sessions[1].id).toBe('oc-1');
      expect(sessions[2].id).toBe('pi-1');
    });

    it('handles empty arrays from any source', () => {
      const sessions = mergeSessions([], [], [makeSession({ id: 'oc', tool: 'opencode' })]);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('oc');
    });

    it('returns empty array when all sources empty', () => {
      const sessions = mergeSessions([], [], []);
      expect(sessions).toHaveLength(0);
    });

    it('filters sessions older than cutoff', () => {
      const old = new Date('2020-01-01');
      const fresh = new Date();
      const sessions = mergeSessions(
        [makeSession({ id: 'old', tool: 'claude', lastActivity: old })],
        [makeSession({ id: 'fresh', tool: 'pi', lastActivity: fresh })],
        [],
        new Date(Date.now() - 1000),
      );
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('fresh');
    });
  });
});
