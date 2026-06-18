import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import type { NormalizedSession, SessionSnippet } from './types';

const PI_SESSIONS_DIR = join(homedir(), '.pi', 'agent', 'sessions');

/**
 * Decode pi directory name back to project path.
 * Pi encodes cwd as "--<path-with-dashes>--"
 * We use the cwd from the SessionHeader instead.
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('');
  }
  return '';
}

/**
 * Read all pi sessions from ~/.pi/agent/sessions.
 * @param sessionsDir - Override for testing
 * @param cutoff - Only return sessions with activity after this date
 */
export function readPiSessions(
  sessionsDir = PI_SESSIONS_DIR,
  cutoff: Date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
): NormalizedSession[] {
  const sessions: NormalizedSession[] = [];

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(sessionsDir);
  } catch {
    return [];
  }

  for (const projectDir of projectDirs) {
    const projectPath = join(sessionsDir, projectDir);
    let sessionFiles: string[];
    try {
      sessionFiles = readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of sessionFiles) {
      const filePath = join(projectPath, file);

      let raw: string;
      try {
        raw = readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = raw.trim().split('\n').filter(Boolean);
      if (lines.length === 0) continue;

      // Parse header (first line)
      let sessionId = basename(file, '.jsonl').split('_').pop() ?? file;
      let cwd = '';

      const header = (() => {
        try { return JSON.parse(lines[0]) as Record<string, unknown>; } catch { return null; }
      })();
      if (header && header['type'] === 'session') {
        sessionId = (header['id'] as string) ?? sessionId;
        cwd = (header['cwd'] as string) ?? '';
      }

      let inputTokens = 0;
      let outputTokens = 0;
      let cost = 0;
      let costRecorded = false;
      let model = '';
      let lastActivity: Date | null = null;
      const messages: SessionSnippet[] = [];

      for (const line of lines.slice(1)) {
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (entry['type'] !== 'message') continue;

        const msg = entry['message'] as Record<string, unknown> | null;
        if (!msg) continue;

        const ts = entry['timestamp'] ? new Date(entry['timestamp'] as string) : null;
        if (ts && (!lastActivity || ts > lastActivity)) lastActivity = ts;

        const role = msg['role'] as string;

        if (role === 'assistant') {
          const usage = msg['usage'] as {
            input: number; output: number; cacheRead: number; cacheWrite: number;
            totalTokens: number; cost?: { total: number };
          } | null;

          if (usage) {
            inputTokens += usage.input ?? 0;
            outputTokens += usage.output ?? 0;
            if (usage.cost?.total !== undefined) {
              cost += usage.cost.total;
              costRecorded = true;
            }
          }

          if (!model && typeof msg['model'] === 'string') {
            model = msg['model'];
          }

          messages.push({
            role: 'assistant',
            text: extractTextContent(msg['content']),
            timestamp: ts ?? new Date(0),
          });
        } else if (role === 'user') {
          messages.push({
            role: 'user',
            text: extractTextContent(msg['content']),
            timestamp: ts ?? new Date(0),
          });
        }
      }

      // Skip empty sessions
      if (messages.length === 0) continue;

      const activity = lastActivity ?? new Date(0);
      if (activity < cutoff) continue;

      sessions.push({
        id: sessionId,
        tool: 'pi',
        project: cwd,
        lastActivity: activity,
        inputTokens,
        outputTokens,
        cost,
        costRecorded,
        model: model || 'unknown',
        messages,
      });
    }
  }

  return sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}
