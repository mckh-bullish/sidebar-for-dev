import { describe, it, expect } from 'vitest';
import { normalizePrItem, parsePrDetails } from './prs';

describe('prs', () => {
  describe('normalizePrItem', () => {
    it('extracts review decision and check status from raw detail', () => {
      const raw = {
        number: 42,
        title: 'fix: something',
        url: 'https://github.com/org/repo/pull/42',
        reviewDecision: 'APPROVED',
        statusCheckRollup: [
          { conclusion: 'SUCCESS', status: 'COMPLETED' },
          { conclusion: 'SUCCESS', status: 'COMPLETED' },
        ],
        updatedAt: '2026-06-18T10:00:00Z',
        headRefName: 'feature/xyz',
      };

      const pr = normalizePrItem(raw, 'org', 'repo');
      expect(pr.number).toBe(42);
      expect(pr.title).toBe('fix: something');
      expect(pr.repo).toBe('repo');
      expect(pr.owner).toBe('org');
      expect(pr.decision).toBe('APPROVED');
      expect(pr.checksPassed).toBe(true);
      expect(pr.checksPending).toBe(false);
      expect(pr.checksFailed).toBe(false);
    });

    it('handles null reviewDecision as PENDING', () => {
      const raw = {
        number: 1, title: 'WIP', url: 'https://github.com/a/b/pull/1',
        reviewDecision: null, statusCheckRollup: null,
        updatedAt: '2026-06-18T10:00:00Z', headRefName: 'main',
      };
      const pr = normalizePrItem(raw, 'a', 'b');
      expect(pr.decision).toBe('PENDING');
      expect(pr.checksFailed).toBe(false);
      expect(pr.checksPassed).toBe(false);
    });

    it('detects check failures from any FAILURE conclusion', () => {
      const raw = {
        number: 2, title: 'test', url: 'https://github.com/a/b/pull/2',
        reviewDecision: null,
        statusCheckRollup: [
          { conclusion: 'SUCCESS', status: 'COMPLETED' },
          { conclusion: 'FAILURE', status: 'COMPLETED' },
        ],
        updatedAt: '2026-06-18T10:00:00Z', headRefName: 'main',
      };
      const pr = normalizePrItem(raw, 'a', 'b');
      expect(pr.checksFailed).toBe(true);
    });

    it('detects pending when any check is not COMPLETED', () => {
      const raw = {
        number: 3, title: 'pending', url: 'https://github.com/a/b/pull/3',
        reviewDecision: null,
        statusCheckRollup: [
          { conclusion: null, status: 'IN_PROGRESS' },
        ],
        updatedAt: '2026-06-18T10:00:00Z', headRefName: 'main',
      };
      const pr = normalizePrItem(raw, 'a', 'b');
      expect(pr.checksPending).toBe(true);
      expect(pr.checksFailed).toBe(false);
    });
  });

  describe('parsePrDetails', () => {
    it('groups PRs by repo and sorts by updatedAt desc', () => {
      const details = [
        {
          number: 1, title: 'a', url: 'https://github.com/org/repo/pull/1',
          reviewDecision: 'APPROVED', statusCheckRollup: null,
          updatedAt: '2026-06-17T10:00:00Z', headRefName: 'main',
          owner: 'org', repo: 'repo',
        },
        {
          number: 2, title: 'b', url: 'https://github.com/org/repo/pull/2',
          reviewDecision: 'CHANGES_REQUESTED', statusCheckRollup: null,
          updatedAt: '2026-06-18T10:00:00Z', headRefName: 'main',
          owner: 'org', repo: 'repo',
        },
        {
          number: 3, title: 'c', url: 'https://github.com/org/other/pull/3',
          reviewDecision: null, statusCheckRollup: null,
          updatedAt: '2026-06-16T10:00:00Z', headRefName: 'main',
          owner: 'org', repo: 'other',
        },
      ];

      const result = parsePrDetails(details);
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['repo']).toHaveLength(2);
      expect(result['repo'][0].updatedAt).toBe('2026-06-18T10:00:00Z');
      expect(result['repo'][1].updatedAt).toBe('2026-06-17T10:00:00Z');
      expect(result['other']).toHaveLength(1);
    });

    it('returns empty object for empty input', () => {
      expect(parsePrDetails([])).toEqual({});
    });
  });
});
