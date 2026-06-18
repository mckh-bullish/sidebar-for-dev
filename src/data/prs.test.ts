import { describe, it, expect } from 'vitest';
import { parsePrOutput, normalizePrItem } from './prs';

describe('prs', () => {
  describe('normalizePrItem', () => {
    it('extracts review decision and check status from raw GH output', () => {
      const raw = {
        number: 42,
        title: 'fix: something',
        url: 'https://github.com/org/repo/pull/42',
        repositoryUrl: 'https://github.com/org/repo',
        reviewDecision: 'APPROVED',
        statusCheckRollup: { status: 'COMPLETED', conclusion: 'SUCCESS' },
        updatedAt: '2026-06-18T10:00:00Z',
        headRefName: 'feature/xyz',
      };

      const pr = normalizePrItem(raw);
      expect(pr.number).toBe(42);
      expect(pr.title).toBe('fix: something');
      expect(pr.repo).toBe('repo');
      expect(pr.owner).toBe('org');
      expect(pr.decision).toBe('APPROVED');
      expect(pr.checksPassed).toBe(true);
      expect(pr.checksPending).toBe(false);
      expect(pr.checksFailed).toBe(false);
    });

    it('handles no review yet', () => {
      const raw = {
        number: 1,
        title: 'WIP',
        url: 'https://github.com/a/b/pull/1',
        repositoryUrl: 'https://github.com/a/b',
        reviewDecision: null,
        statusCheckRollup: null,
        updatedAt: '2026-06-18T10:00:00Z',
        headRefName: 'main',
      };
      const pr = normalizePrItem(raw);
      expect(pr.decision).toBe('PENDING');
      expect(pr.checksFailed).toBe(false);
    });

    it('detects check failures', () => {
      const raw = {
        number: 2,
        title: 'test',
        url: 'https://github.com/a/b/pull/2',
        repositoryUrl: 'https://github.com/a/b',
        reviewDecision: null,
        statusCheckRollup: { status: 'COMPLETED', conclusion: 'FAILURE' },
        updatedAt: '2026-06-18T10:00:00Z',
        headRefName: 'main',
      };
      const pr = normalizePrItem(raw);
      expect(pr.checksFailed).toBe(true);
    });
  });

  describe('parsePrOutput', () => {
    it('parses gh CLI JSON output into array', () => {
      const json = JSON.stringify([
        {
          number: 1,
          title: 'test',
          url: 'https://github.com/x/y/pull/1',
          repositoryUrl: 'https://github.com/x/y',
          reviewDecision: 'APPROVED',
          statusCheckRollup: { status: 'COMPLETED', conclusion: 'SUCCESS' },
          updatedAt: '2026-06-18T10:00:00Z',
          headRefName: 'main',
        },
      ]);

      const result = parsePrOutput(json);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['y'][0].number).toBe(1);
      expect(result['y'][0].repo).toBe('y');
    });

    it('groups PRs by repo', () => {
      const json = JSON.stringify([
        {
          number: 1,
          title: 'a',
          url: 'https://github.com/org/repo/pull/1',
          repositoryUrl: 'https://github.com/org/repo',
          reviewDecision: 'APPROVED',
          statusCheckRollup: null,
          updatedAt: '2026-06-17T10:00:00Z',
          headRefName: 'main',
        },
        {
          number: 2,
          title: 'b',
          url: 'https://github.com/org/repo/pull/2',
          repositoryUrl: 'https://github.com/org/repo',
          reviewDecision: 'CHANGES_REQUESTED',
          statusCheckRollup: { status: 'PENDING', conclusion: null },
          updatedAt: '2026-06-18T10:00:00Z',
          headRefName: 'main',
        },
        {
          number: 3,
          title: 'c',
          url: 'https://github.com/org/other/pull/3',
          repositoryUrl: 'https://github.com/org/other',
          reviewDecision: null,
          statusCheckRollup: null,
          updatedAt: '2026-06-16T10:00:00Z',
          headRefName: 'main',
        },
      ]);

      const result = parsePrOutput(json);
      // 2 repos
      expect(Object.keys(result)).toHaveLength(2);

      // repo: 2 PRs
      expect(result['repo']).toHaveLength(2);
      // sorted desc by updatedAt
      expect(result['repo'][0].updatedAt).toBe('2026-06-18T10:00:00Z');
      expect(result['repo'][1].updatedAt).toBe('2026-06-17T10:00:00Z');

      // other: 1 PR
      expect(result['other']).toHaveLength(1);
    });
  });
});
