import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import type { NormalizedSession, SessionSnippet } from './types';
import { calculateCost } from '../../pricing';
import { loadConfig } from '../../config';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: unknown) => typeof b === 'object' && b !== null && (b as { type: string }).type === 'text')
      .map((b: unknown) => (b as { text: string }).text)
      .join('');
  }
  return '';
}

/**
 * Decode the project directory name back to a filesystem path.
 * Claude encodes paths by replacing / with -.
 * e.g. "-Users-me-proj" → "/Users/me/proj"
 */
function decodeProjectPath(dirName: string): string {
  return dirName.replace(/-/g, '/');
}

/**
 * Read all Claude sessions from ~/.claude/projects.
 * @param projectsDir - Override for testing
 * @param cutoff - Only return sessions with activity after this date
 */
export function readClaudeSessions(
  projectsDir = CLAUDE_PROJECTS_DIR,
  cutoff: Date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  modelPricing = loadConfig().modelPricing,
): NormalizedSession[] {
  const sessions: NormalizedSession[] = [];

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(projectsDir);
  } catch {
    return [];
  }

  for (const projectDir of projectDirs) {
    const projectPath = join(projectsDir, projectDir);
    const project = decodeProjectPath(projectDir);

    let sessionFiles: string[];
    try {
      sessionFiles = readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of sessionFiles) {
      const filePath = join(projectPath, file);
      const sessionId = basename(file, '.jsonl');

      let raw: string;
      try {
        raw = readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = raw.trim().split('\n').filter(Boolean);
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let cacheWriteTokens = 0;
      let cost = 0;
      let model = '';
      let lastActivity: Date | null = null;
      const messages: SessionSnippet[] = [];

      for (const line of lines) {
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }

        const ts = entry['timestamp'] ? new Date(entry['timestamp'] as string) : null;

        if (entry['type'] === 'assistant') {
          const msg = entry['message'] as Record<string, unknown>;
          if (!msg) continue;

          const usage = msg['usage'] as Record<string, number> | null;
          if (usage) {
            inputTokens += usage['input_tokens'] ?? 0;
            outputTokens += usage['output_tokens'] ?? 0;
            cacheReadTokens += usage['cache_read_input_tokens'] ?? 0;
            cacheWriteTokens += usage['cache_creation_input_tokens'] ?? 0;
          }

          if (!model && typeof msg['model'] === 'string') {
            model = msg['model'];
          }

          if (ts && (!lastActivity || ts > lastActivity)) lastActivity = ts;

          messages.push({
            role: 'assistant',
            text: extractTextContent(msg['content']),
            timestamp: ts ?? new Date(0),
          });
        } else if (entry['type'] === 'user') {
          const msg = entry['message'] as Record<string, unknown>;
          if (!msg) continue;
          if (ts && (!lastActivity || ts > lastActivity)) lastActivity = ts;
          messages.push({
            role: 'user',
            text: extractTextContent(msg['content']),
            timestamp: ts ?? new Date(0),
          });
        }
      }

      // If no messages at all, skip (empty session stub)
      if (messages.length === 0) continue;

      // Fallback: use file mtime if no timestamps in content
      if (!lastActivity) {
        try {
          lastActivity = statSync(filePath).mtime;
        } catch {
          lastActivity = new Date(0);
        }
      }

      if (lastActivity < cutoff) continue;

      // Claude Code never records costUSD — always calculate from tokens
      cost = calculateCost(inputTokens, outputTokens, modelPricing, model || 'unknown', null, cacheReadTokens, cacheWriteTokens);
      // Show total input (base + cache) for informational display
      const totalInputTokens = inputTokens + cacheReadTokens + cacheWriteTokens;

      sessions.push({
        id: sessionId,
        tool: 'claude',
        project,
        lastActivity,
        inputTokens: totalInputTokens,
        outputTokens,
        cost,
        costRecorded: false,
        model: model || 'unknown',
        messages,
      });
    }
  }

  return sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}
