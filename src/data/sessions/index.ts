import type { NormalizedSession } from './types';

export type { NormalizedSession };

const DEFAULT_CUTOFF = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

/**
 * Merge sessions from all three tools, filter by cutoff, sort descending by lastActivity.
 */
export function mergeSessions(
  claude: NormalizedSession[],
  pi: NormalizedSession[],
  opencode: NormalizedSession[],
  cutoff: Date = DEFAULT_CUTOFF,
): NormalizedSession[] {
  return [...claude, ...pi, ...opencode]
    .filter(s => s.lastActivity >= cutoff)
    .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}
