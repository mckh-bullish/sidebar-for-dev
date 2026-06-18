import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { NormalizedSession } from './sessions/types';

export interface SummaryEntry {
  summary: string;
  hash: string;
}

export type SummaryCache = Record<string, SummaryEntry>;

const DEFAULT_CACHE_PATH = join(homedir(), '.sidebar_for_dev', 'summaries.json');

/** Compute a stable hash over the session's message content */
export function computeContentHash(session: NormalizedSession): string {
  const content = session.messages
    .map(m => `${m.role}:${m.text}`)
    .join('\n');
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Load the summary cache from disk */
export function loadSummaryCache(path = DEFAULT_CACHE_PATH): SummaryCache {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SummaryCache;
  } catch {
    return {};
  }
}

/** Persist the summary cache to disk */
export function saveSummaryCache(cache: SummaryCache, path = DEFAULT_CACHE_PATH): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

/**
 * Return true if session needs to be re-summarized.
 * @param session - The session to check
 * @param cache - Current in-memory cache
 * @param force - Force re-summarization even if hash matches
 */
export function needsResummarization(
  session: NormalizedSession,
  cache: SummaryCache,
  force = false,
): boolean {
  if (force) return true;
  const entry = cache[session.id];
  if (!entry) return true;
  return entry.hash !== computeContentHash(session);
}

/**
 * Summarize a session using claude-haiku-4-5 via LiteLLM proxy.
 * Returns null if the session has no messages.
 */
export async function summarizeSession(
  session: NormalizedSession,
  apiBase: string,
  apiKey: string,
  model: string,
): Promise<string | null> {
  if (session.messages.length === 0) return null;

  // Take up to last 20 messages to stay within context
  const recent = session.messages.slice(-20);
  const transcript = recent
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text.slice(0, 500)}`)
    .join('\n\n');

  const prompt = `Summarize this AI coding session in ONE sentence starting with the project and module. Max 50 words. No headings, labels, or structure.
Format: "Project/Module: [one sentence of what was done]"

Project: ${session.project}

${transcript}`;

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 80,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`LiteLLM summarize API ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content?.trim() ?? null;
}

/**
 * Summarize all sessions that need it (cache miss or content changed).
 * Updates cache in-place and persists after each batch.
 */
export async function summarizeAll(
  sessions: NormalizedSession[],
  cache: SummaryCache,
  apiBase: string,
  apiKey: string,
  model: string,
  force = false,
  cachePath = DEFAULT_CACHE_PATH,
): Promise<SummaryCache> {
  const toSummarize = sessions.filter(s => needsResummarization(s, cache, force));

  for (const session of toSummarize) {
    try {
      const summary = await summarizeSession(session, apiBase, apiKey, model);
      if (summary) {
        cache[session.id] = { summary, hash: computeContentHash(session) };
      }
    } catch {
      // Non-fatal: keep old summary if available
    }
  }

  saveSummaryCache(cache, cachePath);
  return cache;
}
