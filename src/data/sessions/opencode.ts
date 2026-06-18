import { join } from 'node:path';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
import { homedir } from 'node:os';
import type { NormalizedSession, SessionSnippet } from './types';

const OPENCODE_DB_PATH = join(homedir(), '.local', 'share', 'opencode', 'opencode.db');

interface SessionRow {
  id: string;
  project_id: string;
  directory: string;
  title: string;
  cost: number;
  tokens_input: number;
  tokens_output: number;
  model: string | null;
  time_created: number;
  time_updated: number;
  time_archived: number | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  type: string;
  seq: number;
  time_created: number;
  data: string;
}

interface MessageData {
  role?: string;
  parts?: Array<{ type: string; text?: string }>;
  content?: string | Array<{ type: string; text?: string }>;
}

function extractText(data: MessageData): string {
  // opencode uses "parts" array
  if (data.parts && Array.isArray(data.parts)) {
    return data.parts
      .filter(p => p.type === 'text')
      .map(p => p.text ?? '')
      .join('');
  }
  // fallback to content
  if (typeof data.content === 'string') return data.content;
  if (Array.isArray(data.content)) {
    return data.content
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('');
  }
  return '';
}

/**
 * Read opencode sessions from a SQLite database file.
 * @param dbPath - Path to opencode.db
 * @param cutoff - Only return sessions with time_updated after this date
 */
export function readOpencodeSessionsFromDb(
  dbPath = OPENCODE_DB_PATH,
  cutoff: Date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
): NormalizedSession[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Database = _require('better-sqlite3') as typeof import('better-sqlite3');

  let db: import('better-sqlite3').Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return [];
  }

  try {
    const cutoffMs = cutoff.getTime();

    const sessionRows = db.prepare<[number], SessionRow>(`
      SELECT id, project_id, directory, title, cost, tokens_input, tokens_output,
             model, time_created, time_updated, time_archived
      FROM session
      WHERE time_archived IS NULL
        AND time_updated >= ?
      ORDER BY time_updated DESC
    `).all(cutoffMs) as SessionRow[];

    const sessions: NormalizedSession[] = [];

    for (const row of sessionRows) {
      const messageRows = db.prepare<[string], MessageRow>(`
        SELECT id, session_id, type, seq, time_created, data
        FROM session_message
        WHERE session_id = ?
        ORDER BY seq ASC
      `).all(row.id) as MessageRow[];

      const messages: SessionSnippet[] = [];
      for (const msg of messageRows) {
        let data: MessageData;
        try {
          data = JSON.parse(msg.data) as MessageData;
        } catch {
          continue;
        }

        const role = data.role;
        if (role !== 'user' && role !== 'assistant') continue;

        messages.push({
          role: role as 'user' | 'assistant',
          text: extractText(data),
          timestamp: new Date(msg.time_created),
        });
      }

      sessions.push({
        id: row.id,
        tool: 'opencode',
        project: row.directory,
        lastActivity: new Date(row.time_updated),
        inputTokens: row.tokens_input,
        outputTokens: row.tokens_output,
        cost: row.cost,
        costRecorded: true,
        model: row.model ?? 'unknown',
        messages,
      });
    }

    return sessions;
  } finally {
    db.close();
  }
}
