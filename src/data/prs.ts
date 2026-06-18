import { execSync } from 'node:child_process';
import type { Settings } from '../config';

export interface PrItem {
  number: number;
  title: string;
  url: string;
  repo: string;
  owner: string;
  decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | 'PENDING';
  checksPassed: boolean;
  checksFailed: boolean;
  checksPending: boolean;
  updatedAt: string;
  branch: string;
}

export type PrGroup = Record<string, PrItem[]>;

interface RawPr {
  number: number;
  title: string;
  url: string;
  repositoryUrl: string;
  reviewDecision: string | null;
  statusCheckRollup: { status: string; conclusion: string } | null;
  updatedAt: string;
  headRefName: string;
}

/** Extract repo owner/name from GitHub URL */
function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/** Normalize raw PR JSON into structured PrItem */
export function normalizePrItem(raw: RawPr): PrItem {
  const { owner, repo } = parseRepoUrl(raw.repositoryUrl) ?? { owner: '?', repo: '?' };

  let checksPassed = false;
  let checksFailed = false;
  let checksPending = false;

  if (raw.statusCheckRollup) {
    if (raw.statusCheckRollup.conclusion === 'SUCCESS') {
      checksPassed = true;
    } else if (raw.statusCheckRollup.conclusion === 'FAILURE') {
      checksFailed = true;
    } else {
      checksPending = true;
    }
  }

  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    owner,
    repo,
    decision: (raw.reviewDecision as PrItem['decision']) ?? 'PENDING',
    checksPassed,
    checksFailed,
    checksPending,
    updatedAt: raw.updatedAt,
    branch: raw.headRefName,
  };
}

/**
 * Parse gh CLI JSON output into grouped PRs.
 * Groups by repo name, sorted by updatedAt descending within each group.
 */
export function parsePrOutput(json: string): PrGroup {
  const raw: RawPr[] = JSON.parse(json);
  const items = raw.map(normalizePrItem);
  const grouped: PrGroup = {};

  for (const pr of items) {
    if (!grouped[pr.repo]) grouped[pr.repo] = [];
    grouped[pr.repo].push(pr);
  }

  // Sort each group by updatedAt descending
  for (const repo of Object.keys(grouped)) {
    grouped[repo].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  return grouped;
}

/**
 * Fetch open PRs via gh CLI for the current user.
 * Requires gh CLI installed and authenticated.
 */
export function fetchOpenPrs(settings: Settings): PrGroup {
  const proxy = settings.ghProxy;
  const env = proxy ? `HTTPS_PROXY=${proxy} HTTP_PROXY=${proxy}` : '';

  try {
    const output = execSync(
      `${env} gh search prs --author=@me --state=open --json number,title,url,repositoryUrl,reviewDecision,statusCheckRollup,updatedAt,headRefName --limit 100 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30000 },
    );

    return parsePrOutput(output.trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`gh CLI failed: ${msg}`);
  }
}
