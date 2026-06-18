import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { readOpencodeSessionsFromDb } from './opencode';

function makeTestDb(): { dbPath: string; db: Database.Database } {
  const dir = join(tmpdir(), `opencode-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'opencode.db');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      workspace_id TEXT,
      parent_id TEXT,
      slug TEXT NOT NULL,
      directory TEXT NOT NULL,
      path TEXT,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      cost REAL DEFAULT 0 NOT NULL,
      tokens_input INTEGER DEFAULT 0 NOT NULL,
      tokens_output INTEGER DEFAULT 0 NOT NULL,
      tokens_cache_read INTEGER DEFAULT 0 NOT NULL,
      tokens_cache_write INTEGER DEFAULT 0 NOT NULL,
      model TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_archived INTEGER
    );

    CREATE TABLE session_message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      seq INTEGER NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    );
  `);

  return { dbPath, db };
}

describe('opencode sessions', () => {
  describe('readOpencodeSessionsFromDb', () => {
    it('reads cost, tokens, and model from session table', () => {
      const { dbPath, db } = makeTestDb();
      const now = Date.now();

      db.prepare(`
        INSERT INTO session (id, project_id, slug, directory, title, version, cost, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, model, time_created, time_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('sess1', 'proj1', 'sess-1', '/Users/me/proj', 'My Session', '1.0', 1.23, 5000, 1000, 0, 0, 'claude-sonnet-4-6', now - 1000, now);

      db.prepare(`
        INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('msg1', 'sess1', 'assistant', 1, now, now, JSON.stringify({ role: 'assistant', parts: [{ type: 'text', text: 'I can help.' }] }));

      db.prepare(`
        INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('msg2', 'sess1', 'user', 0, now - 2000, now, JSON.stringify({ role: 'user', parts: [{ type: 'text', text: 'Help me.' }] }));

      db.close();

      const sessions = readOpencodeSessionsFromDb(dbPath, new Date('2026-01-01'));
      expect(sessions).toHaveLength(1);
      const s = sessions[0];
      expect(s.id).toBe('sess1');
      expect(s.tool).toBe('opencode');
      expect(s.cost).toBeCloseTo(1.23, 3);
      expect(s.costRecorded).toBe(true);
      expect(s.inputTokens).toBe(5000);
      expect(s.outputTokens).toBe(1000);
      expect(s.model).toBe('claude-sonnet-4-6');
      expect(s.project).toBe('/Users/me/proj');
    });

    it('excludes archived sessions', () => {
      const { dbPath, db } = makeTestDb();
      const now = Date.now();

      db.prepare(`
        INSERT INTO session (id, project_id, slug, directory, title, version, cost, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, model, time_created, time_updated, time_archived)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('arch1', 'proj1', 'arch-1', '/Users/me/old', 'Old Session', '1.0', 0.5, 1000, 200, 0, 0, 'claude-haiku-4-5', now - 5000, now - 1000, now - 500);

      db.close();

      const sessions = readOpencodeSessionsFromDb(dbPath, new Date('2026-01-01'));
      expect(sessions).toHaveLength(0);
    });

    it('excludes sessions older than cutoff', () => {
      const { dbPath, db } = makeTestDb();
      const old = new Date('2025-01-01').getTime();

      db.prepare(`
        INSERT INTO session (id, project_id, slug, directory, title, version, cost, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, model, time_created, time_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('old1', 'proj1', 'old-1', '/Users/me/old', 'Old', '1.0', 0.01, 10, 5, 0, 0, 'claude-haiku-4-5', old, old);

      db.close();

      const sessions = readOpencodeSessionsFromDb(dbPath, new Date('2026-06-01'));
      expect(sessions).toHaveLength(0);
    });

    it('extracts message snippets from session_message data', () => {
      const { dbPath, db } = makeTestDb();
      const now = Date.now();

      db.prepare(`
        INSERT INTO session (id, project_id, slug, directory, title, version, cost, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, model, time_created, time_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('s2', 'p1', 's-2', '/Users/me/proj', 'Test', '1.0', 0.1, 100, 20, 0, 0, 'claude-haiku-4-5', now - 1000, now);

      db.prepare(`
        INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('m1', 's2', 'user', 0, now - 2000, now, JSON.stringify({ role: 'user', parts: [{ type: 'text', text: 'Explain recursion' }] }));

      db.prepare(`
        INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('m2', 's2', 'assistant', 1, now - 1000, now, JSON.stringify({ role: 'assistant', parts: [{ type: 'text', text: 'Recursion is...' }] }));

      db.close();

      const sessions = readOpencodeSessionsFromDb(dbPath, new Date('2026-01-01'));
      expect(sessions[0].messages).toHaveLength(2);
      expect(sessions[0].messages[0].role).toBe('user');
      expect(sessions[0].messages[0].text).toBe('Explain recursion');
      expect(sessions[0].messages[1].role).toBe('assistant');
      expect(sessions[0].messages[1].text).toBe('Recursion is...');
    });
  });
});
