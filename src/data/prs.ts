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

interface CheckRun {
  conclusion: string | null;
  status: string;
}

interface RawPrDetail {
  number: number;
  title: string;
  url: string;
  reviewDecision: string | null;
  statusCheckRollup: CheckRun[] | null;
  updatedAt: string;
  headRefName: string;
}

interface SearchResult {
  number: number;
  repository: { name: string; nameWithOwner: string };
  url: string;
}

function deriveChecks(rollup: CheckRun[] | null): { passed: boolean; failed: boolean; pending: boolean } {
  if (!rollup || rollup.length === 0) return { passed: false, failed: false, pending: false };
  const conclusions = rollup.map(c => c.conclusion?.toUpperCase());
  if (conclusions.some(c => c === 'FAILURE' || c === 'TIMED_OUT' || c === 'CANCELLED')) {
    return { passed: false, failed: true, pending: false };
  }
  if (rollup.some(c => c.status !== 'COMPLETED')) {
    return { passed: false, failed: false, pending: true };
  }
  return { passed: true, failed: false, pending: false };
}

export function normalizePrItem(raw: RawPrDetail, owner: string, repo: string): PrItem {
  const { passed, failed, pending } = deriveChecks(raw.statusCheckRollup);
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    owner,
    repo,
    decision: (raw.reviewDecision as PrItem['decision']) || 'PENDING',
    checksPassed: passed,
    checksFailed: failed,
    checksPending: pending,
    updatedAt: raw.updatedAt,
    branch: raw.headRefName,
  };
}

function ghExec(cmd: string, env: NodeJS.ProcessEnv): string {
  return execSync(cmd, { encoding: 'utf-8', timeout: 30000, env });
}

/**
 * Parse gh CLI JSON output (from gh search prs) into grouped PRs with full detail.
 * Used for testing with synthetic data — accepts pre-built RawPrDetail objects.
 */
export function parsePrDetails(
  details: Array<RawPrDetail & { owner: string; repo: string }>,
): PrGroup {
  const grouped: PrGroup = {};
  for (const raw of details) {
    const pr = normalizePrItem(raw, raw.owner, raw.repo);
    if (!grouped[pr.repo]) grouped[pr.repo] = [];
    grouped[pr.repo].push(pr);
  }
  for (const repo of Object.keys(grouped)) {
    grouped[repo].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return grouped;
}

/**
 * Fetch open PRs via gh CLI for the current user.
 * Step 1: gh search prs to find all open PRs + their repos (cross-org).
 * Step 2: gh pr list --repo per unique repo to get reviewDecision + statusCheckRollup.
 */
export function fetchOpenPrs(settings: Settings): PrGroup {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (settings.ghProxy) {
    env['HTTPS_PROXY'] = settings.ghProxy;
    env['HTTP_PROXY'] = settings.ghProxy;
  }

  // Step 1: discover all open PRs and their repos
  const searchOut = ghExec(
    'gh search prs --author=@me --state=open --json number,repository,url --limit 100',
    env,
  );
  const searchResults: SearchResult[] = JSON.parse(searchOut.trim());

  if (searchResults.length === 0) return {};

  // Group PR numbers by repo
  const byRepo = new Map<string, { owner: string; repo: string; numbers: number[] }>();
  for (const r of searchResults) {
    const nameWithOwner = r.repository.nameWithOwner;
    if (!byRepo.has(nameWithOwner)) {
      const [owner, repo] = nameWithOwner.split('/');
      byRepo.set(nameWithOwner, { owner, repo, numbers: [] });
    }
    byRepo.get(nameWithOwner)!.numbers.push(r.number);
  }

  // Step 2: per repo, fetch full details with reviewDecision + statusCheckRollup
  const allDetails: Array<RawPrDetail & { owner: string; repo: string }> = [];
  for (const [nameWithOwner, { owner, repo }] of byRepo) {
    try {
      const out = ghExec(
        `gh pr list --repo ${nameWithOwner} --author=@me --state=open --json number,title,url,reviewDecision,statusCheckRollup,updatedAt,headRefName`,
        env,
      );
      const prs: RawPrDetail[] = JSON.parse(out.trim());
      for (const pr of prs) {
        allDetails.push({ ...pr, owner, repo });
      }
    } catch {
      // skip repos we can't access
    }
  }

  return parsePrDetails(allDetails);
}
