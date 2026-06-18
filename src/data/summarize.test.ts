import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeContentHash, loadSummaryCache, saveSummaryCache, needsResummarization } from './summarize';
import type { NormalizedSession } from './sessions/types';

function makeSession(id: string, messages: Array<{ role: 'user' | 'assistant'; text: string }>): NormalizedSession {
  return {
    id,
    tool: 'claude',
    project: '/test',
    lastActivity: new Date(),
    inputTokens: 100,
    outputTokens: 20,
    cost: 0.001,
    costRecorded: true,
    model: 'claude-haiku-4-5',
    messages: messages.map(m => ({ ...m, timestamp: new Date() })),
  };
}

describe('summarize', () => {
  let cacheDir: string;
  let cachePath: string;

  beforeEach(() => {
    cacheDir = join(tmpdir(), `summarize-test-${Date.now()}`);
    mkdirSync(cacheDir, { recursive: true });
    cachePath = join(cacheDir, 'summaries.json');
  });

  describe('computeContentHash', () => {
    it('returns same hash for same messages', () => {
      const s = makeSession('s1', [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'world' }]);
      const h1 = computeContentHash(s);
      const h2 = computeContentHash(s);
      expect(h1).toBe(h2);
    });

    it('returns different hash for different messages', () => {
      const s1 = makeSession('s1', [{ role: 'user', text: 'foo' }]);
      const s2 = makeSession('s1', [{ role: 'user', text: 'bar' }]);
      expect(computeContentHash(s1)).not.toBe(computeContentHash(s2));
    });

    it('returns a non-empty string', () => {
      const s = makeSession('s1', [{ role: 'user', text: 'test' }]);
      expect(computeContentHash(s).length).toBeGreaterThan(0);
    });
  });

  describe('loadSummaryCache', () => {
    it('returns empty object when cache file does not exist', () => {
      const cache = loadSummaryCache(join(cacheDir, 'missing.json'));
      expect(cache).toEqual({});
    });

    it('loads cached summaries from disk', () => {
      const data = { 'sess-1': { summary: 'old summary', hash: 'abc123' } };
      writeFileSync(cachePath, JSON.stringify(data));
      const cache = loadSummaryCache(cachePath);
      expect(cache['sess-1']?.summary).toBe('old summary');
    });
  });

  describe('saveSummaryCache', () => {
    it('writes cache to disk', () => {
      const cache = { 'sess-1': { summary: 'new summary', hash: 'def456' } };
      saveSummaryCache(cache, cachePath);
      const loaded = JSON.parse(readFileSync(cachePath, 'utf-8'));
      expect(loaded['sess-1'].summary).toBe('new summary');
    });
  });

  describe('needsResummarization', () => {
    it('returns true when session not in cache', () => {
      const s = makeSession('new-sess', [{ role: 'user', text: 'hello' }]);
      const cache = {};
      expect(needsResummarization(s, cache)).toBe(true);
    });

    it('returns false when hash matches cached hash', () => {
      const s = makeSession('s1', [{ role: 'user', text: 'same content' }]);
      const hash = computeContentHash(s);
      const cache = { 's1': { summary: 'cached', hash } };
      expect(needsResummarization(s, cache)).toBe(false);
    });

    it('returns true when content changed (hash mismatch)', () => {
      const s = makeSession('s1', [{ role: 'user', text: 'new content added' }]);
      const cache = { 's1': { summary: 'old', hash: 'stale-hash' } };
      expect(needsResummarization(s, cache)).toBe(true);
    });

    it('returns true when force=true even if hash matches', () => {
      const s = makeSession('s1', [{ role: 'user', text: 'same' }]);
      const hash = computeContentHash(s);
      const cache = { 's1': { summary: 'cached', hash } };
      expect(needsResummarization(s, cache, true)).toBe(true);
    });
  });
});
