import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readClaudeSessions } from './claude';

function makeTmpDir() {
  const dir = join(tmpdir(), `claude-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('claude sessions', () => {
  describe('readClaudeSessions', () => {
    it('reads assistant usage from jsonl and returns session', () => {
      const dir = makeTmpDir();
      const projectDir = join(dir, '-Users-me-myproject');
      mkdirSync(projectDir);

      const sessionId = 'abc-def-123';
      const lines = [
        JSON.stringify({ type: 'mode', mode: 'normal', sessionId }),
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            model: 'claude-sonnet-4-5',
            content: [{ type: 'text', text: 'Hello world' }],
            usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
          costUSD: 0.005,
          sessionId,
        }),
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] },
          sessionId,
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            model: 'claude-sonnet-4-5',
            content: [{ type: 'text', text: '4' }],
            usage: { input_tokens: 500, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
          costUSD: 0.002,
          sessionId,
        }),
      ].join('\n');

      const sessionFile = join(projectDir, `${sessionId}.jsonl`);
      writeFileSync(sessionFile, lines);

      const sessions = readClaudeSessions(dir, new Date(0));
      expect(sessions).toHaveLength(1);

      const s = sessions[0];
      expect(s.id).toBe(sessionId);
      expect(s.tool).toBe('claude');
      expect(s.inputTokens).toBe(1500);
      expect(s.outputTokens).toBe(210);
      expect(s.cost).toBeCloseTo(0.007, 5);
      expect(s.costRecorded).toBe(true);
      expect(s.model).toBe('claude-sonnet-4-5');
      expect(s.project).toBe('/Users/me/myproject');
    });

    it('excludes sessions with no activity within cutoff', () => {
      const dir = makeTmpDir();
      const projectDir = join(dir, '-Users-me-old');
      mkdirSync(projectDir);

      const sessionId = 'old-session';
      const lines = [
        JSON.stringify({ type: 'mode', mode: 'normal', sessionId }),
      ].join('\n');

      writeFileSync(join(projectDir, `${sessionId}.jsonl`), lines);

      // Cutoff = now (anything without timestamps will have no lastActivity and should be excluded)
      const sessions = readClaudeSessions(dir, new Date());
      expect(sessions).toHaveLength(0);
    });

    it('uses file mtime as lastActivity fallback', () => {
      const dir = makeTmpDir();
      const projectDir = join(dir, '-Users-me-proj2');
      mkdirSync(projectDir);
      const sessionId = 'ts-session';
      const ts = '2026-06-18T10:00:00.000Z';
      const lines = [
        JSON.stringify({ type: 'mode', mode: 'normal', sessionId }),
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            model: 'claude-opus-4-8',
            content: [{ type: 'text', text: 'hi' }],
            usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
          costUSD: 0.001,
          sessionId,
          timestamp: ts,
        }),
      ].join('\n');
      writeFileSync(join(projectDir, `${sessionId}.jsonl`), lines);
      const sessions = readClaudeSessions(dir, new Date('2026-01-01'));
      expect(sessions).toHaveLength(1);
      expect(sessions[0].lastActivity.toISOString()).toBe(ts);
    });

    it('returns message snippets for user and assistant turns', () => {
      const dir = makeTmpDir();
      const projectDir = join(dir, '-Users-me-snippets');
      mkdirSync(projectDir);
      const sessionId = 'snippet-session';
      const lines = [
        JSON.stringify({ type: 'mode', mode: 'normal', sessionId }),
        JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Tell me a joke' }] }, sessionId }),
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            model: 'claude-haiku-4-5',
            content: [{ type: 'text', text: 'Why did the chicken cross?' }],
            usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
          costUSD: 0.0001,
          sessionId,
        }),
      ].join('\n');
      writeFileSync(join(projectDir, `${sessionId}.jsonl`), lines);
      const sessions = readClaudeSessions(dir, new Date(0));
      expect(sessions[0].messages).toHaveLength(2);
      expect(sessions[0].messages[0].role).toBe('user');
      expect(sessions[0].messages[0].text).toBe('Tell me a joke');
      expect(sessions[0].messages[1].role).toBe('assistant');
    });
  });
});
