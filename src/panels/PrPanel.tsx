import React from 'react';
import { Box, Text } from 'ink';
import type { PrGroup, PrItem } from '../data/prs';

interface PrPanelProps {
  prs: PrGroup;
  loading: boolean;
  error: string | null;
  selectedIndex?: number;
}

function reviewBadge(decision: PrItem['decision']): { symbol: string; color: string } {
  switch (decision) {
    case 'APPROVED': return { symbol: '✅ APPROVED', color: 'green' };
    case 'CHANGES_REQUESTED': return { symbol: '✋ CHANGES', color: 'red' };
    case 'REVIEW_REQUIRED': return { symbol: '⏳ REVIEW', color: 'yellow' };
    default: return { symbol: '○ PENDING', color: 'gray' };
  }
}

function checkBadge(pr: PrItem): { symbol: string; color: string } {
  if (pr.checksFailed) return { symbol: '✖ FAIL', color: 'red' };
  if (pr.checksPending) return { symbol: '◌ PEND', color: 'yellow' };
  if (pr.checksPassed) return { symbol: '✔ PASS', color: 'green' };
  return { symbol: '— N/A', color: 'gray' };
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function PrRow({ pr, selected }: { pr: PrItem; selected: boolean }) {
  const review = reviewBadge(pr.decision);
  const check = checkBadge(pr);
  return (
    <Box flexDirection="row" paddingLeft={2}>
      {selected && <Text color="cyan">▶ </Text>}
      {!selected && <Text>  </Text>}
      <Text bold color={selected ? 'cyan' : undefined}>#{pr.number} </Text>
      <Text>{pr.title.slice(0, 40)}{pr.title.length > 40 ? '…' : ''} </Text>
      <Text color={review.color}>{review.symbol} </Text>
      <Text color={check.color}>{check.symbol} </Text>
      <Text dimColor>{relTime(pr.updatedAt)}</Text>
    </Box>
  );
}

export function PrPanel({ prs, loading, error, selectedIndex = -1 }: PrPanelProps) {
  if (loading) return <Box><Text dimColor>Loading PRs…</Text></Box>;
  if (error) return <Box><Text color="red">Error: {error}</Text></Box>;

  const repos = Object.keys(prs);
  if (repos.length === 0) return <Box><Text dimColor>No open PRs 🎉</Text></Box>;

  const totalPrs = repos.reduce((acc, r) => acc + prs[r].length, 0);
  let globalIndex = 0;

  return (
    <Box flexDirection="column">
      <Text bold>🔀 Open PRs ({totalPrs})</Text>
      {repos.sort().map(repo => (
        <Box key={repo} flexDirection="column" marginTop={1}>
          <Text bold color="yellow">{repo}</Text>
          {prs[repo].map(pr => {
            const idx = globalIndex++;
            return <PrRow key={pr.number} pr={pr} selected={idx === selectedIndex} />;
          })}
        </Box>
      ))}
    </Box>
  );
}
