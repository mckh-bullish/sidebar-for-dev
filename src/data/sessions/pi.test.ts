import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readPiSessions } from './pi';

function makeTmpDir() {
  const dir = join(tmpdir(), `pi-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('pi sessions', () => {
  describe('readPiSessions', () => {
    it('reads assistant usage and cost from pi jsonl session', () => {
      const sessionsDir = makeTmpDir();
      const projectFolder = '--Users-me-myproject--';
      const projectDir = join(sessionsDir, projectFolder);
      mkdirSync(projectDir);

      const sessionId = 'aabbccdd-1234-5678-abcd-ef0123456789';
      const ts = '2026-06-18T10:00:00.000Z';

      const lines = [
        // SessionHeader (line 1)
        JSON.stringify({ type: 'session', version: 3, id: sessionId, timestamp: ts, cwd: '/Users/me/myproject' }),
        // User message entry
        JSON.stringify({
          type: 'message',
          id: 'a1b2c3d4',
          parentId: null,
          timestamp: ts,
          message: { role: 'user', content: 'Build me a feature', timestamp: Date.now() },
        }),
        // Assistant message with usage+cost
        JSON.stringify({
          type: 'message',
          id: 'b2c3d4e5',
          parentId: 'a1b2c3d4',
          timestamp: ts,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Sure! Here is the feature.' }],
            api: 'anthropic',
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            usage: {
              input: 2000,
              output: 500,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 2500,
              cost: { input: 0.006, output: 0.0075, cacheRead: 0, cacheWrite: 0, total: 0.0135 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
          },
        }),
      ].join('\n');

      writeFileSync(join(projectDir, `${ts}_${sessionId}.jsonl`), lines);

      const sessions = readPiSessions(sessionsDir, new Date('2026-01-01'));
      expect(sessions).toHaveLength(1);

      const s = sessions[0];
      expect(s.id).toBe(sessionId);
      expect(s.tool).toBe('pi');
      expect(s.project).toBe('/Users/me/myproject');
      expect(s.inputTokens).toBe(2000);
      expect(s.outputTokens).toBe(500);
      expect(s.cost).toBeCloseTo(0.0135, 6);
      expect(s.costRecorded).toBe(true);
      expect(s.model).toBe('claude-sonnet-4-6');
    });

    it('excludes empty sessions', () => {
      const sessionsDir = makeTmpDir();
      const projectDir = join(sessionsDir, '--Users-me-empty--');
      mkdirSync(projectDir);

      const ts = '2026-06-18T10:00:00.000Z';
      const id = 'empty-sess-id';
      const lines = [
        JSON.stringify({ type: 'session', version: 3, id, timestamp: ts, cwd: '/Users/me/empty' }),
      ].join('\n');
      writeFileSync(join(projectDir, `${ts}_${id}.jsonl`), lines);

      const sessions = readPiSessions(sessionsDir, new Date('2026-01-01'));
      expect(sessions).toHaveLength(0);
    });

    it('excludes sessions older than cutoff', () => {
      const sessionsDir = makeTmpDir();
      const projectDir = join(sessionsDir, '--Users-me-old--');
      mkdirSync(projectDir);

      const ts = '2025-01-01T10:00:00.000Z'; // old
      const id = 'old-id-1234-5678-abcd';
      const lines = [
        JSON.stringify({ type: 'session', version: 3, id, timestamp: ts, cwd: '/Users/me/old' }),
        JSON.stringify({
          type: 'message', id: 'aa', parentId: null, timestamp: ts,
          message: { role: 'user', content: 'hello', timestamp: 1 },
        }),
        JSON.stringify({
          type: 'message', id: 'bb', parentId: 'aa', timestamp: ts,
          message: {
            role: 'assistant', content: [{ type: 'text', text: 'hi' }],
            model: 'claude-haiku-4-5', api: 'anthropic', provider: 'anthropic',
            usage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 110, cost: { input: 0.001, output: 0.0001, cacheRead: 0, cacheWrite: 0, total: 0.0011 } },
            stopReason: 'stop', timestamp: 1,
          },
        }),
      ].join('\n');
      writeFileSync(join(projectDir, `${ts}_${id}.jsonl`), lines);

      const sessions = readPiSessions(sessionsDir, new Date('2026-06-01'));
      expect(sessions).toHaveLength(0);
    });

    it('extracts both user and assistant snippets', () => {
      const sessionsDir = makeTmpDir();
      const projectDir = join(sessionsDir, '--Users-me-snippet--');
      mkdirSync(projectDir);

      const ts = '2026-06-18T12:00:00.000Z';
      const id = 'snippet-id-pi-1234';
      const lines = [
        JSON.stringify({ type: 'session', version: 3, id, timestamp: ts, cwd: '/Users/me/snippet' }),
        JSON.stringify({
          type: 'message', id: 'u1', parentId: null, timestamp: ts,
          message: { role: 'user', content: 'What is PI?', timestamp: Date.now() },
        }),
        JSON.stringify({
          type: 'message', id: 'a1', parentId: 'u1', timestamp: ts,
          message: {
            role: 'assistant', content: [{ type: 'text', text: '3.14159...' }],
            model: 'claude-haiku-4-5', api: 'anthropic', provider: 'anthropic',
            usage: { input: 50, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 60, cost: { input: 0.00004, output: 0.00004, cacheRead: 0, cacheWrite: 0, total: 0.00008 } },
            stopReason: 'stop', timestamp: Date.now(),
          },
        }),
      ].join('\n');
      writeFileSync(join(projectDir, `${ts}_${id}.jsonl`), lines);

      const sessions = readPiSessions(sessionsDir, new Date('2026-01-01'));
      expect(sessions[0].messages).toHaveLength(2);
      expect(sessions[0].messages[0].role).toBe('user');
      expect(sessions[0].messages[0].text).toBe('What is PI?');
      expect(sessions[0].messages[1].role).toBe('assistant');
      expect(sessions[0].messages[1].text).toBe('3.14159...');
    });
  });
});
